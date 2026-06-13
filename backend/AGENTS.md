# Agent Configuration — backend

This file applies only to `backend/`. For monorepo-wide rules, see [`../AGENTS.md`](../AGENTS.md).

## Scope

The off-ledger dark pool service. Handles REST API traffic, runs the matching engine on a heartbeat, and submits settlement transactions to a Canton ledger via JSON Ledger API v2. Runs fully offline in mock mode (`DARK_POOL_MOCK=1`).

## Working Rules

- `src/matcher.ts` is a pure function -- no I/O, no side effects. Keep it that way. Every output plan must already satisfy the contract's preconditions so a settlement failure always means a real race, never a matcher bug.
- The scheduler (`src/scheduler.ts`) is the **single writer**. Nothing else exercises `DarkPool_Match`. The guard (`running` flag) prevents overlapping passes; do not remove it.
- Fail-closed: if a match fails at settlement, reject that order and continue. Never blind-retry. Safety over liveness.
- Decimals are strings throughout, computed via `src/decimal.ts` (scaled BigInt, 10 dp). Do not use `number` arithmetic on amounts.
- `src/projection.ts` is the in-memory ACS cache. The ledger is the source of truth; trade history is volatile (resets on restart). Do not add a database.
- `DARK_POOL_MOCK=1` is the development default -- zero setup, no Canton node needed. All tests run against the mock.
- Do not expose `CANTON_AUTH_SECRET` over the API or log it.

## Architecture

See [`architecture.md`](architecture.md) for the module map and request lifecycle.

## Running and testing

```bash
# Development (mock mode):
DARK_POOL_MOCK=1 npm --prefix backend run dev

# Tests (35/35, no network):
npm --prefix backend test

# Lint:
npm --prefix backend run lint

# Docker:
npm run backend:up      # from repo root
npm run backend:down
npm run backend:logs
```

## Environment Variables

| Variable | Required for live | Default | Purpose |
|----------|------------------|---------|---------|
| `DARK_POOL_MOCK` | no | unset | `=1` enables fully offline mock mode |
| `CANTON_JSON_API_URL` | yes | -- | Canton JSON Ledger API v2 endpoint |
| `DARK_POOL_BOOTSTRAP` | yes | -- | Path to `dark-pool.bootstrap.json` |
| `CANTON_BACKEND_TOKEN` | yes (static) | -- | Static bearer JWT |
| `FIVENORTH_CLIENT_SECRET` | yes (M2M) | -- | M2M OAuth secret (overrides static token) |
| `FIVENORTH_AUTH_URL` | no | FiveNorth sandbox token URL | M2M token endpoint |
| `FIVENORTH_CLIENT_ID` | no | `validator-devnet-m2m` | M2M client id |
| `FIVENORTH_SCOPE` | no | `daml_ledger_api` | M2M scope |
| `DARK_POOL_SERVICE_PORT` | no | `3020` | HTTP listen port |
| `MATCH_INTERVAL_MS` | no | `300000` | Heartbeat interval (1s – 24h) |
| `CORS_ORIGINS` | no | `*` | CORS allowed origins (comma-separated) |

Auth precedence: `DARK_POOL_MOCK=1` → mock; `CANTON_BACKEND_TOKEN` → static; `FIVENORTH_CLIENT_SECRET` → M2M. The `FIVENORTH_*` knobs only matter when the M2M path is selected.

## Validation Checklist

- `npm --prefix backend run lint`
- `npm --prefix backend test` (35/35)
- `npm --prefix backend run build` (tsc, zero errors)
