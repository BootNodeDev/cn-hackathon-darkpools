# Agent Configuration — CN Dark Pools

This file is the canonical monorepo-wide agent configuration. `CLAUDE.md` files are compatibility shims that point here or to a sibling `AGENTS.md`. Each subproject layers its own `AGENTS.md` for stack-specific deltas.

Subproject docs:

- [`frontend/AGENTS.md`](frontend/AGENTS.md) — React/Vite trading dApp
- [`backend/AGENTS.md`](backend/AGENTS.md) — Express dark pool service
- [`contracts/AGENTS.md`](contracts/AGENTS.md) — Daml contracts + registry token
- [`canton-connect-kit/AGENTS.md`](canton-connect-kit/AGENTS.md) — wagmi-style Canton hooks
- [`wallet/`](wallet/) — pre-built Carpincho extension (no source, no AGENTS.md)

For the system shape and data flow, see [`architecture.md`](architecture.md).

---

## Documentation Distribution

| File | Reader | Distribution rule |
|------|--------|-------------------|
| `README.md` | Human: what is this, how do I run it? | Every independently buildable unit gets one. Subproject READMEs cover only that unit and link upward for shared setup. |
| `AGENTS.md` | Agent: what local rules differ from root? | Root always. Subproject only when local conventions would cause wrong edits without it. Deltas only; link upward for repo-wide rules. |
| `CLAUDE.md` | Claude compatibility loader | Three-line shim beside every `AGENTS.md`, pointing to the sibling `AGENTS.md`. Never canonical. |
| `architecture.md` | Human or agent: structural seams and subsystems | Root for cross-component seams. Subproject when internals outgrow the README. |

Current distribution:

| Scope | README | AGENTS | CLAUDE | architecture |
|-------|--------|--------|--------|--------------|
| root | yes | yes | shim | yes |
| `frontend/` | yes | yes | shim | yes |
| `backend/` | yes | yes | shim | yes |
| `contracts/` | yes | yes | shim | yes |
| `canton-connect-kit/` | yes | yes | shim | yes |
| `wallet/` | yes | no | shim | no (pre-built binary only) |

Subproject docs must not restate root rules -- only local deltas and upward links.

---

## Stack & Conventions

| Category | Technology | Notes |
|----------|-----------|-------|
| Languages | TypeScript, Daml | TypeScript across JS packages; Daml in `contracts/` |
| Package manager | npm workspaces | Root `package-lock.json`; one root `npm install` links every workspace |
| Node | 24 | Pinned via root `.nvmrc` |
| Lint / format | Biome | One root `biome.json`; per-project rules under `overrides`. No per-package Biome install |
| Commit-msg hook | commitlint | Root `.husky/commit-msg` runs `commitlint --edit` |
| Pre-commit hook | lint-staged | Root `.husky/pre-commit` runs `lint-staged` (`biome check --write` over the three Node packages) |
| Pre-push hook | tsc | Root `.husky/pre-push` runs `tsc --noEmit` in `backend`, `frontend`, and `canton-connect-kit` |
| Container runtime | Docker | Used by `backend/` |

## Subprojects

| Path | Purpose | Stack | Port |
|------|---------|-------|------|
| [`frontend/`](frontend/) | Dark pool trading dApp -- trader and venue views | Vite 6 + React 18 + Tailwind v4 + Radix UI + TanStack Router | 3012 |
| [`backend/`](backend/) | Off-ledger dark pool service -- matcher, scheduler, settlement, REST API | Node 24 + Express 5 + TypeScript | 3020 |
| [`contracts/`](contracts/) | Daml smart contracts -- dark pool venue + registry token | Daml (dpm, SDK 3.4.11) | n/a |
| [`canton-connect-kit/`](canton-connect-kit/) | wagmi-style React hooks for CIP-0103 wallet connections | TypeScript + React 18 | n/a (library) |
| [`wallet/`](wallet/) | Pre-built Carpincho browser extension (load unpacked from `wallet/dist-extension/`) | binary | n/a |

## Code Style

- All source code in English regardless of conversation language.
- TypeScript preferred over JavaScript across JS subprojects.
- **No semicolons** in TypeScript / JavaScript.
- **Comments explain why, not what.** One line max. No prose where a short clause suffices.
- Lint and formatting are centralized in the root `biome.json`. Add project-specific rules under `overrides`; do not create per-subproject Biome configs.

## Working Rules

- Use **npm** only (never pnpm or yarn).
- npm workspaces monorepo: one `npm install` from root installs and links everything.
- Contracts (`contracts/`) are NOT an npm workspace -- build and test from that directory with their own `npm install`.
- Run a workspace script via `npm --prefix <subproject> run <script>` or the root orchestration scripts in `package.json`.
- Local ports: `3012` (frontend), `3020` (backend). Do not reassign without updating all defaults.
- Single root `package-lock.json` is authoritative. Do not regenerate it during unrelated changes.
- Do not commit `.env.local`, `node_modules`, `dist/`, or `.claude/settings.local.json`.

## Architecture

See [`architecture.md`](architecture.md) for system shape, data flow, and port allocations.

## Testing

Each subproject owns its test runner:

- `frontend`: `npm --prefix frontend test` (Node `node:test` + `--experimental-strip-types`)
- `backend`: `npm --prefix backend test` (Node `node:test`; includes a mock place→match→settle integration)
- `contracts`: `npm --prefix contracts test` (Daml Script via dpm; needs its own `npm install` first)
- `canton-connect-kit`: `npm --prefix canton-connect-kit test` (Node `node:test` + `tsx`)

Root alias: `npm run backend:test`.

Cover business logic, API integrations, and component behaviour. Skip styling, third-party library internals, trivial getters/setters.

## Commit Standards

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`

- Scope optional. Subject: imperative, lowercase after colon, no trailing period.
- Body (optional) separated by blank line: explains what and why.

Allowed prefixes (enforced by [`commitlint.config.js`](commitlint.config.js)):

| Prefix | Purpose |
|--------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance, dependencies, config |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `style` | Formatting, whitespace |
| `ci` | CI/CD pipeline changes |
| `perf` | Performance improvement |
| `build` | Build system or external dependencies |
| `revert` | Reverts a previous commit |
| `wip` | Work in progress (avoid on main) |
| `release` | Release-related changes |
| `hotfix` | Emergency fix |

## PR Workflow

- Every PR must reference an issue (`Closes #N`). No issue? Use `No related issue.` on the first line.
- Mirror the issue's acceptance criteria in the PR.
- Keep PRs small and focused -- one issue, one PR.
- PR titles use Conventional Commit format.
- The `create-pr` skill at `.claude/skills/create-pr/` reads [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) and fills every section automatically.

## Label Conventions

Priority labels (bugs, features, epics):

| Label | Description |
|-------|-------------|
| `priority: critical` | Blocking work, system down, or security issue |
| `priority: high` | Must be addressed in current sprint |
| `priority: medium` | Should be addressed soon |
| `priority: low` | Nice to have, can wait |

## Guardrails

- Do not commit secrets, API keys, or credentials. `.env.local` files are gitignored.
- Do not modify CI/CD pipelines without team review.
- Do not skip tests or linting to make a build pass.
- Do not bypass husky hooks (`--no-verify`) unless explicitly asked.
- When in doubt, ask -- don't assume.

## Change Strategy

- Prefer small, focused diffs over broad refactors.
- Preserve existing UX unless the task explicitly changes it.
- Avoid introducing new patterns when a project pattern already exists.
- Update docs only when behaviour or workflow changes.

## Validation Checklist

Before declaring work done:

- `npm run lint` and `npm --prefix <subproject> test` for every subproject touched.
- For end-to-end: backend up, frontend connected, order placed and matched.

## References

- [Conventional Commits](https://www.conventionalcommits.org/)
- [CIP-0103 Canton wallet provider spec](https://github.com/digital-asset/canton/tree/main/community/app/src/pack/examples/04-canton-wallet)
- [cn-dark-pool-contracts](https://github.com/BootNodeDev/cn-dark-pool-contracts)
