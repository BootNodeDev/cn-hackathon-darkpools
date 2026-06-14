import { useState } from 'react'
import { Select } from '@/components/ui/Select'
import { SideToggle } from '@/components/ui/SideToggle'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { toast } from '@/components/ui/toast'
import { validateOrder } from '@/darkpool/darkpoolMath'
import { useBalances, useDarkPoolActions } from '@/darkpool/hooks'
import type { Pool, Side } from '@/darkpool/types'
import { errorMessage } from '@/utils/errorMessage'

const EXPIRY_OPTIONS = [
  { value: 'none', label: 'No expiry' },
  { value: '5m', label: '5 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
]

const EXPIRY_MS: Record<string, number | null> = {
  none: null,
  '5m': 5 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
}

const INPUT_CLASS =
  'w-full rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary'

export const OrderEntry = ({ pool, party }: { pool: Pool; party: string }): JSX.Element => {
  const balances = useBalances(party)
  const { placeOrder } = useDarkPoolActions()

  const [side, setSide] = useState<Side>('Buy')
  const [limitPrice, setLimitPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [minFill, setMinFill] = useState(String(pool.minFillFloor))
  const [expiry, setExpiry] = useState('1h')
  const [submitting, setSubmitting] = useState(false)

  const price = Number(limitPrice)
  const qty = Number(quantity)
  const min = Number(minFill)

  const ttl = EXPIRY_MS[expiry]
  const req = {
    poolId: pool.poolId,
    side,
    limitPrice: price,
    quantity: qty,
    minFill: min,
    expiresAt: ttl === null ? null : Date.now() + ttl,
  }
  const validity = validateOrder(req, pool, balances)

  const submit = async (): Promise<void> => {
    if (!validity.ok) return
    setSubmitting(true)
    try {
      await placeOrder(party, req)
      toast.success(`Private ${side.toLowerCase()} order placed`)
      setQuantity('')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const buttonClass =
    side === 'Buy'
      ? 'bg-up text-background hover:brightness-110'
      : 'bg-down text-background hover:brightness-110'

  return (
    <section
      data-testid="order-entry"
      data-side={side}
      className="rounded-2xl border border-border border-l-2 border-l-primary bg-surface p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 className="font-display text-base font-semibold text-foreground">
          Place private order
        </h2>
        <Tooltip
          label="About private orders"
          content="Funding is declared now but only locked when a match is found. No one sees this order but you and the venue."
        />
      </div>

      <div data-testid="side-toggle">
        <SideToggle value={side} onChange={setSide} baseLabel={pool.baseLabel} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-1.5">
          <label
            htmlFor="oe-price"
            className="!mb-0 text-[0.7rem] uppercase tracking-wider text-muted-foreground"
          >
            Limit price · {pool.quoteLabel} per {pool.baseLabel}
          </label>
          <Tooltip
            label="About the limit price"
            content="You'll never cross this. Fills clear at the midpoint."
          />
        </div>
        <input
          id="oe-price"
          data-testid="limit-price-input"
          inputMode="decimal"
          value={limitPrice}
          onChange={(e) => setLimitPrice(e.target.value)}
          placeholder="0.00"
          className={INPUT_CLASS}
        />
      </div>

      <div className="mt-3">
        <label
          htmlFor="oe-qty"
          className="!mb-1.5 text-[0.7rem] uppercase tracking-wider text-muted-foreground"
        >
          Quantity · {pool.baseLabel}
        </label>
        <input
          id="oe-qty"
          data-testid="quantity-input"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0.00"
          className={INPUT_CLASS}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div>
          <label
            htmlFor="oe-minfill"
            className="!mb-1.5 text-[0.7rem] uppercase tracking-wider text-muted-foreground"
          >
            Min fill
          </label>
          <input
            id="oe-minfill"
            data-testid="min-fill-input"
            inputMode="decimal"
            value={minFill}
            onChange={(e) => setMinFill(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <div data-testid="expiry-select">
          <span className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Expiry
          </span>
          <Select
            value={expiry}
            onChange={setExpiry}
            options={EXPIRY_OPTIONS}
            ariaLabel="Order expiry"
          />
        </div>
      </div>

      <button
        type="button"
        data-testid="place-order-button"
        data-valid={validity.ok}
        onClick={submit}
        disabled={!validity.ok || submitting}
        className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${buttonClass}`}
      >
        {submitting ? (
          <Spinner tone="background" label="Placing order" />
        ) : validity.ok ? (
          `Place private ${side.toLowerCase()} order`
        ) : (
          validity.reason
        )}
      </button>
    </section>
  )
}
