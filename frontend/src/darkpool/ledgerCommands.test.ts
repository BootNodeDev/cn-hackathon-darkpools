import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  cancelOrderCommand,
  matchCommand,
  normalizeHoldingContract,
  placeOrderCommand,
  selectFundingHoldingCids,
} from './ledgerCommands'

describe('ledger command builders', () => {
  // Scenario: the trader submits a private order through the venue-signed pool.
  // The command must be pure JSON so it can be sent directly to Carpincho
  // without generated Daml TypeScript bindings.
  test('placeOrderCommand builds DarkPool_PlaceOrder with selected funding', () => {
    const command = placeOrderCommand({
      poolCid: 'pool-cid',
      trader: 'alice::participant',
      side: 'Buy',
      quantity: 10,
      limitPrice: 2,
      minFill: 1,
      expiresAt: 1_700_000_000_000,
      holdingCids: ['holding-1'],
    })

    // The frontend forms the same choice record as the backend command builder:
    // string decimals, ISO optional expiry, and the trader-selected funding CIDs.
    assert.deepEqual(command, {
      ExerciseCommand: {
        templateId: '#dark-pool:DarkPool:DarkPool',
        contractId: 'pool-cid',
        choice: 'DarkPool_PlaceOrder',
        choiceArgument: {
          trader: 'alice::participant',
          side: 'Buy',
          quantity: '10',
          limitPrice: '2',
          minFill: '1',
          expiresAt: '2023-11-14T22:13:20.000Z',
          holdingCids: ['holding-1'],
        },
      },
    })
  })

  // Scenario: order cancellation is a trader-signed operation on an existing
  // Order contract. The command builder must not depend on backend execution.
  test('cancelOrderCommand builds Order_Cancel', () => {
    const command = cancelOrderCommand('order-cid')

    // Carpincho signs as the connected trader; the command only needs the
    // concrete order id and the stable template/choice identifiers.
    assert.deepEqual(command, {
      ExerciseCommand: {
        templateId: '#dark-pool:DarkPool:Order',
        contractId: 'order-cid',
        choice: 'Order_Cancel',
        choiceArgument: {},
      },
    })
  })

  // Scenario: the backend returns unsigned match plans, and the venue frontend
  // fills in deadlines and factory ids before asking the venue wallet to sign.
  test('matchCommand builds DarkPool_Match from a plan', () => {
    const command = matchCommand({
      poolCid: 'pool-cid',
      factoryCid: 'factory-cid',
      plan: {
        poolId: 'TTA-TTB',
        buyOrderCid: 'buy-cid',
        sellOrderCid: 'sell-cid',
        fillQty: '10.0000000000',
      },
      nowMs: 1_700_000_000_000,
    })
    const args = command.ExerciseCommand.choiceArgument

    // The match id is deterministic for the pair, so a retry after an ambiguous
    // wallet result submits the same settlement reference instead of inventing a
    // second one.
    assert.equal(command.ExerciseCommand.choice, 'DarkPool_Match')
    assert.equal(args.matchId, 'f5e4e3f93cc9c011')
    assert.equal(args.requestedAt, '2023-11-14T22:13:19.000Z')
    assert.equal(args.allocateBefore, '2023-11-14T22:18:20.000Z')
    assert.equal(args.settleBefore, '2023-11-14T23:13:20.000Z')
    assert.equal(args.buyFunding.allocationFactoryCid, 'factory-cid')
    assert.equal(args.sellFunding.allocationFactoryCid, 'factory-cid')
  })

  // Scenario: Carpincho submits the frontend-built match command directly to
  // Canton. Token-standard TextMap fields must therefore use JSON object shape,
  // otherwise the participant rejects the transaction before contract logic runs.
  test('matchCommand serializes empty token-standard extra args as objects', () => {
    const command = matchCommand({
      poolCid: 'pool-cid',
      factoryCid: 'factory-cid',
      plan: {
        poolId: 'TTA-TTB',
        buyOrderCid: 'buy-cid',
        sellOrderCid: 'sell-cid',
        fillQty: '10.0000000000',
      },
      nowMs: 1_700_000_000_000,
    })
    const args = command.ExerciseCommand.choiceArgument

    // Empty maps remain maps: Canton decodes TextMap from JSON objects, not
    // arrays, so every ExtraArgs path must expose `{}` for values.
    assert.deepEqual(args.buyFunding, {
      allocationFactoryCid: 'factory-cid',
      allocateArgs: { context: { values: {} }, meta: { values: {} } },
    })
    assert.deepEqual(args.buyExecuteArgs, { context: { values: {} }, meta: { values: {} } })
    assert.deepEqual(args.sellExecuteArgs, { context: { values: {} }, meta: { values: {} } })
  })

  // Scenario: placement needs concrete RegistryHolding cids, not just balance
  // totals. The frontend reads ACS through the connected wallet and normalizes
  // participant-native active-contract rows.
  test('normalizes holdings and selects enough funding cids', () => {
    const holding = normalizeHoldingContract({
      contractEntry: {
        JsActiveContract: {
          createdEvent: {
            contractId: 'holding-1',
            createArgument: {
              owner: 'alice::participant',
              instrumentId: { admin: 'admin::participant', id: 'TTB' },
              amount: '25.0',
            },
            offset: 7,
          },
        },
      },
    })

    // The normalized row feeds the same largest-first selection policy as the
    // backend, so the trader declares enough unlocked funding before signing.
    assert.deepEqual(holding, {
      contractId: 'holding-1',
      owner: 'alice::participant',
      instrument: { admin: 'admin::participant', id: 'TTB' },
      amount: '25.0',
    })
    assert.deepEqual(
      selectFundingHoldingCids([holding], {
        owner: 'alice::participant',
        instrumentId: { admin: 'admin::participant', id: 'TTB' },
        side: 'Buy',
        quantity: 10,
        limitPrice: 2,
      }),
      ['holding-1'],
    )
  })
})
