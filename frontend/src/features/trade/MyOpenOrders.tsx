import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { SideTag } from '@/components/SideTag'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { formatPrice, formatQty } from '@/darkpool/format'
import { useDarkPoolActions, useMyOrders } from '@/darkpool/hooks'
import type { Order, Pool } from '@/darkpool/types'
import { errorMessage } from '@/utils/errorMessage'

const expiryLabel = (expiresAt: number | null): string => {
  if (expiresAt === null) return 'no expiry'
  const ms = expiresAt - Date.now()
  if (ms <= 0) return 'expired'
  const mins = Math.round(ms / 60_000)
  return mins >= 60 ? `in ${Math.round(mins / 60)}h` : `in ${mins}m`
}

const OrderRow = ({
  order,
  pool,
  party,
}: {
  order: Order
  pool: Pool
  party: string
}): JSX.Element => {
  const { cancelOrder } = useDarkPoolActions()
  const [cancelling, setCancelling] = useState(false)

  const cancel = async (): Promise<void> => {
    setCancelling(true)
    try {
      await cancelOrder(party, order.orderId)
      toast.success('Order cancelled')
    } catch (e) {
      toast.error(errorMessage(e))
      setCancelling(false)
    }
  }

  return (
    <motion.tr
      layout
      data-testid="open-order-row"
      data-order-id={order.orderId}
      data-side={order.side}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="h-11 border-border/60 border-b text-sm last:border-b-0"
    >
      <td className="px-5 py-2.5">
        <SideTag side={order.side} />
      </td>
      <td className="px-5 py-2.5 font-mono">{formatPrice(order.limitPrice)}</td>
      <td className="px-5 py-2.5 font-mono">
        {formatQty(order.quantity)} {pool.baseLabel}
      </td>
      <td className="px-5 py-2.5 font-mono text-soft">{expiryLabel(order.expiresAt)}</td>
      <td className="px-5 py-2.5 text-right">
        <button
          type="button"
          data-testid="cancel-order-button"
          onClick={cancel}
          disabled={cancelling}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground transition hover:border-border-strong disabled:opacity-55"
        >
          {cancelling ? <Spinner size="sm" label="Cancelling order" /> : 'Cancel'}
        </button>
      </td>
    </motion.tr>
  )
}

export const MyOpenOrders = ({ pool, party }: { pool: Pool; party: string }): JSX.Element => {
  const orders = useMyOrders(party).filter((o) => o.poolId === pool.poolId)

  return (
    <section
      data-testid="open-orders"
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="font-display text-base font-semibold text-foreground">My open orders</span>
        <span
          data-testid="open-orders-count"
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground"
        >
          {orders.length}
        </span>
      </div>
      {orders.length === 0 ? (
        <p
          data-testid="open-orders-empty"
          className="flex h-[260px] items-center justify-center px-5 text-center text-sm text-muted-foreground"
        >
          No open orders
        </p>
      ) : (
        <div className="h-[260px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="h-9 border-b border-border text-left text-[0.65rem] uppercase tracking-wider text-soft">
                <th scope="col" className="px-5 py-2 font-semibold">
                  Side
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Limit
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Quantity
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Expires
                </th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {orders.map((o) => (
                  <OrderRow key={o.orderId} order={o} pool={pool} party={party} />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
