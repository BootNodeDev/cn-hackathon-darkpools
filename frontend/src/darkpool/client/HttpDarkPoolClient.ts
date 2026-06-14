import type {
  Balance,
  DarkPoolClient,
  Fill,
  InstrumentId,
  MatchPlan,
  Order,
  PassResult,
  PlaceOrderRequest,
  Pool,
  Side,
  Trade,
} from '@/darkpool/types'

const POLL_INTERVAL_MS = 3000
const DEFAULT_API_URL = 'http://localhost:3020'
const EMPTY_POOLS: Pool[] = []
const EMPTY_BALANCES: Balance[] = []
const EMPTY_ORDERS: Order[] = []
const EMPTY_FILLS: Fill[] = []
const EMPTY_TRADES: Trade[] = []

interface BackendPool {
  poolId: string
  base: InstrumentId
  quote: InstrumentId
  minFillFloor: string
}

interface BackendOrder {
  cid: string
  poolId: string
  side: Side
  quantity: string
  limitPrice: string
  minFill: string
  submittedAt: number
  expiresAt: number | null
}

interface BackendTrade {
  tradeId: string
  poolId: string
  price: string
  quantity: string
  buyer: string
  seller: string
  settledAt: number
}

interface BackendFill {
  tradeId: string
  poolId: string
  side: Side
  price: string
  quantity: string
  settledAt: number
}

interface BackendBalance {
  instrument: InstrumentId
  total: string
  declared: string
}

export interface DisclosedContract {
  templateId: string
  contractId: string
  createdEventBlob: string
  synchronizerId?: string
}

export interface DarkPoolLedgerConfig {
  poolCid: string
  factoryCid: string
  poolId: string
  parties: { venue: string; admin: string }
  instruments: { base: InstrumentId; quote: InstrumentId }
  templateIds: Record<string, string>
  disclosedContracts: DisclosedContract[]
}

export interface BackendVenueResponse {
  pools: Record<
    string,
    {
      pool: BackendPool
      book: BackendOrder[]
      trades: BackendTrade[]
      stats: unknown
    }
  >
  schedule: { intervalMs: number; nextRunAt: number | null }
}

export interface BackendTradeResponse {
  pools: BackendPool[]
  orders: BackendOrder[]
  fills: BackendFill[]
  balances: BackendBalance[]
}

export interface VenueState {
  pools: Pool[]
  bookByPool: Record<string, Order[]>
  tradesByPool: Record<string, Trade[]>
}

export interface TradeState {
  pools: Pool[]
  orders: Order[]
  fills: Fill[]
  balances: Balance[]
}

export interface MatchPlanResponse {
  ranAt: number
  syncOffset: number
  plans: MatchPlan[]
  disclosedContracts: DisclosedContract[]
}

export interface MatchSyncRequest {
  beginExclusive: number
  endInclusive: number
}

export const darkPoolQueryConfig = {
  pollIntervalMs: POLL_INTERVAL_MS,
} as const

// Resolves the backend base URL once per request path.
export const getDarkPoolApiUrl = (): string => {
  const value = import.meta.env.VITE_DARK_POOL_API
  return (typeof value === 'string' && value.trim() !== '' ? value : DEFAULT_API_URL).replace(
    /\/+$/,
    '',
  )
}

// Parses decimal DTO values into the number model used by existing panels.
const toNumber = (value: string | number | null | undefined): number => Number(value ?? 0)

// Uses the instrument id as the visible label because backend config is ledger-shaped.
const labelOf = (instrument: InstrumentId): string => instrument.id

// Converts backend pool DTOs into the richer frontend pool model.
const mapPool = (pool: BackendPool): Pool => ({
  poolId: pool.poolId,
  base: pool.base,
  quote: pool.quote,
  baseLabel: labelOf(pool.base),
  quoteLabel: labelOf(pool.quote),
  minFillFloor: toNumber(pool.minFillFloor),
})

// Converts backend order DTOs into table rows used by trader and venue panels.
const mapOrder = (order: BackendOrder, trader: string): Order => ({
  orderId: order.cid,
  poolId: order.poolId,
  trader,
  side: order.side,
  quantity: toNumber(order.quantity),
  limitPrice: toNumber(order.limitPrice),
  minFill: toNumber(order.minFill),
  expiresAt: order.expiresAt,
  submittedAt: order.submittedAt,
})

// Converts backend trade DTOs into chart and settlement-history rows.
const mapTrade = (trade: BackendTrade): Trade => ({
  tradeId: trade.tradeId,
  poolId: trade.poolId,
  price: toNumber(trade.price),
  quantity: toNumber(trade.quantity),
  buyer: trade.buyer,
  seller: trade.seller,
  settledAt: trade.settledAt,
})

// Converts backend fill DTOs into trader-visible fill history rows.
const mapFill = (fill: BackendFill): Fill => {
  const price = toNumber(fill.price)
  const quantity = toNumber(fill.quantity)
  return {
    fillId: fill.tradeId,
    poolId: fill.poolId,
    side: fill.side,
    price,
    quantity,
    notional: price * quantity,
    counterpartyLabel: 'private',
    settledAt: fill.settledAt,
  }
}

// Converts backend balance DTOs into the display model used by balance panels.
const mapBalance = (balance: BackendBalance): Balance => ({
  instrument: balance.instrument,
  label: labelOf(balance.instrument),
  total: toNumber(balance.total),
  declared: toNumber(balance.declared),
})

// Normalizes the operator response into lookup tables by pool id.
export const mapVenueResponse = (response: BackendVenueResponse): VenueState => ({
  pools: Object.values(response.pools).map((entry) => mapPool(entry.pool)),
  bookByPool: Object.fromEntries(
    Object.entries(response.pools).map(([poolId, entry]) => [
      poolId,
      entry.book.map((order) => mapOrder(order, 'private')),
    ]),
  ),
  tradesByPool: Object.fromEntries(
    Object.entries(response.pools).map(([poolId, entry]) => [poolId, entry.trades.map(mapTrade)]),
  ),
})

// Normalizes the trader response into rows owned by the connected party.
export const mapTradeResponse = (party: string, response: BackendTradeResponse): TradeState => ({
  pools: response.pools.map(mapPool),
  orders: response.orders.map((order) => mapOrder(order, party)),
  fills: response.fills.map(mapFill),
  balances: response.balances.map(mapBalance),
})

// Sends JSON requests to the dark-pool backend and surfaces response errors.
const requestJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${getDarkPoolApiUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return (text === '' ? {} : JSON.parse(text)) as T
}

// Fetches the venue snapshot used by operator and market panels.
export const fetchVenueState = async (): Promise<VenueState> =>
  mapVenueResponse(await requestJson<BackendVenueResponse>('/venue'))

// Fetches the connected trader snapshot used by balances, own orders, and fills.
export const fetchTradeState = async (party: string): Promise<TradeState> =>
  mapTradeResponse(
    party,
    await requestJson<BackendTradeResponse>(`/trade?party=${encodeURIComponent(party)}`),
  )

// Fetches ledger ids and disclosures required for frontend-formed transactions.
export const fetchDarkPoolConfig = async (): Promise<DarkPoolLedgerConfig> =>
  requestJson<DarkPoolLedgerConfig>('/config')

// Fetches unsigned venue match plans; Carpincho executes the actual match command.
export const fetchMatchPlan = async (): Promise<MatchPlanResponse> =>
  requestJson<MatchPlanResponse>('/venue/match-plan', { method: 'POST', body: '{}' })

// Syncs wallet-signed match effects into the backend read projection.
export const syncMatchExecution = async (request: MatchSyncRequest): Promise<void> => {
  await requestJson('/venue/match-sync', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

// Polling read client that keeps the existing synchronous DarkPoolClient API.
export class HttpDarkPoolClient implements DarkPoolClient {
  private venue: VenueState = { pools: EMPTY_POOLS, bookByPool: {}, tradesByPool: {} }
  private trades = new Map<string, TradeState>()
  private tradeTimers = new Map<string, ReturnType<typeof setInterval>>()
  private listeners = new Set<() => void>()
  private venueTimer: ReturnType<typeof setInterval>

  constructor() {
    this.refreshVenueSafe()
    this.venueTimer = setInterval(() => {
      this.refreshVenueSafe()
    }, POLL_INTERVAL_MS)
  }

  // Stops background polling when the provider unmounts.
  close(): void {
    clearInterval(this.venueTimer)
    for (const timer of this.tradeTimers.values()) {
      clearInterval(timer)
    }
    this.tradeTimers.clear()
  }

  // Notifies React subscribers after a fresh backend snapshot lands.
  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  // Keeps background venue polling from surfacing transient network failures as unhandled rejections.
  private refreshVenueSafe(): void {
    void this.refreshVenue().catch(() => undefined)
  }

  // Keeps background trader polling from surfacing transient network failures as unhandled rejections.
  private refreshPartySafe(party: string): void {
    void this.refreshParty(party).catch(() => undefined)
  }

  // Refreshes venue-visible pools, book, and trade history from the backend.
  async refreshVenue(): Promise<void> {
    this.venue = await fetchVenueState()
    this.notify()
  }

  // Refreshes one trader snapshot from the backend.
  async refreshParty(party: string): Promise<void> {
    this.trades.set(party, await fetchTradeState(party))
    this.notify()
  }

  // Starts polling the connected trader snapshot when a component first asks for it.
  private ensureParty(party: string): void {
    if (this.tradeTimers.has(party)) {
      return
    }
    this.refreshPartySafe(party)
    this.tradeTimers.set(
      party,
      setInterval(() => {
        this.refreshPartySafe(party)
      }, POLL_INTERVAL_MS),
    )
  }

  // Returns the latest pool snapshot.
  listPools(): Pool[] {
    return this.venue.pools
  }

  // Returns the latest known balances for a trader.
  getBalances(party: string): Balance[] {
    this.ensureParty(party)
    return this.trades.get(party)?.balances ?? EMPTY_BALANCES
  }

  // Returns the latest known open orders for a trader.
  listMyOrders(party: string): Order[] {
    this.ensureParty(party)
    return this.trades.get(party)?.orders ?? EMPTY_ORDERS
  }

  // Returns the latest known fills for a trader.
  listMyFills(party: string): Fill[] {
    this.ensureParty(party)
    return this.trades.get(party)?.fills ?? EMPTY_FILLS
  }

  // Returns the venue-visible book for one pool.
  listBook(poolId: string): Order[] {
    return this.venue.bookByPool[poolId] ?? EMPTY_ORDERS
  }

  // Returns the venue-visible trade history for one pool.
  listTrades(poolId: string): Trade[] {
    return this.venue.tradesByPool[poolId] ?? EMPTY_TRADES
  }

  // Registers a snapshot listener for useSyncExternalStore.
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // Mutations are executed through Carpincho in useDarkPoolActions.
  placeOrder(_party: string, _req: PlaceOrderRequest): Promise<Order> {
    return Promise.reject(new Error('placeOrder must be executed through the connected wallet'))
  }

  // Mutations are executed through Carpincho in useDarkPoolActions.
  cancelOrder(_party: string, _orderId: string): Promise<void> {
    return Promise.reject(new Error('cancelOrder must be executed through the connected wallet'))
  }

  // Mutations are executed through Carpincho in useDarkPoolActions.
  runMatchPass(): Promise<PassResult> {
    return Promise.reject(new Error('runMatchPass must be executed through the connected wallet'))
  }
}

// Kept for tests and old callers; UI mutations are wired through useExecute.
export const cancelOrderRequest = async (_party: string, _orderId: string): Promise<void> => {
  throw new Error('cancelOrderRequest is replaced by wallet execution')
}

// Kept for tests and old callers; UI mutations are wired through useExecute.
export const placeOrderRequest = async (
  _party: string,
  _req: PlaceOrderRequest,
): Promise<Order> => {
  throw new Error('placeOrderRequest is replaced by wallet execution')
}

// Kept for tests and old callers; UI mutations are wired through useExecute.
export const runMatchPassRequest = async () => {
  throw new Error('runMatchPassRequest is replaced by wallet execution')
}
