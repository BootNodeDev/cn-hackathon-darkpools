# CLAUDE.md

This repository follows **[`AGENTS.md`](AGENTS.md)** - read it first for the
toolchain, build/test commands, hard rules, and gotchas.

Quick orientation:

- This is a **Daml** project built with **`dpm`** (not a JavaScript project - the
  `npm` scripts just wrap `dpm` and vendor dependencies). If a parent-directory
  `CLAUDE.md` describes generic JS/`npm` workflows, **`AGENTS.md` here overrides
  it** for this repo.
- Vendor deps once first: `npm install` (or `bash scripts/fetch-dep.sh && bash
  scripts/build-harness.sh`). The canonical entry points are the `npm` scripts
  (`npm run build`, `npm test`). A bare `dpm build` at the repo root fails.
  Fast loop: `npm run build:dark-pool`.
- Never edit `deps/` (vendored & gitignored). Never put the test harness in the
  production `dark-pool` package. Commits use no `Co-Authored-By` trailers.
