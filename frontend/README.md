# CN Dark Pools

A dark pool for trading on the Canton Network. You place an order, it stays
private until the venue finds the other side, and the two of you settle at the
price in the middle. There is no public order book for the room to read and
nothing for bots to race ahead of.

The privacy isn't a feature bolted on top. Canton only shows each party the
contracts it is a party to, so a trader sees their own orders and fills, the
venue sees the book it needs to run matching, and everyone else sees nothing.

Live at https://darkpools.cc/.

## Running it

```bash
# from the repo root
npm install

# start the frontend
npm run app:dev          # or: npm --prefix frontend run dev
```

The app comes up on http://localhost:3012. Click **Connect Carpincho**, approve
the request in the extension, and you're in.

To connect the frontend to the real backend, set
`VITE_DARK_POOL_API=http://localhost:3020` in `frontend/.env.local` and start
the backend with `npm run backend:up`.

## The two views

- **`/`** is the trader's view. Pick a pair, place a private order (side, limit
  price, quantity, minimum fill, optional expiry), and watch your open orders
  and fills.
- **`/venue`** is the operator's view: the full resting book, the settled
  matches, and a **Run matching pass** button. The venue scans the book
  off-chain and picks crossing pairs; the contract sets the midpoint price and
  either moves both legs atomically or rejects the match.

## Working on it

```bash
npm --prefix frontend run dev      # dev server
npm --prefix frontend run build    # type-check + production build
npm --prefix frontend test         # unit tests (node:test)
npm --prefix frontend run lint     # biome
```
The pricing and matching logic lives in `src/darkpool/darkpoolMath.ts` and is
covered by tests; the mock client in `src/darkpool/client/` is tested too. UI
components live under `src/features/trade` and `src/features/venue`, with sha
