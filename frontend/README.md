# CN Dark Pools

A dark pool for trading on the Canton Network. You place an order, it stays
private until the venue finds the other side, and the two of you settle at the
price in the middle. There is no public order book for the room to read and
nothing for bots to race ahead of.

The privacy isn't a feature bolted on top. Canton only shows each party the
contracts it is a party to, so a trader sees their own orders and fills, the
venue sees the book it needs to run matching, and everyone else sees nothing.

Live at https://darkpools.cc/.

## How it connects

The app talks to Carpincho for the wallet and to the dark pool service
([`../backend/`](../backend/)) for everything else: the order book, balances,
matching, and settled trades. All of that flows through one `DarkPoolClient`
interface (`src/darkpool/`), so the views never care where the data comes from.
A `MockDarkPoolClient` implements the same interface and runs the whole app in
the browser, seeded counterparties and a matcher on a timer included, so you can
develop the UI offline with no backend running.

The model and the operations mirror the [`../contracts/`](../contracts/) Daml
package: limit orders with a minimum fill and optional expiry, midpoint pricing,
atomic settlement, and self-funded remainders that re-rest.

## Running it

You'll need Node 24+, the repo's dependencies installed (`npm install` from the
repo root, which links every workspace), and the
[Carpincho](https://github.com/BootNodeDev/carpincho) browser extension (or load
the pre-built build from `wallet/dist-extension/`).

```bash
# from the repo root
npm install

# start the frontend
npm run app:dev          # or: npm --prefix frontend run dev
```

The app comes up on http://localhost:3012. Click **Connect Carpincho**, approve
the request in the extension, and you're in. No environment variables are
required; the Canton network and wallet-companion URL default sensibly and can
be changed in-app (they persist to localStorage).

To connect the frontend to the real backend instead of the mock, set
`VITE_DARK_POOL_API=http://localhost:3020` in `frontend/.env.local` and start
the backend with `npm run backend:up`.

## The two views

- **`/`** is the trader's view. Pick a pair, check your balances, place a private
  order (side, limit price, quantity, minimum fill, optional expiry), and watch
  your open orders and fills. The "shielded book" panel is intentionally blurred:
  there is no public depth to show.
- **`/venue`** is the operator's view: the full resting book, the settled
  matches, and a **Run matching pass** button. The venue scans the book
  off-chain and picks crossing pairs; the contract sets the midpoint price and
  either moves both legs atomically or rejects the match. It isn't linked from
  the nav on purpose; reach it by typing the URL. Only the venue's own wallet
  can see this data.

## Working on it

```bash
npm --prefix frontend run dev      # dev server
npm --prefix frontend run build    # type-check + production build
npm --prefix frontend test         # unit tests (node:test)
npm --prefix frontend run lint     # biome
```

The pricing and matching logic lives in `src/darkpool/darkpoolMath.ts` and is
covered by tests; the mock client in `src/darkpool/client/` is tested too. UI
components live under `src/features/trade` and `src/features/venue`, with shared
primitives in `src/components`.
