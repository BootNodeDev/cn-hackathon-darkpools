# Dark Pool Architecture

This document is the design deep-dive for the `cn-dark-pool-contracts` Daml
package. It assumes familiarity with Daml templates, choices, and Canton's
per-party data model. The production code is in `daml/dark-pool/daml/`:
`DarkPool.daml` (templates) and `DarkPool/Math.daml` (pure arithmetic).

## Parties and trust

Three kinds of party take part:

- **The venue.** The operator of a `DarkPool`. It chooses which resting orders to
  pair and submits the matching transaction. It is the signatory of the pool and
  the observer of every order.
- **Traders.** Each places `Order` contracts and signs them. A trader is the only
  party, besides the venue, that can see its own orders.
- **Registries.** The token issuers. Each instrument is administered by a registry
  party that signs holdings and implements the token-standard `AllocationFactory`
  and `Allocation` interfaces. Amulet is one such registry; the test suite also
  builds a self-contained `TestToken` registry.

The irreducible trust assumptions of the design are narrow. The venue is trusted
for liveness (it must actually run matches) and for matching policy (which pairs,
in what order). It is not trusted for price formation or for the terms of a
trade: the price is the on-ledger midpoint, the traded instruments are bound into
the trader-signed order, and every numeric bound is enforced inside
trader-signed choices. The worst a misbehaving venue can do is produce a
correctly-bounded allocation, which the sender can always reclaim with the
token-standard `Allocation_Withdraw` choice. Traders can always cancel a resting
order.

### The v1 co-hosted custody shift

v1 runs co-hosted: the venue operator and all traders share one validator. This
is what lets funding holdings be carried on the order without disclosing them to
the venue off-ledger (the venue's participant already hosts the trader parties).
The cost is a custody trust shift: a hosting participant controls its
non-external parties, so under co-hosting the venue operator is additionally
trusted for custody. This is the v1 simplification, accepted to ship a working
venue. The trust-minimized own-validator topology removes it and is described
under Deployment topologies below.

## Templates

### `DarkPool`

One trading pair operated by one venue.

Fields:

- `venue : Party`, the sole signatory.
- `poolId : Text`, the pair identifier.
- `base : InstrumentId`, `quote : InstrumentId`, the traded pair. The `ensure`
  clause requires `base /= quote` and `minFillFloor > 0.0`.
- `minFillFloor : Decimal`, the anti-dust threshold every order must meet.

Choices:

- `DarkPool_PlaceOrder` (nonconsuming, controller the trader). The token-standard
  factory idiom: a nonconsuming choice on the venue-signed pool, exercised by the
  trader, so the body runs with `{venue, trader}` authority and the venue needs no
  liveness at placement. It validates the declared funding (see Funding below) and
  copies `poolId`, `base`, and `quote` from the pool onto the new `Order`, so the
  order is pool-consistent and adequately funded from birth.
- `DarkPool_Match` (nonconsuming, controller the venue). The atomic match and
  settle, detailed in The Match transaction below. Nonconsuming, so the pool is a
  stable singleton anchoring many matches; archiving the pool pauses matching
  while leaving resting orders untouched.

### `Order`

A dark resting limit order. Its only stakeholders are the trader (signatory) and
the venue (observer); that pair is the entire privacy mechanism. The `ensure`
clause requires `quantity > 0.0`, `limitPrice > 0.0`, `minFill > 0.0`,
`minFill <= quantity`, and `base /= quote`.

Fields:

- `trader : Party` (signatory), `venue : Party` (observer).
- `poolId : Text`, `base : InstrumentId`, `quote : InstrumentId`. The instruments
  are trader-signed, so a venue exercising the fill choice can never re-point the
  order at a different pair.
- `side : Side` (`Buy` or `Sell` of the base), `quantity : Decimal` (remaining
  base size), `limitPrice : Decimal` (quote per base), `minFill : Decimal`
  (smallest acceptable fill, doubling as the dust guard), `expiresAt : Optional
  Time`.
- `holdingCids : [ContractId Holding]`, the trader-signed funding set, fixed at
  placement (co-hosted v1).

Choices:

- `Order_Cancel` (controller trader). Cancels (archives) the resting order.
- `Order_Reject` (controller venue). Venue housekeeping for expired or unfundable
  orders. The trader is the signatory, so the archival is always witnessed; a
  rejection is never silent.
- `Order_Fill` (controller venue). The venue-delegated fill, running with
  `{trader, venue}` authority. It re-checks everything the venue supplies against
  the signed order terms (not expired, counterparty differs, fill within bounds,
  price within the limit, sent amount positive), builds the
  `AllocationSpecification`, exercises the registry's `AllocationFactory_Allocate`
  as the sender, creates the remainder order if any, and creates the
  `FillAuthority`. It returns a `FillResult` (`allocationCid`,
  `fillAuthorityCid`, `remainderOrderCid`).

### `FillAuthority`

A transient authority vehicle, created and consumed inside one Match transaction.
Signed by `{trader, venue}`. It exists solely to chain the two traders'
authorities together for settlement without either trader becoming an informee of
the other's fill subtree.

Fields: `trader : Party`, `venue : Party` (the two signatories), `allocationCid :
ContractId Allocation`, `spec : AllocationSpecification` (this leg as built and
validated by `Order_Fill`).

Choices:

- `FillAuthority_Settle` (controller venue). Exercised on one leg's authority; it
  reaches across to the other.
- `FillAuthority_SettleWith` (controller `venue` and `actorTrader`). Validates
  that the two legs mirror each other (same settlement, swapped sender and
  receiver, distinct senders, distinct transfer-leg ids) and that each allocation
  matches its spec, then exercises both `Allocation_ExecuteTransfer`s.

## The Match transaction, stage by stage

`DarkPool_Match` runs as one transaction with no intermediate ledger state.

1. **Validate.** Fetch both orders. Assert pool membership (venue, poolId, base,
   quote), opposite sides, no self-match, that both meet the pool floor, and that
   the deadlines are ordered around now (`requestedAt <= now < allocateBefore <=
   settleBefore`). Assert the limits cross.
2. **Price and size.** Compute `execPrice = midpointPrice buyLimit sellLimit` and
   `fillQty = fillQuantity buyQty sellQty` (the smaller order). Assert the fill
   satisfies both minimum fills. Build the shared `SettlementInfo` with the venue
   as executor and a `settlementRef` of `poolId <> ":" <> matchId` anchored to the
   pool cid.
3. **Stage 1: two sibling fill subtrees.** Exercise `Order_Fill` on the buy order,
   then on the sell order. These are sibling subtrees: trader A is not an informee
   of anything in trader B's subtree, so B's remainder order stays hidden from A.
   Each fill allocates the sender's leg through the registry factory and creates
   that leg's `FillAuthority`.
4. **Stage 2: joint settlement.** Exercise `FillAuthority_Settle` on the buy leg's
   authority, passing the sell leg's authority cid; it reaches across via
   `FillAuthority_SettleWith` and executes both transfers in the innermost node.

The authority at each node:

```text
node                          authority inside the body
DarkPool_Match                {venue}
  Order_Fill (buy)            {buyer, venue}
    AllocationFactory_Allocate  registry impl under sender authority
  Order_Fill (sell)           {seller, venue}
  FillAuthority_Settle        {buyer, venue}
    FillAuthority_SettleWith  {seller, venue} + actors {venue, buyer} = all three
      Allocation_ExecuteTransfer x2   controllers {executor, sender, receiver}
```

The point of the chain is the innermost node. `Allocation_ExecuteTransfer`'s
controller set is `[executor, sender, receiver]`, all three at once, and the
venue alone never holds it. Authority in Daml does not accumulate down a
transaction tree: it is exactly the contract's signatories plus the choice's
controllers at each node. So the chain assembles the three parties deliberately.
`FillAuthority_Settle` runs with `{buyer, venue}` (the buy leg's signatories).
It exercises `FillAuthority_SettleWith` on the sell leg with `actorTrader =
buyer`, so inside that node the authority is the sell leg's signatories
`{seller, venue}` plus the actors `{venue, buyer}`, which is all three. That is
exactly the controller set both transfers need.

### Why naive nesting would leak the book

The obvious implementation, settling leg B directly inside leg A's fill subtree,
would make trader A an informee of B's subtree (and vice versa). Each trader
would then witness the other's remainder order, the other's allocation, and the
other's funding, which is precisely the book leak a dark pool must avoid. The two
sibling stage-1 subtrees keep each fill private to its own trader and the venue.
Settlement is then assembled in stage 2 through the transient `FillAuthority`
contracts, whose only informees are the three settlement parties (plus each leg's
registry admin). That three-party node is the "open settlement": the trade is
public to exactly the parties to it, and nobody learns the resting book.

## Funding (co-hosted v1)

Holding cids are carried on the order (`holdingCids`). `DarkPool_PlaceOrder`
validates the declared set on the ledger at placement, fetching each holding's
view and asserting:

- the trader meets the pool floor (`minFill >= minFillFloor`),
- every holding is owned by the trader,
- every holding is the side's funding instrument (`Sell` is funded in `base`,
  `Buy` in `quote`),
- no declared holding is locked (`lock == None`),
- the declared total covers the worst-case requirement: `quantity` of base for a
  sell, or `buyFundingTarget quantity limitPrice` of quote for a buy.

`buyFundingTarget` is the quote owed at the trader's own limit price
(`quoteAmount quantity limitPrice`); the midpoint can only be at or below the
buyer's limit and `quoteAmount` is monotone in price, so this is a true upper
bound on what any matching fill can require.

At fill time the whole declared set is passed to the registry factory.
`AllocationFactory_Allocate` archives all of it and returns a single change
holding, which is bound into the remainder order (`holdingCids =
senderChangeCids`). Because the worst-case bound held for the full quantity, it
keeps holding for the smaller remaining quantity after any partial fill (floor
rounding included), so the single change holding self-funds the remainder with no
re-selection and no re-disclosure. The bound carries through every partial fill.

If a trader moves a declared holding out from under a resting order, the next
match fails closed on the now-inactive input. There is no venue-side refresh in
v1: the trader cancels the stale order and re-places with fresh funding. This is
the accepted v1 staleness trade-off; nothing is ever locked while an order rests,
so failing closed loses nothing.

Co-hosting removes trader-holding disclosure entirely. The only disclosures that
travel with a match or fill submission are registry-context disclosures: the
factory contract and, for Amulet, its config-state contract.

## Rounding

All settlement amounts round down. `floorTo10` floors an exact scale-20 value to
ten decimal places by taking the half-even cast and stepping one tick down if it
overshot. Rounding down (never up) keeps the direction deterministic and
conservative: the buyer's sent quote amount is shaved, never padded.

`midpointPrice` is `floorTo10 ((buyLimit + sellLimit) / 2)`. The buyer's sent
amount is `quoteAmount fillQty execPrice = floorTo10 (fillQty * execPrice)`. The
seller sends the base quantity itself (`sentAmount Sell = fillQty`), which is not
a derived product and so is not re-rounded.

## Privacy

| Contract / data | Who sees it |
| --- | --- |
| A resting `Order` | its trader and the venue |
| A remainder `Order` | the trader it belongs to and the venue |
| The counterparty's order or remainder | nobody on the other side |
| A `FillAuthority` and the settlement node | the buyer, the seller, the venue (and each leg's registry admin) |
| The executed transfers | the three settlement parties and the registries |
| Anyone else (an outside party) | nothing |

### IDE-ledger testing caveat

The tests run on the Daml Script IDE ledger, which is a single in-memory store.
Per-party ACS visibility is honestly modeled: a query as party X respects
stakeholder and observer rules, so "party X cannot query Y" is a meaningful
assertion (and the privacy tests use it). What the single-store IDE ledger
cannot model is participant-level data availability and witness sets. Green tests
therefore do not by themselves prove that the disclosure protocol is sufficient
on a real multi-participant Canton network. That property is addressed by
exercising the disclosure protocol deliberately in every test, not by inferring
it from passing assertions.

## Deployment topologies

### v1: co-hosted (current)

Venue and traders share one validator. This removes trader-holding disclosure
(funding holdings ride on the order and the venue's participant already hosts the
trader parties) and is what makes the venue operator custodial for the traders it
hosts. This is the topology the package targets today.

### Trust-minimized: own-validator (deferred)

Each trader runs on its own validator, so the venue operator is no longer
custodial. Funding holdings are not co-hosted, so they must reach the venue
through an off-ledger explicit-disclosure channel: the trader discloses the
holding contracts to the venue out of band, and the venue attaches those
disclosures to the match submission. The match and settlement core (the
two-stage `FillAuthority` chain) is unchanged; only funding and disclosure
differ. This mode is documented as future work.

### Approach 3: two-phase AllocationRequest settlement (deferred escape hatch)

If a registry cannot complete an allocation atomically (it returns a pending
allocation instruction rather than a completed allocation), the single-transaction
atomic flow does not apply. The fallback is a two-phase settlement built on the
token-standard `AllocationRequest` interface: the venue posts a request, each
trader's wallet allocates against it, and settlement happens in a second
transaction. This is the wallet-interoperability alternative. It trades atomicity
for broader registry compatibility and is documented here as a deferred mode, not
implemented in v1.
