// End-to-end over the mock ledger (no Canton): faucet → place → match → settle,
// plus cancel and expiry sweep, driven through the real HTTP layer.
import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { match } from '../../src/commands.ts'
import { loadConfig } from '../../src/config.ts'
import { createApp } from '../../src/http.ts'
import type { Balance } from '../../src/types.ts'
import { buildContext } from '../../src/wiring.ts'

const startApp = async () => {
  process.env.DARK_POOL_MOCK = '1'
  process.env.DARK_POOL_BOOTSTRAP = ''
  const config = loadConfig()
  const ctx = buildContext(config)
  await ctx.projection.refresh()
  const server = createApp(ctx).listen(0)
  await once(server, 'listening')
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    config,
    ctx,
    parties: config.parties.traders,
    close: async () => {
      ctx.scheduler.stop()
      await new Promise((resolve) => server.close(() => resolve(undefined)))
    },
  }
}

const post = (base: string, path: string, body: unknown): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const total = (balances: Balance[], symbol: string): string =>
  balances.find((balance) => balance.instrument.id === symbol)?.total ?? 'missing'

test('place a crossing buy/sell, match settles at the midpoint and moves balances', async () => {
  const app = await startApp()
  const { alice, bob } = app.parties
  try {
    await post(app.base, '/faucet', { party: alice, instrument: 'TTB', amount: '100.0' })
    await post(app.base, '/faucet', { party: bob, instrument: 'TTA', amount: '100.0' })

    const buy = await post(app.base, '/orders', {
      party: alice,
      poolId: 'TTA-TTB',
      side: 'Buy',
      quantity: '10.0',
      limitPrice: '2.0',
      minFill: '1.0',
    })
    assert.equal(buy.status, 201)
    const sell = await post(app.base, '/orders', {
      party: bob,
      poolId: 'TTA-TTB',
      side: 'Sell',
      quantity: '10.0',
      limitPrice: '1.0',
      minFill: '1.0',
    })
    assert.equal(sell.status, 201)

    const matchReport = await (await post(app.base, '/venue/match', {})).json()
    assert.equal(matchReport.matched.length, 1)
    assert.equal(matchReport.matched[0].price, '1.5000000000')
    assert.equal(matchReport.matched[0].qty, '10.0000000000')
    assert.equal(matchReport.matched[0].buyer, alice)
    assert.equal(matchReport.matched[0].seller, bob)

    const aliceView = await (
      await fetch(`${app.base}/trade?party=${encodeURIComponent(alice)}`)
    ).json()
    assert.equal(aliceView.fills.length, 1)
    assert.equal(aliceView.fills[0].side, 'Buy')
    // exec price is the 1.5 midpoint: alice pays 15 TTB and receives 10 TTA
    assert.equal(total(aliceView.balances, 'TTA'), '10.0000000000')
    assert.equal(total(aliceView.balances, 'TTB'), '85.0000000000')

    const venue = await (await fetch(`${app.base}/venue`)).json()
    assert.equal(venue.pools['TTA-TTB'].trades.length, 1)
    assert.equal(venue.pools['TTA-TTB'].book.length, 0)
  } finally {
    await app.close()
  }
})

test('syncs a wallet-signed match into venue trades and trader fills', async () => {
  const app = await startApp()
  const { alice, bob } = app.parties
  try {
    // Alice funds the buy in quote token and Bob funds the sell in base token,
    // matching the same order data that the venue wallet will later sign.
    await post(app.base, '/faucet', { party: alice, instrument: 'TTB', amount: '100.0' })
    await post(app.base, '/faucet', { party: bob, instrument: 'TTA', amount: '100.0' })
    await post(app.base, '/orders', {
      party: alice,
      poolId: 'TTA-TTB',
      side: 'Buy',
      quantity: '10.0',
      limitPrice: '2.0',
      minFill: '1.0',
    })
    await post(app.base, '/orders', {
      party: bob,
      poolId: 'TTA-TTB',
      side: 'Sell',
      quantity: '10.0',
      limitPrice: '1.0',
      minFill: '1.0',
    })

    // Carpincho signs outside the backend scheduler, so the ledger changes but
    // the backend has not yet recorded the authoritative MatchResult as a fill.
    const beginExclusive = await app.ctx.ledger.ledgerEnd()
    const buyOrder = app.ctx.projection.openOrders().find((order) => order.side === 'Buy')
    const sellOrder = app.ctx.projection.openOrders().find((order) => order.side === 'Sell')
    assert.ok(buyOrder)
    assert.ok(sellOrder)
    await app.ctx.ledger.submit(app.config.parties.venue, [
      match({
        poolCid: app.config.poolCid,
        buyOrderCid: buyOrder.contractId,
        sellOrderCid: sellOrder.contractId,
        matchId: 'wallet-signed-match',
        factoryCid: app.config.factoryCid,
        requestedAt: new Date(1_700_000_000_000).toISOString(),
        allocateBefore: new Date(1_700_000_300_000).toISOString(),
        settleBefore: new Date(1_700_003_600_000).toISOString(),
      }),
    ])
    const endInclusive = await app.ctx.ledger.ledgerEnd()

    // The sync endpoint must not trust client-supplied trade details. It reads
    // the ledger update range, derives the parties from known orders, and then
    // refreshes the projection so the archived orders disappear from the book.
    const sync = await (
      await post(app.base, '/venue/match-sync', { beginExclusive, endInclusive })
    ).json()
    assert.equal(sync.synced, 1)
    assert.equal(sync.trades[0].buyer, alice)
    assert.equal(sync.trades[0].seller, bob)
    assert.equal(sync.trades[0].price, '1.5000000000')
    assert.equal(sync.trades[0].quantity, '10.0000000000')

    // Trader fills are now visible through the normal read API, proving the
    // wallet-signed path has the same observable result as backend settlement.
    const aliceView = await (
      await fetch(`${app.base}/trade?party=${encodeURIComponent(alice)}`)
    ).json()
    assert.equal(aliceView.fills.length, 1)
    assert.equal(aliceView.fills[0].side, 'Buy')
    assert.equal(total(aliceView.balances, 'TTA'), '10.0000000000')
    assert.equal(total(aliceView.balances, 'TTB'), '85.0000000000')

    // Venue readers should see the settled trade and an empty book after sync.
    const venue = await (await fetch(`${app.base}/venue`)).json()
    assert.equal(venue.pools['TTA-TTB'].trades.length, 1)
    assert.equal(venue.pools['TTA-TTB'].book.length, 0)
  } finally {
    await app.close()
  }
})

test('cancel removes a resting order before it matches', async () => {
  const app = await startApp()
  const { alice } = app.parties
  try {
    await post(app.base, '/faucet', { party: alice, instrument: 'TTB', amount: '100.0' })
    const placed = await (
      await post(app.base, '/orders', {
        party: alice,
        side: 'Buy',
        quantity: '10.0',
        limitPrice: '2.0',
        minFill: '1.0',
      })
    ).json()
    const cancel = await fetch(`${app.base}/orders/${encodeURIComponent(placed.order.cid)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ party: alice }),
    })
    assert.equal(cancel.status, 200)
    const view = await (await fetch(`${app.base}/trade?party=${encodeURIComponent(alice)}`)).json()
    assert.equal(view.orders.length, 0)
  } finally {
    await app.close()
  }
})

test('a pass sweeps an expired order via Order_Reject', async () => {
  const app = await startApp()
  const { bob } = app.parties
  try {
    await post(app.base, '/faucet', { party: bob, instrument: 'TTA', amount: '100.0' })
    await post(app.base, '/orders', {
      party: bob,
      side: 'Sell',
      quantity: '10.0',
      limitPrice: '1.0',
      minFill: '1.0',
      expiresAt: Date.now() - 1000,
    })
    const report = await (await post(app.base, '/venue/match', {})).json()
    assert.equal(report.matched.length, 0)
    assert.ok(
      report.rejected.some((rejection: { reason: string }) => rejection.reason === 'expired'),
    )
  } finally {
    await app.close()
  }
})
