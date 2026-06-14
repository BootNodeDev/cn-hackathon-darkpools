import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { describe, test } from 'node:test'
import { loadConfig } from '../src/config.ts'
import { createApp } from '../src/http.ts'
import { buildContext } from '../src/wiring.ts'

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

describe('wallet transaction planning endpoints', () => {
  // Scenario: the frontend cannot fetch the venue-signed DarkPool contract as a
  // trader, so the backend exposes the deployed ids and disclosure required to
  // exercise DarkPool_PlaceOrder through Carpincho.
  test('GET /config returns ids, template ids, and the pool disclosure', async () => {
    const app = await startApp()
    try {
      // The config endpoint is read-only metadata. The frontend uses these
      // values to build Ledger API commands locally without backend signing.
      const response = await fetch(`${app.base}/config`)
      assert.equal(response.status, 200)
      const body = await response.json()

      // The response must include the concrete deployed contract ids instead of
      // asking the frontend to hardcode environment-specific bootstrap output.
      assert.equal(body.poolCid, 'mock-pool-cid')
      assert.equal(body.factoryCid, 'mock-registry-rules-cid')
      assert.equal(body.templateIds.darkPool, '#dark-pool:DarkPool:DarkPool')

      // The disclosed contract shape mirrors Canton JSON API v2 so it can be
      // forwarded directly in useExecute().execute({ disclosedContracts }).
      assert.deepEqual(body.disclosedContracts, [
        {
          templateId: '#dark-pool:DarkPool:DarkPool',
          contractId: 'mock-pool-cid',
          createdEventBlob: 'mock-pool-cid-created-event-blob',
          synchronizerId: 'mock-synchronizer',
        },
      ])
    } finally {
      await app.close()
    }
  })

  // Scenario: the venue keeps off-ledger matching policy on the backend, but
  // returns unsigned match plans so the venue wallet remains the transaction
  // signer and the frontend owns command construction.
  test('POST /venue/match-plan returns crossing order pairs without settling them', async () => {
    const app = await startApp()
    const { alice, bob } = app.parties
    try {
      // Seed both sides with enough token holdings to place a crossing pair in
      // the mock ledger. Existing mutating endpoints stay available for tests.
      await post(app.base, '/faucet', { party: alice, instrument: 'TTB', amount: '100.0' })
      await post(app.base, '/faucet', { party: bob, instrument: 'TTA', amount: '100.0' })
      const buy = await (
        await post(app.base, '/orders', {
          party: alice,
          poolId: 'TTA-TTB',
          side: 'Buy',
          quantity: '10.0',
          limitPrice: '2.0',
          minFill: '1.0',
        })
      ).json()
      const sell = await (
        await post(app.base, '/orders', {
          party: bob,
          poolId: 'TTA-TTB',
          side: 'Sell',
          quantity: '10.0',
          limitPrice: '1.0',
          minFill: '1.0',
        })
      ).json()

      // Planning must run the same matcher as settlement, but must not archive
      // orders or move balances. The frontend submits the actual match later.
      const response = await post(app.base, '/venue/match-plan', {})
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.plans.length, 1)
      assert.deepEqual(body.plans[0], {
        poolId: 'TTA-TTB',
        buyOrderCid: buy.order.cid,
        sellOrderCid: sell.order.cid,
        fillQty: '10.0000000000',
      })

      // Because this endpoint only plans, both orders should still be resting in
      // the venue book after the response.
      const venue = await (await fetch(`${app.base}/venue`)).json()
      assert.equal(venue.pools['TTA-TTB'].book.length, 2)
    } finally {
      await app.close()
    }
  })
})
