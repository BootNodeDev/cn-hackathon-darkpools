import { AnimatePresence, motion } from 'framer-motion'
import { TraderChip } from '@/components/TraderChip'
import { formatPrice, formatQty, formatTime } from '@/darkpool/format'
import { useTrades } from '@/darkpool/hooks'
import type { Pool } from '@/darkpool/types'

export const SettledMatches = ({ pool }: { pool: Pool }): JSX.Element => {
  const trades = useTrades(pool.poolId)

  return (
    <section
      data-testid="settled-matches"
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-display text-base font-semibold text-foreground">
          Settled matches
        </span>
        <span className="text-xs text-soft">every match this venue cleared</span>
      </div>
      {trades.length === 0 ? (
        <p
          data-testid="settled-matches-empty"
          className="px-5 py-8 text-center text-sm text-muted-foreground"
        >
          No matches settled yet
        </p>
      ) : (
        <div className="max-h-[260px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="h-9 border-b border-border text-left text-[0.65rem] uppercase tracking-wider text-soft">
                <th scope="col" className="px-5 py-2 font-semibold">
                  Price
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Qty
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Buyer
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Seller
                </th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">
                  Settled
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {trades.map((t) => (
                  <motion.tr
                    key={t.tradeId}
                    layout
                    data-testid="settled-match-row"
                    data-trade-id={t.tradeId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-11 border-b border-border/60 text-sm last:border-b-0"
                  >
                    <td className="px-5 py-2.5 font-mono text-mid">{formatPrice(t.price)}</td>
                    <td className="px-5 py-2.5 font-mono">{formatQty(t.quantity)}</td>
                    <td className="px-5 py-2.5">
                      <TraderChip name={t.buyer} />
                    </td>
                    <td className="px-5 py-2.5">
                      <TraderChip name={t.seller} />
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-soft">
                      {formatTime(t.settledAt)}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
