// Pure JSON command builders for the Ledger API v2. Field names mirror the Daml
// choice records exactly. Each returns a tagged {CreateCommand|ExerciseCommand}.
import { TEMPLATE_IDS } from './templateIds.ts'
import type { InstrumentId, Side } from './types.ts'

// Empty token-standard ExtraArgs use TextMap object shape for JSON Ledger API decoding.
const emptyExtraArgs = { context: { values: {} }, meta: { values: {} } }

export interface ExerciseCommand {
  ExerciseCommand: {
    templateId: string
    contractId: string
    choice: string
    choiceArgument: Record<string, unknown>
  }
}

export interface PlaceOrderArgs {
  poolCid: string
  trader: string
  side: Side
  quantity: string
  limitPrice: string
  minFill: string
  expiresAt: string | null
  holdingCids: string[]
}

export const placeOrder = (args: PlaceOrderArgs): ExerciseCommand => ({
  ExerciseCommand: {
    templateId: TEMPLATE_IDS.darkPool,
    contractId: args.poolCid,
    choice: 'DarkPool_PlaceOrder',
    choiceArgument: {
      trader: args.trader,
      side: args.side,
      quantity: args.quantity,
      limitPrice: args.limitPrice,
      minFill: args.minFill,
      expiresAt: args.expiresAt,
      holdingCids: args.holdingCids,
    },
  },
})

export const cancelOrder = (orderCid: string): ExerciseCommand => ({
  ExerciseCommand: {
    templateId: TEMPLATE_IDS.order,
    contractId: orderCid,
    choice: 'Order_Cancel',
    choiceArgument: {},
  },
})

export const rejectOrder = (orderCid: string): ExerciseCommand => ({
  ExerciseCommand: {
    templateId: TEMPLATE_IDS.order,
    contractId: orderCid,
    choice: 'Order_Reject',
    choiceArgument: {},
  },
})

export interface MatchArgs {
  poolCid: string
  buyOrderCid: string
  sellOrderCid: string
  matchId: string
  factoryCid: string
  requestedAt: string
  allocateBefore: string
  settleBefore: string
}

export const match = (args: MatchArgs): ExerciseCommand => {
  const funding = { allocationFactoryCid: args.factoryCid, allocateArgs: emptyExtraArgs }
  return {
    ExerciseCommand: {
      templateId: TEMPLATE_IDS.darkPool,
      contractId: args.poolCid,
      choice: 'DarkPool_Match',
      choiceArgument: {
        buyOrderCid: args.buyOrderCid,
        sellOrderCid: args.sellOrderCid,
        matchId: args.matchId,
        requestedAt: args.requestedAt,
        allocateBefore: args.allocateBefore,
        settleBefore: args.settleBefore,
        buyFunding: funding,
        sellFunding: funding,
        buyExecuteArgs: emptyExtraArgs,
        sellExecuteArgs: emptyExtraArgs,
      },
    },
  }
}

export interface MintArgs {
  factoryCid: string
  instrumentId: InstrumentId
  owner: string
  amount: string
}

export const mint = (args: MintArgs): ExerciseCommand => ({
  ExerciseCommand: {
    templateId: TEMPLATE_IDS.registry,
    contractId: args.factoryCid,
    choice: 'Mint',
    choiceArgument: { owner: args.owner, instrumentId: args.instrumentId, amount: args.amount },
  },
})
