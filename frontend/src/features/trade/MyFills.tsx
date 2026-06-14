import { AnimatePresence, motion } from 'framer-motion'
import { SideTag } from '@/components/SideTag'
import { Tooltip } from '@/components/ui/Tooltip'
import { formatPrice, formatQty } from '@/darkpool/format'
import { useMyFills } from '@/darkpool/hooks'
import type { Pool } from '@/darkpool/types'

export const MyFills = ({ pool, party }: { pool: Pool; party: string }): JSX.Element => {
  const fills = useMyFills(party).filter((f) => f.poolId === pool.poolId)

  return (
    <section
      data-testid="my-fills"
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        <span className="font-display text-base font-semibold text-foreground">My fills</span>
        <Tooltip
          label="Who can see your fills"
          content="Visible only to you, your counterparty and the venue."
        />
      </div>
      {fills.length === 0 ? (
        <p
          data-testid="my-fills-empty"
          className="px-5 py-8 text-center text-sm text-muted-foreground"
        >
          No fills yet
        </p>
      ) : (
        <div className="max-h-[260px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="h-9 border-b border-border text-left text-[0.65rem] uppercase tracking-wider text-soft">
                <th scope="col" className="px-5 py-2 font-semibold">
                  Side
                </th>
                <th scope="col" className="px-5 py-2 font-semibold">
                  Clearing price
                </th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {fills.map((f) => (
                  <motion.tr
                    key={f.fillId}
                    layout
                    data-testid="fill-row"
                    data-fill-id={f.fillId}
                    data-side={f.side}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-11 border-b border-border/60 text-sm last:border-b-0"
                  >
                    <td className="px-5 py-2.5">
                      <SideTag side={f.side} />
                    </td>
                    <td className="px-5 py-2.5 font-mono text-mid">{formatPrice(f.price)}</td>
                    <td className="px-5 py-2.5 text-right font-mono">{formatQty(f.quantity)}</td>
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
