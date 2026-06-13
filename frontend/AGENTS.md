# Agent Configuration: frontend

This file applies only to `frontend/`. For monorepo-wide rules, see [`../AGENTS.md`](../AGENTS.md).

## Scope

The dark pool trading dApp. Two views: the trader view (`/`) for placing and watching private orders, and the venue view (`/venue`) for the operator to inspect the full book and trigger matching. The UI reads from the `backend/` dark pool service through the `DarkPoolClient` interface; a mock client backs offline development.

## Working Rules

- Keep the `DarkPoolClient` interface as the abstraction boundary between the UI and the data layer. Components must not reach past it into mock or HTTP internals.
- All Canton wallet interactions go through `canton-connect-kit` hooks (`useConnect`, `useParty`, `useWalletStatus`, `useExecute`). Do not call `@canton-network/dapp-sdk` directly from components.
- The venue view (`/venue`) is operator-only: it is not linked from nav. Only the venue's wallet sees full book data; the backend's `/venue` endpoint is the operator-only surface.
- Pricing and formatting helpers live in `src/darkpool/` (`darkpoolMath.ts`, `format.ts`) and must stay covered by tests. Do not move them inline into components.
- Use the `@/` alias for every import that resolves inside `src/`. Never include the file extension. Biome's `noRestrictedImports` rejects both relative `src` paths and `.ts`/`.tsx` suffixes (see the root `biome.json` override). Tests are exempt from the alias rule.

## Architecture

See [`architecture.md`](architecture.md) for the component tree, data flow, and mock/live client paths.

## Testing

```bash
npm --prefix frontend test
# or from inside the frontend directory:
npm test
```

Node `node:test` with `--experimental-strip-types`. No separate test runner to install.

Cover `darkpoolMath.ts`, the mock client (`src/darkpool/client/`), and component behaviour. Skip styling, third-party library internals, and trivial wrappers.

## Validation Checklist

- `npm --prefix frontend run lint`
- `npm --prefix frontend test`
- `npm --prefix frontend run build` (type-check + production build)
