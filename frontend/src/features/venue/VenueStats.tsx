import { Stat } from '@/components/Stat'
import { quoteAmount } from '@/darkpool/darkpoolMath'
import { formatNotional, formatPrice, formatQty } from '@/darkpool/format'
import { useBook, useTrades } from '@/darkpool/hooks'
import type { Pool } from '@/darkpool/types'

const StatCard = ({
  label,
  children,
  sub,
  testId,
}: {
  label: string
  children: JSX.Element
  sub: string
  testId: string
}): JSX.Element => (
  <div data-testid={testId} className="rounded-2xl border border-border bg-surface p-6">
    <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-2" data-testid={`${testId}-value`}>
      {children}
    </div>
    <div className="mt-1.5 text-xs text-soft">{sub}</div>
  </div>
)

export const VenueStats = ({ pool }: { pool: Pool }): JSX.Element => {
  const book = useBook(pool.poolId)
  const trades = useTrades(pool.poolId)
  const buys = book.filter((o) => o.side === 'Buy').length
  const sells = book.length - buys
  const notional = book.reduce((s, o) => s + quoteAmount(o.quantity, o.limitPrice), 0)
  const last = trades[0]

  return (
    <div
      data-testid="venue-stats"
      className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <StatCard
        testId="stat-orders-in-book"
        label="Orders in book"
        sub={`${buys} buys · ${sells} sells`}
      >
        <Stat
          value={book.length}
          format={(n) => String(Math.round(n))}
          className="font-mono text-3xl text-foreground"
        />
      </StatCard>
      <StatCard
        testId="stat-book-notional"
        label="Book notional"
        sub={`${pool.quoteLabel}-equivalent`}
      >
        <Stat
          value={notional}
          format={formatNotional}
          className="font-mono text-3xl text-foreground"
        />
      </StatCard>
      <StatCard
        testId="stat-last-match"
        label="Last match"
        sub={last ? `${formatQty(last.quantity)} ${pool.baseLabel} · midpoint` : 'no matches yet'}
      >
        {last ? (
          <Stat value={last.price} format={formatPrice} className="font-mono text-3xl text-mid" />
        ) : (
          <span className="font-mono text-3xl text-soft">—</span>
        )}
      </StatCard>
      <StatCard testId="stat-matches-settled" label="Matches settled" sub="since boot">
        <Stat
          value={trades.length}
          format={(n) => String(Math.round(n))}
          className="font-mono text-3xl text-foreground"
        />
      </StatCard>
    </div>
  )
}
