import { useState } from 'react'
import { Select } from '@/components/ui/Select'
import { usePools } from '@/darkpool/hooks'
import { FullBook } from './FullBook'
import { MatchPanel } from './MatchPanel'
import { SettledMatches } from './SettledMatches'
import { VenueStats } from './VenueStats'

export const VenueView = (): JSX.Element => {
  const pools = usePools()
  const [poolId, setPoolId] = useState(pools[0]?.poolId ?? '')
  const pool = pools.find((p) => p.poolId === poolId) ?? pools[0]

  if (!pool) return <div className="py-10 text-center text-muted-foreground">Loading…</div>

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="sr-only">Venue - CN Dark Pools</h1>
      <div className="flex items-center justify-between">
        <div className="min-w-44">
          <Select
            value={pool.poolId}
            onChange={setPoolId}
            ariaLabel="Trading pair"
            options={pools.map((p) => ({
              value: p.poolId,
              label: `${p.baseLabel} / ${p.quoteLabel}`,
            }))}
          />
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <span className="size-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
          Operator
        </span>
      </div>

      <VenueStats pool={pool} />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr]">
        <FullBook pool={pool} />
        <MatchPanel pool={pool} />
      </div>

      <SettledMatches pool={pool} />
    </div>
  )
}
