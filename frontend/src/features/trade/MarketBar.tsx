import { Select } from '@/components/ui/Select'
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
    </section>
  )
}
