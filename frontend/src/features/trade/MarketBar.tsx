import { useMemo } from 'react'
import { Select } from '@/components/ui/Select'
import { formatQty } from '@/darkpool/format'
import { useTrades } from '@/darkpool/hooks'
import type { Pool } from '@/darkpool/types'

export const MarketBar = ({
  pool,
  pools,
  onPoolChange,
}: {
  pool: Pool
  pools: Pool[]
  onPoolChange: (poolId: string) => void
}): JSX.Element => {
  const trades = useTrades(pool.poolId)
  const fills = trades.length
  const volume = useMemo(() => trades.reduce((s, t) => s + t.quantity, 0), [trades])

  return (
    <section
      data-testid="market-bar"
      data-pool-id={pool.poolId}
      className="flex flex-wrap items-center gap-x-8 gap-y-3 border-border border-b pb-4"
    >
      <div className="min-w-44" data-testid="pool-select">
        <Select
          value={pool.poolId}
          onChange={onPoolChange}
          ariaLabel="Trading pair"
          options={pools.map((p) => ({
            value: p.poolId,
            label: `${p.baseLabel} / ${p.quoteLabel}`,
          }))}
        />
      </div>
      <div className="flex items-baseline gap-2 text-sm" data-testid="market-recent-fills">
        <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Recent fills
        </span>
        <span className="font-mono text-foreground" data-testid="market-recent-fills-value">
          {fills} · {formatQty(volume)} {pool.baseLabel}
        </span>
      </div>
      <div className="flex items-baseline gap-2 text-sm" data-testid="market-pool-floor">
        <span className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
          Pool floor
        </span>
        <span className="font-mono text-foreground" data-testid="market-pool-floor-value">
          {formatQty(pool.minFillFloor)} {pool.baseLabel}
        </span>
      </div>
    </section>
  )
}
