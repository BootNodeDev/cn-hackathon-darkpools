import { AnimatePresence, motion } from 'framer-motion'
import { SideTag } from '@/components/SideTag'
import { TraderChip } from '@/components/TraderChip'
import { formatPrice, formatQty, formatTime } from '@/darkpool/format'
import { useBook, useTrades } from '@/darkpool/hooks'
import type { Order, Pool } from '@/darkpool/types'

// Shared fixed widths keep the header table aligned with the two scrollable
// side tables (asks / bids).
const Cols = (): JSX.Element => (
  <colgroup>
    <col className="w-[10%]" />
    <col className="w-[17%]" />
    <col className="w-[15%]" />
    <col className="w-[15%]" />
    <col className="w-[25%]" />
    <col className="w-[18%]" />
  </colgroup>
)

const Row = ({ order }: { order: Order }): JSX.Element => (
  <motion.tr
    layout
    data-testid="book-order-row"
    data-order-id={order.orderId}
    data-side={order.side}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="h-11 border-border/60 border-b text-sm last:border-b-0"
  >
    <td className="px-5 py-2.5">
      <SideTag side={order.side} iconOnly />
    </td>
    <td className="px-5 py-2.5 font-mono">{formatPrice(order.limitPrice)}</td>
    <td className="px-5 py-2.5 font-mono">{formatQty(order.quantity)}</td>
    <td className="px-5 py-2.5 font-mono text-soft">{formatQty(order.minFill)}</td>
    <td className="truncate px-5 py-2.5">
      <TraderChip name={order.trader} />
    </td>
    <td className="px-5 py-2.5 text-right font-mono text-soft">{formatTime(order.submittedAt)}</td>
  </motion.tr>
)

// asks (sells) capped at 5 rows, then the gold midpoint band, then bids (buys)
// capped at 5 rows. Each side scrolls independently so the book never grows the
// surrounding layout.
const SIDE_SCROLL = 'max-h-[220px] overflow-y-auto'

export const FullBook = ({ pool }: { pool: Pool }): JSX.Element => {
  const book = useBook(pool.poolId)
  const mid = useTrades(pool.poolId)[0]?.price ?? null
  const sells = book.filter((o) => o.side === 'Sell').sort((a, b) => b.limitPrice - a.limitPrice)
  const buys = book.filter((o) => o.side === 'Buy').sort((a, b) => b.limitPrice - a.limitPrice)

  return (
    <section
      data-testid="full-book"
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-display text-base font-semibold text-foreground">
          Full book · current
        </span>
        <span className="text-xs text-soft">venue sees every resting order</span>
      </div>
      {book.length === 0 ? (
        <p
          data-testid="full-book-empty"
          className="px-5 py-8 text-center text-sm text-muted-foreground"
        >
          Book is empty
        </p>
      ) : (
        <div>
          <table className="w-full table-fixed">
            <Cols />
            <thead>
              <tr className="h-9 border-b border-border text-left text-[0.65rem] uppercase tracking-wider text-soft">
                <th scope="col" className="px-5 py-2 font-semibold">
                  Side
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Limit
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Qty
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Min fill
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Trader
                </th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">
                  Submitted
                </th>
              </tr>
            </thead>
          </table>

          <div data-testid="book-asks" className={SIDE_SCROLL}>
            <table className="w-full table-fixed">
              <Cols />
              <tbody>
                <AnimatePresence initial={false}>
                  {sells.map((o) => (
                    <Row key={o.orderId} order={o} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          <div className="bg-gradient-to-r from-transparent via-mid-soft to-transparent px-5 py-1.5">
            <span className="flex items-center justify-center gap-2 font-mono text-[0.7rem] text-mid">
              <span className="h-px flex-1 bg-mid/30" />
              midpoint {mid === null ? '—' : formatPrice(mid)}
              <span className="h-px flex-1 bg-mid/30" />
            </span>
          </div>

          <div data-testid="book-bids" className={SIDE_SCROLL}>
            <table className="w-full table-fixed">
              <Cols />
              <tbody>
                <AnimatePresence initial={false}>
                  {buys.map((o) => (
                    <Row key={o.orderId} order={o} />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
