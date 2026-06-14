import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { completionOffsetOf } from './walletExecution'

describe('wallet execution result parsing', () => {
  // Scenario: Carpincho prepareExecuteAndWait returns the executed transaction
  // metadata under tx.payload. The dark-pool frontend must extract the
  // completion offset so the backend can sync only the ledger range that was
  // just signed by the venue wallet.
  test('completionOffsetOf reads the Carpincho tx payload offset', () => {
    // This fixture mirrors the successful result shape returned by the
    // extension after executePrepared completes.
    const result = {
      tx: {
        status: 'executed',
        commandId: 'match-1',
        payload: {
          updateId: 'update-1',
          completionOffset: 42,
        },
      },
    }

    // Expected behavior: the numeric completion offset is returned directly for
    // use as /venue/match-sync endInclusive.
    assert.equal(completionOffsetOf(result), 42)
  })

  // Scenario: a malformed or older wallet response cannot safely identify a
  // ledger range. The caller should treat that as a sync failure instead of
  // guessing an offset.
  test('completionOffsetOf rejects missing or non-numeric offsets', () => {
    // These fixtures represent responses that do not prove which ledger update
    // was executed, so they must not be accepted for backend sync.
    const missingPayload = { tx: { status: 'executed' } }
    const stringOffset = { tx: { payload: { completionOffset: '42' } } }

    // Expected behavior: invalid shapes produce undefined, allowing the caller
    // to throw a clear wallet-sync error.
    assert.equal(completionOffsetOf(missingPayload), undefined)
    assert.equal(completionOffsetOf(stringOffset), undefined)
  })
})
