import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BootstrapConfig } from '../src/config.ts'
import type { ActiveContract, Ledger } from '../src/ledger.ts'
import { bookFor, createProjection, myOrders, toBalances } from '../src/projection.ts'
import type { Holding, InstrumentId, OrderContract, Side } from '../src/types.ts'

const TTA: InstrumentId = { admin: 'admin', id: 'TTA' }
const TTB: InstrumentId = { admin: 'admin', id: 'TTB' }

const hold = (
  contractId: string,
  owner: string,
  instrument: InstrumentId,
  amount: string,
): Holding => ({
  contractId,
  owner,
  instrument,
  amount,
})

const order = (
  contractId: string,
  trader: string,
  side: Side,
  holdingCids: string[],
): OrderContract => ({
  contractId,
  createdOffset: 1,
  trader,
  venue: 'venue',
  poolId: 'TTA-TTB',
  base: TTA,
  quote: TTB,
  side,
  quantity: '10.0',
  limitPrice: '2.0',
  minFill: '1.0',
  expiresAt: null,
  holdingCids,
})

// Scenario: production ACS reads must query the package/module/entity names
// uploaded to the participant. The holding payload then comes back with a nested
// instrumentId, which should become the balance instrument used by the API.
test('refresh reads deployed template ids and parses RegistryHolding.instrumentId', async () => {
  // This config mirrors the minimal bootstrap shape: venue/admin parties define
  // visibility, while pool and instrument values define the API projection.
  const config: BootstrapConfig = {
    parties: { venue: 'venue::participant', admin: 'tokens-admin::participant' },
    poolId: 'TTA-TTB',
    instruments: { base: TTA, quote: TTB },
    factoryCid: 'registry-cid',
    poolCid: 'pool-cid',
  }
  const calls: { readAs: string; templateId: string }[] = []
  const holding: ActiveContract = {
    contractId: 'holding-cid',
    templateId: '#registry-token:RegistryToken.Holding:RegistryHolding',
    createArgument: {
      owner: 'alice',
      instrumentId: { admin: 'tokens-admin::participant', id: 'TTA' },
      amount: '12.0',
    },
    createdOffset: 1,
  }

  // The fake ledger records every ACS query and returns one holding only when
  // the projection asks for the deployed RegistryHolding template.
  const ledger: Ledger = {
    ledgerEnd: async () => 1,
    activeContracts: async (readAs, templateId) => {
      calls.push({ readAs, templateId })
      return templateId === holding.templateId ? [holding] : []
    },
    submit: async () => [],
    updatesFrom: async () => [],
  }

  // Refresh should read pools, orders, and holdings once; only the holding
  // result is populated here because the assertion focuses on token projection.
  const projection = createProjection(ledger, config)
  await projection.refresh()

  // Expected behavior: queries use full template IDs, and the nested
  // instrumentId is preserved so balances can match configured instruments.
  assert.deepEqual(calls, [
    {
      readAs: 'venue::participant',
      templateId: '#dark-pool:DarkPool:DarkPool',
    },
    {
      readAs: 'venue::participant',
      templateId: '#dark-pool:DarkPool:Order',
    },
    {
      readAs: 'tokens-admin::participant',
      templateId: '#registry-token:RegistryToken.Holding:RegistryHolding',
    },
  ])
  assert.deepEqual(projection.holdings(), [
    {
      contractId: 'holding-cid',
      owner: 'alice',
      instrument: { admin: 'tokens-admin::participant', id: 'TTA' },
      amount: '12.0',
    },
  ])
})

// Scenario: balances aggregate every active holding for the requested party and
// instrument. The concrete data includes two TTA holdings for Alice and one Bob
// holding that must not affect Alice's total.
test('toBalances: total per instrument sums the party holdings', () => {
  const holdings = [
    hold('h1', 'alice', TTA, '100.0'),
    hold('h2', 'alice', TTA, '50.0'),
    hold('h3', 'bob', TTA, '7.0'),
  ]
  const balances = toBalances(holdings, [], 'alice', [TTA, TTB])
  assert.equal(balances[0].total, '150.0000000000')
  assert.equal(balances[1].total, '0.0000000000')
})

// Scenario: declared balance is the slice of Alice's holdings referenced by
// Alice's open orders. The test uses one referenced TTB holding and one free TTB
// holding so total and declared differ.
test('toBalances: declared sums only amounts referenced by the party open orders', () => {
  const holdings = [hold('h1', 'alice', TTB, '40.0'), hold('h2', 'alice', TTB, '60.0')]
  const orders = [order('o1', 'alice', 'Buy', ['h1'])]
  const balances = toBalances(holdings, orders, 'alice', [TTB])
  assert.equal(balances[0].total, '100.0000000000')
  assert.equal(balances[0].declared, '40.0000000000')
})

// Scenario: balances are party-scoped. Bob's holdings and Bob's open order are
// present in the same projection but should not change Alice's total or
// declared balances.
test('toBalances: ignores other parties holdings and orders', () => {
  const holdings = [hold('h1', 'alice', TTA, '10.0'), hold('h2', 'bob', TTA, '99.0')]
  const orders = [order('o1', 'bob', 'Sell', ['h2'])]
  const balances = toBalances(holdings, orders, 'alice', [TTA])
  assert.equal(balances[0].total, '10.0000000000')
  assert.equal(balances[0].declared, '0.0000000000')
})

// Scenario: the venue book exposes every resting order for the requested pool,
// regardless of trader or side. Orders from other pools are excluded.
test('bookFor returns every resting order in the pool', () => {
  const orders = [order('o1', 'alice', 'Buy', []), order('o2', 'bob', 'Sell', [])]
  assert.equal(bookFor(orders, 'TTA-TTB').length, 2)
  assert.equal(bookFor(orders, 'OTHER').length, 0)
})

// Scenario: trader views must only include the connected party's own orders.
// Alice and Bob both have open orders, but Alice should see only Alice's order.
test('myOrders returns only the party own orders', () => {
  const orders = [order('o1', 'alice', 'Buy', []), order('o2', 'bob', 'Sell', [])]
  const mine = myOrders(orders, 'alice')
  assert.equal(mine.length, 1)
  assert.equal(mine[0].contractId, 'o1')
})
