import { useParty } from 'canton-connect-kit'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { PairSelect } from '@/components/PairSelect'
import { usePools } from '@/darkpool/hooks'
import { MyFills } from './MyFills'
import { MyOpenOrders } from './MyOpenOrders'
import { OrderEntry } from './OrderEntry'

const EASE = [0.16, 1, 0.3, 1] as const
// Staggered entrance for each column/panel.
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: EASE },
})

export const TradeView = (): JSX.Element => {
  const { party } = useParty()
  if (!party) return <div className="py-10 text-center text-muted-foreground">Loading…</div>
  return <TradeWorkspace party={party.partyId} />
}

export const TradeWorkspace = ({ party: partyId }: { party: string }): JSX.Element => {
  const pools = usePools()
  const [poolId, setPoolId] = useState(pools[0]?.poolId ?? '')
  const pool = pools.find((p) => p.poolId === poolId) ?? pools[0]

  if (!pool) return <div className="py-10 text-center text-muted-foreground">Loading…</div>

  return (
    <div data-testid="trade-view" data-pool-id={pool.poolId} className="flex flex-col gap-5">
      <h1 className="sr-only">Trade - CN Dark Pools</h1>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[340px_1fr]">
        <motion.div className="flex flex-col gap-4" {...rise(0)}>
          <PairSelect pool={pool} pools={pools} onChange={setPoolId} />
          <OrderEntry pool={pool} party={partyId} />
        </motion.div>

        <motion.div className="flex flex-col gap-4" {...rise(0.1)}>
          <MyOpenOrders pool={pool} party={partyId} />
          <MyFills pool={pool} party={partyId} />
        </motion.div>
      </div>
    </div>
  )
}
