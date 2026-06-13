import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHttpLedger } from '../src/ledger.ts'

// Scenario: Canton JSON Ledger API v2 encodes identifier filters with a
// oneof-style wrapper. The active-contracts request must include that wrapper
// so the remote validator can parse the template filter before reading ACS.
test('activeContracts sends wrapped TemplateFilter body expected by JSON Ledger API v2', async () => {
  // This fixture records only the request body sent to active-contracts. The
  // ledger-end response gives the client a stable offset to reuse in that body.
  let activeContractsBody: unknown

  // The fake fetch captures the boundary between our client and the JSON API:
  // first ledger-end returns offset 7, then active-contracts receives the query
  // whose filter shape is the behavior under test.
  const ledger = createHttpLedger('https://ledger.example', {
    getToken: async () => 'token',
  })
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(_input)
    if (url.endsWith('/v2/state/ledger-end')) {
      return Response.json({ offset: 7 })
    }
    if (url.endsWith('/v2/state/active-contracts')) {
      activeContractsBody = JSON.parse(String(init?.body))
      return Response.json([])
    }
    throw new Error(`unexpected URL ${url}`)
  }) as typeof fetch

  try {
    // The action asks for one template visible to one party; the request should
    // carry exactly that party and template through the v2 filter wrapper.
    await ledger.activeContracts('Alice::participant', '#pkg:Module:Template')
  } finally {
    // The global fetch is restored so this transport-level test cannot affect
    // later tests that use real or different fake HTTP clients.
    globalThis.fetch = originalFetch
  }

  // Expected behavior: TemplateFilter has a required `value` field around the
  // actual template query. Without it, FiveNorth rejects the body with
  // "Missing required field at 'value'" before executing the ACS query.
  assert.deepEqual(activeContractsBody, {
    activeAtOffset: 7,
    eventFormat: {
      filtersByParty: {
        'Alice::participant': {
          cumulative: [
            {
              identifierFilter: {
                TemplateFilter: {
                  value: {
                    templateId: '#pkg:Module:Template',
                    includeCreatedEventBlob: false,
                  },
                },
              },
            },
          ],
        },
      },
      verbose: true,
    },
  })
})
