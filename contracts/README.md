# cn-dark-pool-contracts

A dark pool trading venue for Canton Network tokens, written in Daml. The order
book is hidden by Canton's per-party visibility, while settlement is open: a
matched pair clears in a single atomic transaction that both prices the trade
and moves the assets. The production package is generic over the Canton
token-standard allocation interfaces: it depends only on those API packages and
imports no Amulet or other registry-specific modules, so any registry that
implements the interfaces can be traded.

## What this is

A "dark pool" is a venue where resting orders are not publicly visible. Here that
darkness is not a policy bolted on top of a public ledger; it is a direct
consequence of how Canton shares data. An `Order` contract names only its trader
and the venue as stakeholders, so no other party, not even the counterparty on
the other side of a fill, can see it. There is no global book to read.

Matching and settlement, by contrast, are deliberately open. When the venue pairs
two crossing orders, the resulting transfers settle atomically in one
transaction. The midpoint price is computed on the ledger, both legs move
together, and any failure rolls the whole thing back. There is no fade window and
no intermediate state held between matching and settlement.

## How it works, in five steps

1. **Place.** A trader places an `Order` through the pool's `DarkPool_PlaceOrder`
   choice, declaring the funding holdings that back it. Placement validates those
   holdings on the ledger (owner, instrument, that they are unlocked, and that
   they cover the worst-case requirement) and copies the pool's instrument pair
   onto the order, so the order is fully pool-consistent and adequately funded
   from birth. The order is visible to the trader and the venue only.
2. **Match.** The venue selects a crossing buy and sell pair and exercises
   `DarkPool_Match`. The cross, the sides, the pool membership, the per-order
   minimum fills, and the deadlines are all checked on the ledger.
3. **Price.** The execution price is the midpoint of the two limit prices,
   computed on the ledger and floored to ten decimal places. The venue never
   supplies the price.
4. **Settle.** Both legs settle atomically through a delegated `FillAuthority`
   authority chain that assembles the buyer, the seller, and the venue together
   for exactly the innermost settlement node. Either both transfers happen or
   neither does.
5. **Re-rest.** If one side is larger, its remainder re-rests as a fresh order,
   self-funded by the change holding the registry returned, with no re-selection
   and no re-disclosure.

## Trust model

The venue is trusted for liveness and for matching policy only: it decides which
orders to pair and when. It is never trusted for price formation or for the terms
of a trade. The price is the on-ledger midpoint, the instruments are bound into
the trader's signed order, and every numeric bound is enforced inside the
trader-signed choices. The worst a misbehaving venue can do is create a
correctly-bounded allocation, which the trader can always reclaim with
`Allocation_Withdraw`. Traders can always cancel a resting order, and can always
recover allocated funds.

The v1 topology is co-hosted: the venue operator and the traders share one
validator. This removes the need to disclose trader holdings to the venue
off-ledger, but it also means the operator's participant hosts the traders'
parties. Stated plainly: under co-hosting the venue operator is additionally
trusted for custody, because a hosting participant controls its non-external
parties. This is the v1 simplification. The trust-minimized topology, where each
trader runs on its own validator, is deferred (see `docs/ARCHITECTURE.md`).

## Repository layout

```text
daml/
  dark-pool/                    production package (token-standard API DARs only)
    daml/DarkPool.daml          DarkPool, Order, FillAuthority templates
    daml/DarkPool/Math.daml     pure pricing, rounding, crossing, fill arithmetic
  dark-pool-test/               Daml Script tests + the TestToken mock registry
  registry-token/               standalone production token registry package
  registry-token-test/          Daml Script tests for registry-token
scripts/                        dependency vendoring and harness build
docs/ARCHITECTURE.md            design deep-dive
docs/registry-token.md          registry-token build and deploy guide
AGENTS.md                       operational guide (toolchain, build, hard rules)
```

### registry-token

`daml/registry-token` is a standalone production package implementing a minimal
token-standard registry (holding + allocation + transfer factories) for the
assets the pools trade. A single admin-signed `Registry` mints and settles every
instrument its admin issues; all choice contexts are trivial, so a backend can
serve the registry surface without an external Scan. Build it with
`npm run build:registry-token`; see `docs/registry-token.md` for deployment.

## Build prerequisites

- `dpm` (the Digital Asset Package Manager), with SDK 3.4.11 installed.
- A JDK, version 17 or newer, on the PATH.

The npm scripts are the canonical build and test entry points (they wrap `dpm`).

| Command | Does |
| --- | --- |
| `npm install` | vendor the dependencies and build the test harness DARs |
| `npm run build` | build all four packages, sequentially |
| `npm run build:dark-pool` | dark-pool production package only (fast loop) |
| `npm run build:registry-token` | registry-token production package only |
| `npm test` | build dark-pool and registry-token, then run both test suites |
| `npm run test:coverage` | run the dark-pool suite with a choice-coverage report. This is the source for the production-choice figure: it filters out `Archive` and `splice` noise, leaving the seven dark-pool business choices (all exercised). A plain `npm test` reports a different, unfiltered number that also counts the test harness templates. |
| `npm run clean` | remove all four .daml build directories |

## License

MIT. See `LICENSE`.
