// Express routers (spec §6). /venue is the operator view (sees the whole book);
// /trade?party= is a trader view (own orders only) — the dark-pool privacy model.
import { createHash } from 'node:crypto'
import cors from 'cors'
import express, { type Express, type Request, type Response } from 'express'
import { cancelOrder, mint, placeOrder } from './commands.ts'
import type { Config } from './config.ts'
import { requiredFunding, selectFunding } from './funding.ts'
import { createdCid, type Ledger, type Transaction } from './ledger.ts'
import { findMatches } from './matcher.ts'
import { bookFor, myOrders, type Projection, toBalances } from './projection.ts'
import type { Scheduler } from './scheduler.ts'
import { TEMPLATE_IDS } from './templateIds.ts'
import type {
  Balance,
  FillDto,
  Holding,
  InstrumentId,
  MatchPlan,
  OrderContract,
  OrderDto,
  Side,
  Trade,
} from './types.ts'

export interface AppContext {
  config: Config
  ledger: Ledger
  projection: Projection
  scheduler: Scheduler
}

const MIN_INTERVAL_MS = 1000
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000
const DEFAULT_FAUCET_AMOUNT = '1000.0'

type MatchResult = { execPrice: string; fillQty: string }

const instrumentsOf = (config: Config): InstrumentId[] => [
  config.instruments.base,
  config.instruments.quote,
]

const sameInstrument = (a: InstrumentId, b: InstrumentId): boolean =>
  a.admin === b.admin && a.id === b.id

const fundingInstrument = (config: Config, side: Side): InstrumentId =>
  side === 'Buy' ? config.instruments.quote : config.instruments.base

const orderDto = (order: OrderContract): OrderDto => ({
  cid: order.contractId,
  poolId: order.poolId,
  side: order.side,
  quantity: order.quantity,
  limitPrice: order.limitPrice,
  minFill: order.minFill,
  submittedAt: order.createdOffset,
  expiresAt: order.expiresAt,
})

const fillDto = (trade: Trade, party: string): FillDto => ({
  tradeId: trade.tradeId,
  poolId: trade.poolId,
  side: trade.buyer === party ? 'Buy' : 'Sell',
  price: trade.price,
  quantity: trade.quantity,
  settledAt: trade.settledAt,
})

const poolStats = (book: OrderContract[], trades: Trade[]) => ({
  openBuys: book.filter((order) => order.side === 'Buy').length,
  openSells: book.filter((order) => order.side === 'Sell').length,
  matchesSettled: trades.length,
  lastTrade: trades.at(-1) ?? null,
})

const holdingsOf = (projection: Projection, party: string, instrument: InstrumentId): Holding[] =>
  projection
    .holdings()
    .filter((holding) => holding.owner === party && sameInstrument(holding.instrument, instrument))

const balancesOf = (projection: Projection, config: Config, party: string): Balance[] =>
  toBalances(projection.holdings(), projection.openOrders(), party, instrumentsOf(config))

// Creates the same stable trade id used by backend-submitted settlements.
const tradeIdOf = (buyOrderCid: string, sellOrderCid: string): string =>
  createHash('sha256').update(`${buyOrderCid}:${sellOrderCid}`).digest('hex').slice(0, 16)

// Accepts only the authoritative MatchResult fields emitted by the Daml choice.
const matchResultOf = (value: unknown): MatchResult | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const result = value as Record<string, unknown>
  return typeof result.execPrice === 'string' && typeof result.fillQty === 'string'
    ? { execPrice: result.execPrice, fillQty: result.fillQty }
    : null
}

// Identifies archived Order contracts even when Canton returns package-qualified ids.
const isOrderTemplate = (templateId: string): boolean => templateId.endsWith(':DarkPool:Order')

// Shapes a created event as a Canton disclosed contract for interactive submits.
const disclosedContract = (contract: {
  contractId: string
  templateId: string
  createdEventBlob?: string
  synchronizerId?: string
}) => ({
  templateId: contract.templateId,
  contractId: contract.contractId,
  createdEventBlob: contract.createdEventBlob ?? '',
  synchronizerId: contract.synchronizerId ?? '',
})

// Collects the token holdings that the planned orders will consume during match settlement.
const holdingCidsForPlans = (plans: MatchPlan[], orders: OrderContract[]): string[] => {
  const ordersByCid = new Map(orders.map((order) => [order.contractId, order]))
  const cids = new Set<string>()
  for (const plan of plans) {
    for (const orderCid of [plan.buyOrderCid, plan.sellOrderCid]) {
      for (const holdingCid of ordersByCid.get(orderCid)?.holdingCids ?? []) {
        cids.add(holdingCid)
      }
    }
  }
  return [...cids]
}

// Fetches only the holding disclosures needed by the current unsigned match plan.
const holdingDisclosures = async (ctx: AppContext, holdingCids: string[]) => {
  if (holdingCids.length === 0) {
    return []
  }
  const holdings = await ctx.ledger.activeContracts(
    ctx.config.parties.admin,
    TEMPLATE_IDS.registryHolding,
    { includeCreatedEventBlob: true },
  )
  const holdingsByCid = new Map(holdings.map((holding) => [holding.contractId, holding]))
  return holdingCids
    .map((cid) => holdingsByCid.get(cid))
    .filter((holding) => holding !== undefined)
    .map(disclosedContract)
}

// Extracts a verified trade from one ledger transaction containing DarkPool_Match.
const tradeFromTransaction = (
  tx: Transaction,
  ordersByCid: Map<string, OrderContract>,
  existingTradeIds: Set<string>,
): Trade | null => {
  const matchEvent = tx.events.find((event) => event.ExercisedEvent?.choice === 'DarkPool_Match')
  const result = matchResultOf(matchEvent?.ExercisedEvent?.exerciseResult)
  if (result === null) {
    return null
  }
  const archivedOrders = tx.events
    .map((event) => event.ArchivedEvent)
    .filter(
      (event): event is { contractId: string; templateId: string } =>
        event !== undefined && isOrderTemplate(event.templateId),
    )
    .map((event) => ordersByCid.get(event.contractId))
    .filter((order) => order !== undefined)
  const buy = archivedOrders.find((order) => order.side === 'Buy')
  const sell = archivedOrders.find((order) => order.side === 'Sell')
  if (buy === undefined || sell === undefined) {
    throw new Error(`cannot resolve matched orders from ledger update ${tx.offset}`)
  }
  const tradeId = tradeIdOf(buy.contractId, sell.contractId)
  if (existingTradeIds.has(tradeId)) {
    return null
  }
  existingTradeIds.add(tradeId)
  return {
    tradeId,
    poolId: buy.poolId,
    price: result.execPrice,
    quantity: result.fillQty,
    buyer: buy.trader,
    seller: sell.trader,
    settledAt: Date.now(),
  }
}

// Reads wallet-submitted match updates and mirrors them into the API projection.
const syncWalletMatches = async (
  ctx: AppContext,
  beginExclusive: number,
  endInclusive: number,
): Promise<Trade[]> => {
  const ordersByCid = new Map(
    ctx.projection.knownOrders().map((order) => [order.contractId, order]),
  )
  const existingTradeIds = new Set(ctx.projection.trades().map((trade) => trade.tradeId))
  const updates = await ctx.ledger.updatesFrom(
    ctx.config.parties.venue,
    beginExclusive,
    endInclusive,
  )
  const trades = updates
    .map((tx) => tradeFromTransaction(tx, ordersByCid, existingTradeIds))
    .filter((trade) => trade !== null)
  for (const trade of trades) {
    ctx.projection.recordTrade(trade)
  }
  await ctx.projection.refresh()
  return trades
}

// Returns the static ledger ids and disclosure the frontend needs to form txs.
const getConfig =
  (ctx: AppContext) =>
  async (_req: Request, res: Response): Promise<void> => {
    const [pools, registries] = await Promise.all([
      ctx.ledger.activeContracts(ctx.config.parties.venue, TEMPLATE_IDS.darkPool, {
        includeCreatedEventBlob: true,
      }),
      ctx.ledger.activeContracts(ctx.config.parties.admin, TEMPLATE_IDS.registry, {
        includeCreatedEventBlob: true,
      }),
    ])
    const pool = pools.find((candidate) => candidate.contractId === ctx.config.poolCid)
    if (pool === undefined) {
      res.status(404).json({ error: `pool ${ctx.config.poolCid} not found` })
      return
    }
    const registry = registries.find((candidate) => candidate.contractId === ctx.config.factoryCid)
    if (registry === undefined) {
      res.status(404).json({ error: `registry factory ${ctx.config.factoryCid} not found` })
      return
    }
    res.json({
      poolCid: ctx.config.poolCid,
      factoryCid: ctx.config.factoryCid,
      poolId: ctx.config.poolId,
      parties: ctx.config.parties,
      instruments: ctx.config.instruments,
      templateIds: TEMPLATE_IDS,
      disclosedContracts: [disclosedContract(pool), disclosedContract(registry)],
    })
  }

const getVenue =
  (ctx: AppContext) =>
  async (_req: Request, res: Response): Promise<void> => {
    await ctx.projection.refresh()
    const trades = ctx.projection.trades()
    const orders = ctx.projection.openOrders()
    const pools = Object.fromEntries(
      ctx.projection.pools().map((pool) => {
        const book = bookFor(orders, pool.poolId)
        const poolTrades = trades.filter((trade) => trade.poolId === pool.poolId)
        return [
          pool.poolId,
          {
            pool,
            book: book.map(orderDto),
            trades: poolTrades,
            stats: poolStats(book, poolTrades),
          },
        ]
      }),
    )
    res.json({ pools, schedule: ctx.scheduler.schedule() })
  }

const getTrade =
  (ctx: AppContext) =>
  async (req: Request, res: Response): Promise<void> => {
    const party = String(req.query.party ?? '')
    if (party === '') {
      res.status(400).json({ error: 'party query parameter is required' })
      return
    }
    await ctx.projection.refresh()
    const trades = ctx.projection
      .trades()
      .filter((trade) => trade.buyer === party || trade.seller === party)
    res.json({
      pools: ctx.projection.pools(),
      orders: myOrders(ctx.projection.openOrders(), party).map(orderDto),
      fills: trades.map((trade) => fillDto(trade, party)),
      balances: balancesOf(ctx.projection, ctx.config, party),
    })
  }

const postFaucet =
  (ctx: AppContext) =>
  async (req: Request, res: Response): Promise<void> => {
    const { party, instrument, amount } = req.body as {
      party?: string
      instrument?: string
      amount?: string
    }
    if (!party) {
      res.status(400).json({ error: 'party is required' })
      return
    }
    const symbol = instrument ?? ctx.config.instruments.base.id
    const instrumentId = [ctx.config.instruments.base, ctx.config.instruments.quote].find(
      (candidate) => candidate.id === symbol,
    )
    if (instrumentId === undefined) {
      res.status(404).json({ error: `unknown instrument ${symbol}` })
      return
    }
    const command = mint({
      factoryCid: ctx.config.factoryCid,
      instrumentId,
      owner: party,
      amount: amount ?? DEFAULT_FAUCET_AMOUNT,
    })
    await ctx.ledger.submit(ctx.config.parties.admin, [command])
    await ctx.projection.refresh()
    res.json({ balances: balancesOf(ctx.projection, ctx.config, party) })
  }

interface PlaceBody {
  party?: string
  poolId?: string
  side?: Side
  quantity?: string
  limitPrice?: string
  minFill?: string
  expiresAt?: number | null
}

const postOrders =
  (ctx: AppContext) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as PlaceBody
    if (!body.party || !body.side || !body.quantity || !body.limitPrice || !body.minFill) {
      res.status(400).json({ error: 'party, side, quantity, limitPrice, minFill are required' })
      return
    }
    if (body.poolId !== undefined && body.poolId !== ctx.config.poolId) {
      res.status(404).json({ error: `unknown pool ${body.poolId}` })
      return
    }
    await ctx.projection.refresh()
    const required = requiredFunding(body.side, body.quantity, body.limitPrice)
    const holdings = holdingsOf(
      ctx.projection,
      body.party,
      fundingInstrument(ctx.config, body.side),
    )
    const holdingCids = selectFunding(holdings, required)
    if (holdingCids === null) {
      res.status(400).json({ error: 'insufficient funding holdings to cover the order' })
      return
    }
    const command = placeOrder({
      poolCid: ctx.config.poolCid,
      trader: body.party,
      side: body.side,
      quantity: body.quantity,
      limitPrice: body.limitPrice,
      minFill: body.minFill,
      expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
      holdingCids,
    })
    const events = await ctx.ledger.submit(body.party, [command])
    const cid = createdCid(events, ':DarkPool:Order')
    await ctx.projection.refresh()
    const created = ctx.projection.openOrders().find((order) => order.contractId === cid)
    res.status(201).json({ order: created ? orderDto(created) : { cid } })
  }

const deleteOrder =
  (ctx: AppContext) =>
  async (req: Request, res: Response): Promise<void> => {
    const party = (req.body as { party?: string }).party
    if (!party) {
      res.status(400).json({ error: 'party is required' })
      return
    }
    const cid = String(req.params.cid)
    await ctx.ledger.submit(party, [cancelOrder(cid)])
    await ctx.projection.refresh()
    res.json({ cancelled: cid })
  }

const postMatch =
  (ctx: AppContext) =>
  async (_req: Request, res: Response): Promise<void> => {
    const report = await ctx.scheduler.runPass()
    res.json({ ...report, schedule: ctx.scheduler.schedule() })
  }

// Returns the matcher output only; the venue wallet submits settlement later.
const postMatchPlan =
  (ctx: AppContext) =>
  async (_req: Request, res: Response): Promise<void> => {
    await ctx.projection.refresh()
    const syncOffset = await ctx.ledger.ledgerEnd()
    const ranAt = Date.now()
    const orders = ctx.projection.openOrders()
    const pool = ctx.projection.pools().find((candidate) => candidate.poolId === ctx.config.poolId)
    const plans = pool === undefined ? [] : findMatches(pool, orders, ranAt)
    const disclosedContracts = await holdingDisclosures(ctx, holdingCidsForPlans(plans, orders))
    res.json({ ranAt, syncOffset, plans, disclosedContracts })
  }

interface MatchSyncBody {
  beginExclusive?: number
  endInclusive?: number
}

const postMatchSync =
  (ctx: AppContext) =>
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as MatchSyncBody
    if (
      typeof body.beginExclusive !== 'number' ||
      typeof body.endInclusive !== 'number' ||
      !Number.isInteger(body.beginExclusive) ||
      !Number.isInteger(body.endInclusive) ||
      body.beginExclusive < 0 ||
      body.endInclusive < body.beginExclusive
    ) {
      res.status(400).json({
        error: 'beginExclusive and endInclusive must be ordered non-negative integer offsets',
      })
      return
    }
    const { beginExclusive, endInclusive } = body
    const trades = await syncWalletMatches(ctx, beginExclusive, endInclusive)
    res.json({ synced: trades.length, trades, schedule: ctx.scheduler.schedule() })
  }

const putSchedule =
  (ctx: AppContext) =>
  (req: Request, res: Response): void => {
    const intervalMs = Number((req.body as { intervalMs?: number }).intervalMs)
    if (
      !Number.isInteger(intervalMs) ||
      intervalMs < MIN_INTERVAL_MS ||
      intervalMs > MAX_INTERVAL_MS
    ) {
      res.status(400).json({
        error: `intervalMs must be an integer in [${MIN_INTERVAL_MS}, ${MAX_INTERVAL_MS}]`,
      })
      return
    }
    res.json(ctx.scheduler.setIntervalMs(intervalMs))
  }

export const createApp = (ctx: AppContext): Express => {
  const app = express()
  app.use(cors({ origin: ctx.config.corsOrigins }))
  app.use(express.json())

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))
  app.get('/readyz', (_req, res) => res.json({ status: 'ready' }))
  app.get('/config', getConfig(ctx))
  app.get('/venue', getVenue(ctx))
  app.get('/trade', getTrade(ctx))
  app.post('/faucet', postFaucet(ctx))
  app.post('/orders', postOrders(ctx))
  app.delete('/orders/:cid', deleteOrder(ctx))
  app.post('/venue/match', postMatch(ctx))
  app.post('/venue/match-plan', postMatchPlan(ctx))
  app.post('/venue/match-sync', postMatchSync(ctx))
  app.put('/venue/schedule', putSchedule(ctx))

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  })
  return app
}
