# Dark Pool Service (`@canton-dappbooster/dark-pool-service`)

Off-ledger backend for the CN Dark Pool: a single Express 5 + TypeScript process that serves the trader/venue REST API, runs a pure matching engine on a schedule, and settles crossing orders on a Canton ledger via the JSON Ledger API v2. The frontend reads live orders, balances, and fills from this service; the matcher pairs crossing orders and settles them atomically on the ledger.

It also runs fully offline in **mock mode** (`DARK_POOL_MOCK=1`) against an in-memory ledger, so the frontend can be developed without a Canton node. 35/35 tests green, typecheck clean. Ships with a `Dockerfile` and a service in the root `docker-compose.yml`.

## 1. Deployment model

- **A Canton ledger over JSON Ledger API v2** hosts the dark-pool venue contracts and a funding/faucet token, with a pool + parties + seed holdings provisioned (the contracts side, [`../contracts/`](../contracts/)). The service reads the addresses (parties, pool, factory, instruments) from the `dark-pool.bootstrap.json` it's pointed at.
- **Custodial, co-hosted:** one bearer token can `actAs` the venue, the token-admin, and the trader parties. `POST /orders` acts as a co-hosted party; reads and `/faucet` work for any partyId.
- **The ledger is the source of truth**: no database; an in-memory projection (polled ACS) backs reads and is rebuilt on boot.
- **Decimals are strings**, computed as scaled BigInt to mirror the on-ledger rounding exactly.
- **Mock mode** is self-contained (`DARK_POOL_MOCK=1`): an in-memory fake ledger with a seeded fixture, no Canton and no token needed.

## 2. What it is / why

Single process (the matcher is an in-process scheduled pass, not a daemon). The matcher is a **pure function whose postconditions equal the contract's preconditions** (`findMatches(pool, orders, now) → MatchPlan[]`): it only emits pairs that already satisfy every on-ledger guard, so a settlement failure means a genuine race, not a logic bug. One guarded `runPass()` is the single match writer (5-min heartbeat + manual `POST /venue/match`).

## 3. Where (module map)

`src/`: `config` (resolves config + auth source), `auth` (static/M2M/mock bearer token), `ledger` (JSON Ledger API v2 client), `decimal` (exact 10-dp), `matcher` (pure price-time), `funding` (holding selection), `projection` (ACS → caches + reducers), `settlement` (`DarkPool_Match` + fail-closed), `scheduler` (guarded pass + heartbeat), `commands` (pure builders), `http` (routes), `server`/`wiring`, `types`; plus `mockLedger` + `mock-bootstrap.json` for offline runs. `test/` mirrors the critical modules + a mock integration test. (The contracts themselves are external, addressed by package name over the API.)

## 4. How to run

Run from the repo root (one `npm install` links every workspace).

**Mock mode, offline with zero setup (use this to develop the frontend):**
```bash
npm run backend:dev          # tsx watch, DARK_POOL_MOCK defaults on
# or directly:
DARK_POOL_MOCK=1 npm --prefix backend run dev
# → http://localhost:3020, seeded data, live matching, no ledger/token needed
```
Mock mode in a container:
```bash
npm run backend:up           # docker compose up -d --build dark-pool-backend
npm run backend:logs         # tail logs
npm run backend:down         # stop
```
**Against a live ledger:** point it at the bootstrap config + a token:
```bash
CANTON_JSON_API_URL=<json-api> DARK_POOL_BOOTSTRAP=<path/to/dark-pool.bootstrap.json> \
CANTON_BACKEND_TOKEN=<token>   # or FIVENORTH_CLIENT_SECRET=… for M2M
npm --prefix backend run dev
```
Auth precedence: `DARK_POOL_MOCK=1` → mock; else `CANTON_BACKEND_TOKEN` → static; else `FIVENORTH_CLIENT_SECRET` → M2M.

## 5. How to test

```bash
npm --prefix backend test     # 35/35, no network
# or: npm run backend:test
```
Covers decimal exactness, matcher (cross/min-fill/price-time/expiry/self-match), funding selection, projection reducers, settlement (+ fail-closed), and an end-to-end mock place→match→settle→cancel→expiry. Lint: `npm --prefix backend run lint` (Biome).

## 6. API & frontend integration

Port `3020`. JSON is shaped to the frontend's `DarkPoolClient` types.

| Method · path | Body / query | Returns |
| --- | --- | --- |
| `GET /healthz` `/readyz` | (none) | health |
| `GET /venue` | (none) | `{ pools: {[poolId]:{pool,book,trades,stats}}, schedule:{intervalMs,nextRunAt} }`, operator view, **full book** |
| `GET /trade?party=` | `party` | `{ pools, orders, fills, balances }`, **own orders only** |
| `POST /faucet` | `{party,instrument?,amount?}` | `{ balances }` |
| `POST /orders` | `{party,side,quantity,limitPrice,minFill,poolId?,expiresAt?}` | `201 {order}` |
| `DELETE /orders/:cid` | `{party}` | `{cancelled}` |
| `POST /venue/match` | (none) | `{ranAt,matched,rejected,schedule}`, run a pass now |
| `PUT /venue/schedule` | `{intervalMs}` | `{intervalMs,nextRunAt}` (bounds 1s to 24h) |

DTOs: `Order={cid,poolId,side,quantity,limitPrice,minFill,submittedAt,expiresAt}`, `Fill={tradeId,poolId,side,price,quantity,settledAt}`, `Trade={tradeId,poolId,price,quantity,buyer,seller,settledAt}`, `Balance={instrument,total,declared}`. All amounts are **strings**. Full request/response examples are in [`API.md`](API.md).

**Frontend wiring (`frontend/src/darkpool/`):**
1. The `DarkPoolClient` interface fronts the data layer; the HTTP client points at `VITE_DARK_POOL_API` (defaults to `http://localhost:3020`). The mock client backs offline development.
2. The venue view polls `GET /venue`; the trade view polls `GET /trade?party=<connectedParty>` every ~2 to 3 s. `placeOrder`→`POST /orders`, `cancelOrder`→`DELETE /orders/:cid`, faucet→`POST /faucet`.
3. Countdown: render `schedule.nextRunAt` (absolute) client-side; "Run matching now" → `POST /venue/match`; change cadence → `PUT /venue/schedule`.
4. Darkness: the trade view only ever shows the caller's own orders; `/trade` returns only those; the full book is venue-only.
5. Type notes: `submittedAt` is a ledger ordering key (not ms); numbers are strings; `Pool` labels derive from `base.id`/`quote.id`.
6. Identity: `POST /orders` acts as a co-hosted (seeded) party; reads/faucet take any partyId.

## 7. Contracts

The dark-pool contracts and the funding/faucet token live in [`../contracts/`](../contracts/). The service depends only on their **deployed** package names + the `dark-pool.bootstrap.json` config. A ledger-provisioning script (`backend/scripts/dark-pool-bootstrap.mjs`) stands the ledger up: it allocates parties, creates the pool + factory, mints seed holdings, and emits that config. The dark pool settles a token that implements the Splice `AllocationFactory` standard, which is the `registry-token` package in `../contracts/`.

## 8. Deploy

- `Dockerfile`: multi-stage Node 24 build, built from the repo root so it uses the shared workspace lockfile. Builds the `@canton-dappbooster/dark-pool-service` workspace, `EXPOSE 3020`, `CMD ["node","dist/server.js"]`.
- Root `docker-compose.yml`: the `dark-pool-backend` service runs the image (`3020:3020`, healthcheck `GET /healthz`). Driven by `npm run backend:up` / `backend:down` / `backend:logs`. It defaults to mock mode; for a live ledger, override the environment: set `CANTON_JSON_API_URL`, M2M creds (`FIVENORTH_*`) or `CANTON_BACKEND_TOKEN`, `DARK_POOL_BOOTSTRAP=<path to a mounted config>`, and optionally `MATCH_INTERVAL_MS` / `CORS_ORIGINS`. Pass secrets via env or an `--env-file`, never committed.
