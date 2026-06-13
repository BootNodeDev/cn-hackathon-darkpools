# Architecture Overview: contracts

Daml smart contracts for the CN Dark Pools venue. Four packages: two production packages (`dark-pool`, `registry-token`) and two test packages (`dark-pool-test`, `registry-token-test`).

For the full design deep-dive (party trust model, the `FillAuthority` settlement chain, funding validation, privacy analysis, and deployment topologies), see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Package Layout

```
daml/
  dark-pool/                    production venue package
    daml/DarkPool.daml          DarkPool, Order, FillAuthority templates
    daml/DarkPool/Math.daml     pure pricing, rounding, crossing, fill arithmetic
  dark-pool-test/               Daml Script tests + TestToken mock registry
  registry-token/               standalone production token registry
    daml/RegistryToken/Holding.daml       RegistryHolding (HoldingV1.Holding)
    daml/RegistryToken/Allocation.daml    RegistryAllocation + recoverToSender
    daml/RegistryToken/Registry.daml      Registry: Mint faucet + AllocationFactory + TransferFactory
  registry-token-test/          Daml Script tests for registry-token
scripts/
  fetch-dep.sh                  vendor Splice sources into deps/
  build-harness.sh              build the harness DARs
docs/
  ARCHITECTURE.md               design deep-dive
  registry-token.md             registry-token build and deploy guide
```

## Production Package Boundaries

| Package | Dependencies | Rule |
|---------|-------------|------|
| `dark-pool` | Token-standard API DARs only (`Splice.Api.Token.*`) | No Amulet or registry-implementation imports. Genericity over token-standard interfaces is the design goal. |
| `registry-token` | Token-standard API DARs only | No Amulet imports. One admin-signed `Registry` per instrument admin. |

Test packages may depend on Amulet (splice-amulet 0.1.19) and the token-standard test harness. Test code must never become a dependency of a production package.

## Templates

### `DarkPool`

One trading pair operated by one venue. Fields: `venue`, `poolId`, `base`, `quote` (instrument pair), `minFillFloor`.

Choices:
- `DarkPool_PlaceOrder` (nonconsuming, controller trader): validates declared funding on-ledger; creates an `Order` pool-consistent from birth.
- `DarkPool_Match` (nonconsuming, controller venue): the atomic match and settle.

### `Order`

A dark resting limit order. Stakeholders: trader (signatory) and venue (observer). That pair is the entire privacy mechanism: no other party, including the counterparty, can see it.

Fields: `trader`, `venue`, `poolId`, `base`, `quote`, `side`, `quantity`, `limitPrice`, `minFill`, `expiresAt`, `holdingCids`.

Choices:
- `Order_Cancel` (controller trader)
- `Order_Reject` (controller venue): housekeeping for expired or unfundable orders
- `Order_Fill` (controller venue): re-validates all terms, builds allocation, creates `FillAuthority` and optional remainder

### `FillAuthority`

Transient authority vehicle created and consumed inside one `DarkPool_Match` transaction. Assembles buyer + seller + venue authority for the innermost settlement node without leaking either trader's fill subtree to the other.

## The Match Transaction

`DarkPool_Match` executes in one atomic transaction:

1. **Validate**: pool membership, opposite sides, no self-match, floor, deadline order, crossing limits.
2. **Price and size**: `execPrice = floorTo10((buyLimit + sellLimit) / 2)`, `fillQty = min(buyQty, sellQty)`. Assert both `minFill` constraints.
3. **Stage 1 (sibling subtrees)**: `Order_Fill` on buy order, then on sell order. Sibling subtrees: trader A is not an informee of trader B's subtree, preserving book privacy.
4. **Stage 2 (joint settlement)**: `FillAuthority_Settle` on the buy leg, reaching across to the sell leg via `FillAuthority_SettleWith`, executing both `Allocation_ExecuteTransfer`s under combined `{buyer, seller, venue}` authority.

## Privacy Model

| Data | Who sees it |
|------|------------|
| A resting or remainder `Order` | Its trader and the venue only |
| The counterparty's order | Neither side |
| A `FillAuthority` and settlement node | Buyer, seller, venue (+ each registry admin) |
| Executed transfers | The three settlement parties + registries |
| Outside parties | Nothing |

## Build Summary

```bash
npm install          # vendor deps + build harness DARs
npm run build        # build all four packages
npm test             # run both Daml Script test suites
```

See [`AGENTS.md`](AGENTS.md) for the full toolchain reference, troubleshooting guide, and Amulet gotchas.
