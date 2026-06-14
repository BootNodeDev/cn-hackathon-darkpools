import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cancelOrder, match, mint, placeOrder, rejectOrder } from '../src/commands.ts'

// Scenario: production commands must reference the DarkPool module and entity
// names from the uploaded package. The place-order choice executes on the live
// DarkPool contract identified by the configured pool cid.
test('placeOrder exercises DarkPool_PlaceOrder on the pool', () => {
  const c = placeOrder({
    poolCid: 'P',
    trader: 'alice',
    side: 'Buy',
    quantity: '10.0',
    limitPrice: '2.0',
    minFill: '1.0',
    expiresAt: null,
    holdingCids: ['h1'],
  })
  assert.equal(c.ExerciseCommand.templateId, '#dark-pool:DarkPool:DarkPool')
  assert.equal(c.ExerciseCommand.contractId, 'P')
  assert.equal(c.ExerciseCommand.choice, 'DarkPool_PlaceOrder')
  assert.deepEqual(c.ExerciseCommand.choiceArgument.holdingCids, ['h1'])
  assert.equal(c.ExerciseCommand.choiceArgument.expiresAt, null)
})

// Scenario: cancelling an order must exercise the Order template from the
// deployed DarkPool package. The package-name form is what the JSON API accepts
// for commands and filters.
test('cancelOrder exercises Order_Cancel on the order', () => {
  const c = cancelOrder('o1')
  assert.equal(c.ExerciseCommand.templateId, '#dark-pool:DarkPool:Order')
  assert.equal(c.ExerciseCommand.contractId, 'o1')
  assert.equal(c.ExerciseCommand.choice, 'Order_Cancel')
})

// Scenario: rejecting an expired or stale order uses the same live Order
// template as cancellation. The contract id identifies the concrete order to
// archive on-ledger.
test('rejectOrder exercises Order_Reject on the order', () => {
  const c = rejectOrder('o2')
  assert.equal(c.ExerciseCommand.choice, 'Order_Reject')
  assert.equal(c.ExerciseCommand.contractId, 'o2')
})

// Scenario: matching sends the same registry factory cid to both settlement
// legs, so each side allocates through the deployed Registry contract.
test('match passes the single factoryCid for both legs', () => {
  const c = match({
    poolCid: 'P',
    buyOrderCid: 'b',
    sellOrderCid: 's',
    matchId: 'm',
    factoryCid: 'F',
    requestedAt: 't0',
    allocateBefore: 't1',
    settleBefore: 't2',
  })
  const a = c.ExerciseCommand.choiceArgument as Record<string, { allocationFactoryCid: string }>
  assert.equal(c.ExerciseCommand.choice, 'DarkPool_Match')
  assert.equal(a.buyFunding.allocationFactoryCid, 'F')
  assert.equal(a.sellFunding.allocationFactoryCid, 'F')
})

// Scenario: token-standard ExtraArgs include TextMap fields. The JSON Ledger API
// expects those maps as JSON objects, so empty maps must be `{}` rather than an
// empty array that cannot decode as a Daml TextMap.
test('match serializes empty token-standard extra args as objects', () => {
  const c = match({
    poolCid: 'P',
    buyOrderCid: 'b',
    sellOrderCid: 's',
    matchId: 'm',
    factoryCid: 'F',
    requestedAt: 't0',
    allocateBefore: 't1',
    settleBefore: 't2',
  })
  const args = c.ExerciseCommand.choiceArgument as {
    buyFunding: { allocateArgs: { context: { values: unknown }; meta: { values: unknown } } }
    buyExecuteArgs: { context: { values: unknown }; meta: { values: unknown } }
    sellExecuteArgs: { context: { values: unknown }; meta: { values: unknown } }
  }

  // Empty maps still need object shape because Canton decodes TextMap from a
  // JSON object at submit time.
  assert.deepEqual(args.buyFunding.allocateArgs.context.values, {})
  assert.deepEqual(args.buyFunding.allocateArgs.meta.values, {})
  assert.deepEqual(args.buyExecuteArgs.context.values, {})
  assert.deepEqual(args.buyExecuteArgs.meta.values, {})
  assert.deepEqual(args.sellExecuteArgs.context.values, {})
  assert.deepEqual(args.sellExecuteArgs.meta.values, {})
})

// Scenario: the faucet mints through the deployed Registry template. The choice
// argument must use the Daml record field names, including the full instrumentId
// object, because production Registry.Mint does not accept legacy symbol/to
// fields.
test('mint exercises Registry.Mint with an instrument id', () => {
  const c = mint({
    factoryCid: 'F',
    instrumentId: { admin: 'tokens-admin::participant', id: 'TTA' },
    owner: 'alice',
    amount: '100.0',
  })
  assert.equal(c.ExerciseCommand.templateId, '#registry-token:RegistryToken.Registry:Registry')
  assert.equal(c.ExerciseCommand.choice, 'Mint')
  assert.deepEqual(c.ExerciseCommand.choiceArgument, {
    instrumentId: { admin: 'tokens-admin::participant', id: 'TTA' },
    owner: 'alice',
    amount: '100.0',
  })
})
