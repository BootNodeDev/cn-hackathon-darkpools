import { type LedgerApiParams, useExecute, useLedger } from 'canton-connect-kit'
import { useCallback, useSyncExternalStore } from 'react'
import {
  darkPoolQueryConfig,
  fetchDarkPoolConfig,
  fetchMatchPlan,
  HttpDarkPoolClient,
  syncMatchExecution,
} from '@/darkpool/client/HttpDarkPoolClient'
import { useDarkPoolClient } from '@/darkpool/DarkPoolProvider'
import {
  cancelOrderCommand,
  matchCommand,
  normalizeHoldingContract,
  placeOrderCommand,
  selectFundingHoldingCids,
  TEMPLATE_IDS,
} from '@/darkpool/ledgerCommands'
import type {
  Balance,
  DarkPoolClient,
  Fill,
  Order,
  PassResult,
  PlaceOrderRequest,
  Pool,
  Trade,
} from '@/darkpool/types'
import { completionOffsetOf } from '@/darkpool/walletExecution'

const useSnapshot = <T>(read: (client: DarkPoolClient) => T): T => {
  const client = useDarkPoolClient()
  const subscribe = useCallback((cb: () => void) => client.subscribe(cb), [client])
  const getSnapshot = useCallback(() => read(client), [client, read])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

type LedgerApi = (params: LedgerApiParams) => Promise<unknown>

interface DarkPoolActions {
  placeOrder: (party: string, req: PlaceOrderRequest) => Promise<Order>
  cancelOrder: (party: string, orderId: string) => Promise<void>
  runMatchPass: () => Promise<PassResult>
}

// Creates a unique command id for wallet activity and participant deduplication.
const commandId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

// Reads active contracts through the connected wallet's JSON API pass-through.
const readActiveContracts = async (
  ledgerApi: LedgerApi,
  party: string,
  templateId: string,
): Promise<unknown[]> => {
  const ledgerEnd = (await ledgerApi({
    requestMethod: 'get',
    resource: '/v2/state/ledger-end',
  })) as { offset?: number }
  if (typeof ledgerEnd.offset !== 'number') {
    throw new Error('ledger-end did not return an offset')
  }
  const response = await ledgerApi({
    requestMethod: 'post',
    resource: '/v2/state/active-contracts',
    body: {
      filter: {
        filtersByParty: {
          [party]: {
            cumulative: [
              {
                identifierFilter: {
                  TemplateFilter: {
                    value: { templateId, includeCreatedEventBlob: false },
                  },
                },
              },
            ],
          },
        },
      },
      activeAtOffset: ledgerEnd.offset,
      verbose: true,
    },
  })
  return Array.isArray(response) ? response : []
}

// Reads the trader's token holding CIDs so placement can declare funding.
const loadHoldingContracts = async (ledgerApi: LedgerApi, party: string) =>
  (await readActiveContracts(ledgerApi, party, TEMPLATE_IDS.registryHolding)).map(
    normalizeHoldingContract,
  )

// Keeps the old action API returning an order even though callers only need success/failure.
const refetchCreatedOrder = async (
  client: HttpDarkPoolClient,
  party: string,
  req: PlaceOrderRequest,
): Promise<Order> => {
  await client.refreshParty(party)
  return (
    client
      .listMyOrders(party)
      .find(
        (order) =>
          order.poolId === req.poolId &&
          order.side === req.side &&
          order.quantity === req.quantity &&
          order.limitPrice === req.limitPrice &&
          order.minFill === req.minFill,
      ) ?? {
      orderId: '',
      poolId: req.poolId,
      trader: party,
      side: req.side,
      quantity: req.quantity,
      limitPrice: req.limitPrice,
      minFill: req.minFill,
      expiresAt: req.expiresAt,
      submittedAt: Date.now(),
    }
  )
}

export const usePools = (): Pool[] =>
  useSnapshot(useCallback((c: DarkPoolClient) => c.listPools(), []))

export const useBalances = (party: string): Balance[] =>
  useSnapshot(useCallback((c: DarkPoolClient) => c.getBalances(party), [party]))

export const useMyOrders = (party: string): Order[] =>
  useSnapshot(useCallback((c: DarkPoolClient) => c.listMyOrders(party), [party]))

export const useMyFills = (party: string): Fill[] =>
  useSnapshot(useCallback((c: DarkPoolClient) => c.listMyFills(party), [party]))

export const useBook = (poolId: string): Order[] =>
  useSnapshot(useCallback((c: DarkPoolClient) => c.listBook(poolId), [poolId]))

export const useTrades = (poolId: string): Trade[] =>
  useSnapshot(useCallback((c: DarkPoolClient) => c.listTrades(poolId), [poolId]))

export const useDarkPoolActions = (): DarkPoolActions => {
  const client = useDarkPoolClient()
  const { execute } = useExecute()
  const { ledgerApi } = useLedger()

  return {
    placeOrder: async (party, req) => {
      if (!(client instanceof HttpDarkPoolClient)) {
        return client.placeOrder(party, req)
      }
      const config = await fetchDarkPoolConfig()
      if (req.poolId !== config.poolId) {
        throw new Error(`unknown pool ${req.poolId}`)
      }
      const fundingInstrument =
        req.side === 'Buy' ? config.instruments.quote : config.instruments.base
      const holdingCids = selectFundingHoldingCids(await loadHoldingContracts(ledgerApi, party), {
        owner: party,
        instrumentId: fundingInstrument,
        side: req.side,
        quantity: req.quantity,
        limitPrice: req.limitPrice,
      })
      if (holdingCids.length === 0) {
        throw new Error('insufficient funding holdings to cover the order')
      }
      await execute({
        commandId: commandId('place-order'),
        commands: [
          placeOrderCommand({
            poolCid: config.poolCid,
            trader: party,
            side: req.side,
            quantity: req.quantity,
            limitPrice: req.limitPrice,
            minFill: req.minFill,
            expiresAt: req.expiresAt,
            holdingCids,
          }),
        ],
        actAs: [party],
        readAs: [party],
        disclosedContracts: config.disclosedContracts,
        synchronizerId: config.disclosedContracts[0]?.synchronizerId,
      })
      await client.refreshVenue()
      return refetchCreatedOrder(client, party, req)
    },
    cancelOrder: async (party, orderId) => {
      if (!(client instanceof HttpDarkPoolClient)) {
        return client.cancelOrder(party, orderId)
      }
      await execute({
        commandId: commandId('cancel-order'),
        commands: [cancelOrderCommand(orderId)],
        actAs: [party],
        readAs: [party],
      })
      await Promise.all([client.refreshVenue(), client.refreshParty(party)])
    },
    runMatchPass: async () => {
      if (!(client instanceof HttpDarkPoolClient)) {
        return client.runMatchPass()
      }
      const [config, planned] = await Promise.all([fetchDarkPoolConfig(), fetchMatchPlan()])
      const matchDisclosures = [...config.disclosedContracts, ...planned.disclosedContracts]
      let syncOffset = planned.syncOffset
      let matched = 0
      let rejected = 0
      for (const plan of planned.plans) {
        try {
          const result = await execute({
            commandId: commandId('match'),
            commands: [
              matchCommand({
                poolCid: config.poolCid,
                factoryCid: config.factoryCid,
                plan,
                nowMs: planned.ranAt,
              }),
            ],
            actAs: [config.parties.venue],
            readAs: [config.parties.venue],
            disclosedContracts: matchDisclosures,
            synchronizerId: matchDisclosures[0]?.synchronizerId,
          })
          const completionOffset = completionOffsetOf(result)
          if (completionOffset === undefined) {
            throw new Error('wallet execution did not return a completion offset')
          }
          await syncMatchExecution({ beginExclusive: syncOffset, endInclusive: completionOffset })
          syncOffset = completionOffset
          matched += 1
        } catch {
          rejected += 1
        }
      }
      await client.refreshVenue()
      return {
        ranAt: planned.ranAt,
        matched,
        rejected,
        nextRunAt: Date.now() + darkPoolQueryConfig.pollIntervalMs,
      }
    },
  }
}
