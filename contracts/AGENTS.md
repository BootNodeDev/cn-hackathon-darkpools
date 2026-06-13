# AGENTS.md

Operational guide for agents working in **cn-dark-pool-contracts**.

## What this repo is

A Daml project implementing a dark pool DvP venue over the Canton token
standard. `daml/` is a container of packages wired by the root
`multi-package.yaml`:

- **`dark-pool`** (`daml/dark-pool/`) - production templates + pure math.
  Depends ONLY on the four token-standard API DARs (holding, metadata,
  allocation, allocation-instruction). No Amulet or other
  registry-implementation imports.
- **`dark-pool-test`** (`daml/dark-pool-test/`) - Daml Script tests. Depends on
  the compiled dark-pool DAR, splice-amulet, and the token-standard test
  harness. Hosts the TestToken mock registry.
- **`registry-token`** (`daml/registry-token/`) - production minimal token
  registry (the assets the pools trade). A separate production package: depends
  only on the token-standard API DARs, ships no daml-script, and is uploaded to
  the validator out of band. One generic template set (`RegistryHolding`,
  `RegistryAllocation`, `Registry`) keyed on `InstrumentId`, so one admin-signed
  `Registry` issues and settles every instrument that admin administers.
- **`registry-token-test`** (`daml/registry-token-test/`) - Daml Script tests
  for `registry-token`. Depends on the compiled `registry-token` DAR and the
  harness (`Splice.Testing.Utils`).

## Code layout & boundaries

| Path | Contents | Boundary |
| --- | --- | --- |
| `daml/dark-pool/daml/DarkPool.daml` | `DarkPool`, `Order`, `FillAuthority` templates (plus `FundingArgs` and result records) | Production. Token-standard API DARs only; no Amulet or registry-implementation imports. |
| `daml/dark-pool/daml/DarkPool/Math.daml` | Pure arithmetic: `Side`, rounding (`floorTo10`), `midpointPrice`, `crosses`, `fillQuantity`, `remainderQuantity`, `sentAmount`, `buyFundingTarget`, `priceWithinLimit` | Production. No ledger effects; exhaustively unit-tested. |
| `daml/registry-token/daml/RegistryToken/Holding.daml` | `RegistryHolding` (implements `HoldingV1.Holding`) | Production. Token-standard API DARs only. |
| `daml/registry-token/daml/RegistryToken/Allocation.daml` | `RegistryAllocation` (implements `AllocationV1.Allocation`) + `recoverToSender` | Production. |
| `daml/registry-token/daml/RegistryToken/Registry.daml` | `Registry`: `Mint` faucet + `AllocationFactory` + `TransferFactory` | Production. |
| `daml/registry-token-test/daml/RegistryToken/Tests/*` | Daml Script suite for registry-token (Setup + per-template tests) | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/Setup.daml` | Fixture: registry init, parties, pool, funding/placement helpers (co-hosted v1) | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/TestToken.daml` | Minimal second registry: `Holding` + `AllocationFactory` + `Allocation` | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/MathTest.daml` | Pure unit tests | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/OrderLifecycleTest.daml` | Order placement, cancel, reject | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/TestTokenRegistryTest.daml` | TestToken allocate/execute round trip | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/FillTest.daml` | Direct `Order_Fill` exercises (incl. adversarial) | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/MatchTest.daml` | Happy paths: TT-TT, CC-TT, partial fills | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/AdversarialTest.daml` | Economics enforcement + adversarial venue bounds + placement validation | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/LifecycleTest.daml` | Cancel/match race, expiry, archived-pool pause, stale-funding fail-closed | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/PrivacyTest.daml` | Book and remainder invisibility (within IDE-ledger semantics) | Test only. |
| `daml/dark-pool-test/daml/DarkPool/Tests/Spikes.daml` | De-risking spikes, kept as regression tests | Test only. |
| `scripts/fetch-dep.sh`, `scripts/build-harness.sh` | Vendor Splice sources into `deps/`; build the harness DARs | Tooling. `deps/` is gitignored. |

The production package namespace is `DarkPool` / `DarkPool.Math`. Tests live under
`DarkPool.Tests.*` in the separate `dark-pool-test` package. The test harness must
NEVER be a dependency of the production package.

## Toolchain

- Use **`dpm`** (not the legacy `daml` assistant). SDK pinned to **3.4.11**,
  LF target **2.1** in both `daml.yaml` files. Do not bump casually: the
  vendored DARs and harness are LF 2.1 builds and embed a daml-script
  package-id only `--target=2.1` resolves.
- JDK 17+ on PATH.

## Build & test (npm scripts are canonical)

| Command | Does |
| --- | --- |
| `npm install` | postinstall: vendor deps + build the harness DARs |
| `npm run build` | build all four packages, sequentially |
| `npm run build:dark-pool` | dark-pool production package only (fast loop) |
| `npm run build:registry-token` | registry-token production package only |
| `npm test` | build dark-pool and registry-token, then run both test suites |
| `npm run test:coverage` | dark-pool production-choice coverage figure (dark-pool only; registry-token has no coverage gate) |
| `npm run clean` | remove all four .daml build dirs |

If you run `dpm` directly: `export LANG=C.UTF-8` first, and build each package
inside its own directory (never at the repo root, never `dpm build --all`).

## Troubleshooting

- Cold builds intermittently fail with a lexical error at `:1:1` under
  `.daml/package-database/`: transient init race, just re-run.
- `lexical error (UTF-8 decoding error)`: you forgot `LANG=C.UTF-8`.
- Fresh clone build failures (`openBinaryFile: does not exist`): deps not
  vendored; run `npm install` or `bash scripts/fetch-dep.sh && bash
  scripts/build-harness.sh`.
- `damlc: ... Did not find end of central directory signature` (or any zip /
  DAR read error) at test/build time: a `dpm build` intermittently writes a
  truncated DAR. It is a transient write flake, NOT real corruption to debug.
  Delete the bad DAR and rebuild: `rm daml/<pkg>/.daml/dist/<pkg>-*.dar` then
  rebuild that package. Never binary-patch a DAR.

## Amulet gotchas

Four facts about the Amulet registry (splice-amulet 0.1.19) that bite when wiring
the match and settlement legs against it:

- **Required context key.** Both `AllocationFactory_Allocate` and
  `Allocation_ExecuteTransfer` need an `ExtraArgs.context` entry under
  `"external-party-config-state"`, an `AV_ContractId` of an
  `ExternalPartyConfigState` contract (read with `getFromContextU`). Omit it and
  the leg fails. The harness `RegistryApi` instance injects it.
- **`allocateBefore` strictly in the future.** Amulet's allocate impl rejects an
  `allocateBefore` that is not strictly after now. In the atomic flow allocate
  and execute happen in one transaction, so this is never the binding constraint,
  but do not loosen the deadline assert: pass a genuinely future value.
- **`settleBefore` maps to the lock expiry.** Allocating creates a `LockedAmulet`
  whose `expiresAt` is `settleBefore`. `Allocation_ExecuteTransfer` re-checks that
  `settleBefore` is still in the future when it runs.
- **The Holding view reports `initialAmount`.** The `Holding` view `amount` is the
  initial amount, not a decayed value, and transfers conserve it (per-round fees
  are zero post-CIP-78). Prefer the harness `checkBalanceApprox` helpers
  (tolerance 1.0) over exact equality in balance assertions.

## Hard rules

- Never hand-edit anything under `deps/`.
- Test harness stays out of the production DAR.
- Production code imports only the token-standard API modules (`Splice.Api.Token.*`),
  never an Amulet or other registry-implementation module; genericity over the
  token-standard interfaces is the point of the design.
- Commits: no `Co-Authored-By` trailers. No em dashes in code, comments, docs,
  or commit messages.
