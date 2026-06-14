import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { toast } from '@/components/ui/toast'
import { useDarkPoolActions } from '@/darkpool/hooks'
import type { PassResult, Pool } from '@/darkpool/types'
import { errorMessage } from '@/utils/errorMessage'

const formatRelative = (ms: number): string => {
  const delta = Math.max(0, ms - Date.now())
  const seconds = Math.round(delta / 1000)
  if (seconds < 60) return `in ${seconds}s`
  const minutes = Math.round(seconds / 60)
  return `in ${minutes}m`
}

export const MatchPanel = ({ pool }: { pool: Pool }): JSX.Element => {
  const { runMatchPass } = useDarkPoolActions()
  const [running, setRunning] = useState(false)
  const [last, setLast] = useState<PassResult | null>(null)

  const execute = async (): Promise<void> => {
    setRunning(true)
    try {
      const result = await runMatchPass()
      setLast(result)
      if (result.matched === 0 && result.rejected === 0) {
        toast.success('Pass complete · no crossing pairs')
      } else {
        toast.success(`Pass complete · matched ${result.matched}, rejected ${result.rejected}`)
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section
      data-testid="match-panel"
      className="rounded-2xl border border-border border-l-2 border-l-primary bg-surface p-5"
    >
      <div className="flex items-center gap-2">
        <h2 className="font-display text-base font-semibold text-foreground">Matching pass</h2>
        <Tooltip
          label="About the matching pass"
          content="Each matched pair settles atomically — both legs move or neither does."
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The venue scans the {pool.baseLabel}/{pool.quoteLabel} book off-chain and picks crossing
        pairs by price-time priority. Each pair is submitted for on-ledger settlement, where the
        contract sets the midpoint price and either moves both legs atomically or rejects the match.
      </p>

      <button
        type="button"
        data-testid="run-match-button"
        onClick={execute}
        disabled={running}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {running ? <Spinner tone="primary" label="Running pass" /> : 'Run matching pass now'}
      </button>

      {last && (
        <dl
          data-testid="match-result"
          className="mt-4 rounded-lg border border-border bg-muted px-3.5 py-3 text-sm"
        >
          <div className="flex justify-between py-0.5">
            <dt className="text-muted-foreground">Matched</dt>
            <dd className="font-mono text-primary" data-testid="match-result-matched">
              {last.matched}
            </dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-muted-foreground">Rejected</dt>
            <dd
              className={`font-mono ${last.rejected > 0 ? 'text-down' : 'text-soft'}`}
              data-testid="match-result-rejected"
            >
              {last.rejected}
            </dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-muted-foreground">Next pass</dt>
            <dd className="font-mono text-soft" data-testid="match-result-next">
              {formatRelative(last.nextRunAt)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}
