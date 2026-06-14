import { Select } from '@/components/ui/Select'
import type { Pool } from '@/darkpool/types'

// Trading-pair dropdown shared by the trader and venue views.
export const PairSelect = ({
  pool,
  pools,
  onChange,
}: {
  pool: Pool
  pools: Pool[]
  onChange: (poolId: string) => void
}): JSX.Element => (
  <div className="w-full" data-testid="pool-select">
    <Select
      value={pool.poolId}
      onChange={onChange}
      ariaLabel="Trading pair"
      options={pools.map((p) => ({
        value: p.poolId,
        label: `${p.baseLabel} / ${p.quoteLabel}`,
      }))}
    />
  </div>
)
