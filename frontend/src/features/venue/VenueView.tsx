import { useState } from 'react'
import { PairSelect } from '@/components/PairSelect'
import { ViewLoading } from '@/components/ui/ViewLoading'
import { usePools } from '@/darkpool/hooks'
import { FullBook } from './FullBook'
import { MatchPanel } from './MatchPanel'
import { SettledMatches } from './SettledMatches'

export const VenueView = (): JSX.Element => {
  const pools = usePools()
  const [poolId, setPoolId] = useState(pools[0]?.poolId ?? '')
  const pool = pools.find((p) => p.poolId === poolId) ?? pools[0]

  if (!pool) return <ViewLoading />

  return (
    <div data-testid="venue-view" data-pool-id={pool.poolId} className="flex flex-col gap-3.5">
      <h1 className="sr-only">Venue - CN Dark Pools</h1>

      <div className="flex justify-end">
        <span
          data-testid="operator-badge"
          className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
          Operator
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-3.5">
          <PairSelect pool={pool} pools={pools} onChange={setPoolId} />
          <MatchPanel pool={pool} />
        </div>

        <div className="flex flex-col gap-3.5">
          <FullBook pool={pool} />
          <SettledMatches pool={pool} />
        </div>
      </div>
    </div>
  )
}
