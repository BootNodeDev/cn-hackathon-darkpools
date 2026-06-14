import type { InstrumentId, Side } from '@/darkpool/types'

export const TEMPLATE_IDS = {
  registryHolding: '#registry-token:RegistryToken.Holding:RegistryHolding',
  darkPool: '#dark-pool:DarkPool:DarkPool',
  order: '#dark-pool:DarkPool:Order',
} as const

const DECIMAL_SCALE = 10n ** 10n
const ALLOCATE_WINDOW_MS = 5 * 60 * 1000
const SETTLE_WINDOW_MS = 60 * 60 * 1000

type JsonRecord = Record<string, unknown>

export interface ExerciseCommand {
  ExerciseCommand: {
    templateId: string
    contractId: string
    choice: string
    choiceArgument: Record<string, unknown>
  }
}

export interface HoldingContract {
  contractId: string
  owner: string
  instrument: InstrumentId
  amount: string
}

export interface MatchPlan {
  poolId: string
  buyOrderCid: string
  sellOrderCid: string
  fillQty: string
}

export interface PlaceOrderCommandArgs {
  poolCid: string
  trader: string
  side: Side
  quantity: number
  limitPrice: number
  minFill: number
  expiresAt: number | null
  holdingCids: string[]
}

export interface MatchCommandArgs {
  poolCid: string
  factoryCid: string
  plan: MatchPlan
  nowMs: number
}

export interface FundingSelectionArgs {
  owner: string
  instrumentId: InstrumentId
  side: Side
  quantity: number
  limitPrice: number
}

// Converts a runtime value into a plain object when Canton returns a JSON record.
const asRecord = (value: unknown): JsonRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined

// Formats UI numbers as Daml decimal strings without adding meaningless zeros.
export const decimalString = (value: number): string => {
  const fixed = value.toFixed(10)
  return fixed.replace(/\.?0+$/, '')
}

// Converts a decimal string into 10dp scaled units for deterministic funding math.
const decimalUnits = (value: string): bigint => {
  const [whole, frac = ''] = value.split('.')
  return BigInt(`${whole}${frac.padEnd(10, '0').slice(0, 10)}`)
}

// Converts a UI number into 10dp scaled units using the same decimal formatting as commands.
const numberUnits = (value: number): bigint => decimalUnits(decimalString(value))

// Computes the worst-case funding bound the contract checks during placement.
const requiredFundingUnits = (args: FundingSelectionArgs): bigint =>
  args.side === 'Buy'
    ? (numberUnits(args.quantity) * numberUnits(args.limitPrice)) / DECIMAL_SCALE
    : numberUnits(args.quantity)

// Gives a deterministic match id without relying on Node-only crypto in the browser.
const matchIdOf = (buyOrderCid: string, sellOrderCid: string): string => {
  let hash = 0xcbf29ce484222325n
  for (const char of `${buyOrderCid}:${sellOrderCid}`) {
    hash ^= BigInt(char.codePointAt(0) ?? 0)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}

// Builds the token-standard empty ExtraArgs record expected by the registry choices.
const emptyExtraArgs = (): Record<string, unknown> => ({
  context: { values: [] },
  meta: { values: [] },
})

// Builds the DarkPool_PlaceOrder command signed by the connected trader.
export const placeOrderCommand = (args: PlaceOrderCommandArgs): ExerciseCommand => ({
  ExerciseCommand: {
    templateId: TEMPLATE_IDS.darkPool,
    contractId: args.poolCid,
    choice: 'DarkPool_PlaceOrder',
    choiceArgument: {
      trader: args.trader,
      side: args.side,
      quantity: decimalString(args.quantity),
      limitPrice: decimalString(args.limitPrice),
      minFill: decimalString(args.minFill),
      expiresAt: args.expiresAt === null ? null : new Date(args.expiresAt).toISOString(),
      holdingCids: args.holdingCids,
    },
  },
})

// Builds the Order_Cancel command signed by the order's trader.
export const cancelOrderCommand = (orderCid: string): ExerciseCommand => ({
  ExerciseCommand: {
    templateId: TEMPLATE_IDS.order,
    contractId: orderCid,
    choice: 'Order_Cancel',
    choiceArgument: {},
  },
})

// Builds the DarkPool_Match command signed by the venue wallet.
export const matchCommand = ({ poolCid, factoryCid, plan, nowMs }: MatchCommandArgs) => {
  const funding = { allocationFactoryCid: factoryCid, allocateArgs: emptyExtraArgs() }
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.darkPool,
      contractId: poolCid,
      choice: 'DarkPool_Match',
      choiceArgument: {
        buyOrderCid: plan.buyOrderCid,
        sellOrderCid: plan.sellOrderCid,
        matchId: matchIdOf(plan.buyOrderCid, plan.sellOrderCid),
        requestedAt: new Date(nowMs - 1000).toISOString(),
        allocateBefore: new Date(nowMs + ALLOCATE_WINDOW_MS).toISOString(),
        settleBefore: new Date(nowMs + SETTLE_WINDOW_MS).toISOString(),
        buyFunding: funding,
        sellFunding: funding,
        buyExecuteArgs: emptyExtraArgs(),
        sellExecuteArgs: emptyExtraArgs(),
      },
    },
  }
}

// Normalizes a participant-native active-contract row for RegistryHolding.
export const normalizeHoldingContract = (raw: unknown): HoldingContract | undefined => {
  const row = asRecord(raw)
  const entry = asRecord(row?.contractEntry)
  const active = asRecord(entry?.JsActiveContract)
  const event = asRecord(active?.createdEvent)
  const args = asRecord(event?.createArgument)
  const instrumentId = asRecord(args?.instrumentId)
  if (
    typeof event?.contractId !== 'string' ||
    typeof args?.owner !== 'string' ||
    typeof args?.amount !== 'string' ||
    typeof instrumentId?.admin !== 'string' ||
    typeof instrumentId.id !== 'string'
  ) {
    return undefined
  }
  return {
    contractId: event.contractId,
    owner: args.owner,
    instrument: { admin: instrumentId.admin, id: instrumentId.id },
    amount: args.amount,
  }
}

// Selects largest eligible holdings until the order's worst-case bound is covered.
export const selectFundingHoldingCids = (
  holdings: Array<HoldingContract | undefined>,
  args: FundingSelectionArgs,
): string[] => {
  const required = requiredFundingUnits(args)
  const eligible = holdings
    .filter((holding): holding is HoldingContract => holding !== undefined)
    .filter(
      (holding) =>
        holding.owner === args.owner &&
        holding.instrument.admin === args.instrumentId.admin &&
        holding.instrument.id === args.instrumentId.id,
    )
    .sort((a, b) => {
      const amountA = decimalUnits(a.amount)
      const amountB = decimalUnits(b.amount)
      return amountA > amountB ? -1 : amountA < amountB ? 1 : 0
    })
  const total = eligible.reduce((sum, holding) => sum + decimalUnits(holding.amount), 0n)
  if (total < required) {
    return []
  }
  const picked: string[] = []
  let sum = 0n
  for (const holding of eligible) {
    if (sum >= required) {
      break
    }
    picked.push(holding.contractId)
    sum += decimalUnits(holding.amount)
  }
  return picked
}
