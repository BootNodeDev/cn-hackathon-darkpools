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
    <section data-testid="market-bar" data-pool-id={pool.poolId} className="w-full">
      <div className="w-full" data-testid="pool-select">
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
