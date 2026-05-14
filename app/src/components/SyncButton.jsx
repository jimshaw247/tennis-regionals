import { useState } from 'react'
import { scrapeAllFlights } from '../lib/scrapeTennisReporting.js'
import { diffFlights, mergeState } from '../lib/diffState.js'
import { TEAM_BY_ID, FLIGHTS } from '../data/teams.js'

const FLIGHT_LABEL = Object.fromEntries(FLIGHTS.map(f => [f.id, f.label]))

function entryLabel(e) {
  if (!e || !e.teamId) return '(empty)'
  const team = TEAM_BY_ID[e.teamId]
  return `${e.name || team?.name || e.teamId}${team ? ' [' + team.name + ']' : ''}`
}

function MatchLabel({ flightId, matchId }) {
  return <span className="font-mono">{flightId} {matchId}</span>
}

export default function SyncButton({ currentState, onApply }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [diff, setDiff] = useState(null)
  const [scraped, setScraped] = useState(null)

  const startSync = async () => {
    setBusy(true); setErr(''); setDiff(null); setScraped(null)
    try {
      const result = await scrapeAllFlights()
      const d = diffFlights(result.flights, currentState.flights)
      setScraped(result.flights)
      setDiff(d)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!scraped) return
    const merged = mergeState(scraped, currentState.flights)
    onApply(merged)
    setDiff(null); setScraped(null)
  }

  const dismiss = () => { setDiff(null); setScraped(null) }

  const noChange = diff && diff.entryChanges.length === 0 && diff.winnerChanges.length === 0
  const total = diff ? diff.entryChanges.length + diff.winnerChanges.length : 0

  return (
    <>
      <button
        onClick={startSync}
        disabled={busy}
        className="px-2 py-1 rounded bg-blue-700 border border-blue-600 text-white disabled:opacity-50"
        title="Fetch latest from tennisreporting.com"
      >
        {busy ? 'Syncing…' : 'Sync site'}
      </button>
      {err && (
        <div className="ml-2 text-xs text-red-400">Sync error: {err}</div>
      )}

      {diff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={dismiss}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold">Sync from tennisreporting</div>
                <div className="text-[10px] text-slate-400">
                  {noChange ? 'No changes — site matches your state' : `${total} change${total === 1 ? '' : 's'} to apply`}
                </div>
              </div>
              <button onClick={dismiss} className="text-slate-400 hover:text-white text-xs">close</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {diff.winnerChanges.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Match results</div>
                  <ul className="space-y-1">
                    {diff.winnerChanges.map((c, i) => (
                      <li key={i} className={`rounded border p-2 ${c.kind === 'overwrite' ? 'border-amber-700/60 bg-amber-900/20' : 'border-slate-700 bg-slate-800/40'}`}>
                        <div className="flex justify-between">
                          <MatchLabel flightId={c.flightId} matchId={c.matchId} />
                          {c.kind === 'overwrite' && <span className="text-amber-400 text-[10px]">OVERWRITE</span>}
                        </div>
                        <div className="text-slate-300 mt-0.5">
                          {c.before && <><span className="line-through text-slate-500">{c.before}</span> → </>}
                          <span className="text-emerald-400">{c.after}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {diff.entryChanges.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Draw entries</div>
                  <ul className="space-y-1">
                    {diff.entryChanges.map((c, i) => (
                      <li key={i} className="rounded border border-slate-700 bg-slate-800/40 p-2">
                        <div className="font-mono">{c.flightId} pos {c.pos}</div>
                        <div className="text-slate-300 mt-0.5">
                          <span className="line-through text-slate-500">{entryLabel(c.before)}</span>
                          {' → '}
                          <span className="text-emerald-400">{entryLabel(c.after)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {diff.aheadOfSite.length > 0 && (
                <section>
                  <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-1">You're ahead of site (kept)</div>
                  <ul className="space-y-1">
                    {diff.aheadOfSite.map((a, i) => (
                      <li key={i} className="rounded border border-cyan-800/60 bg-cyan-900/15 p-2">
                        <MatchLabel flightId={a.flightId} matchId={a.matchId} /> = {a.value} (not yet on site)
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {noChange && diff.aheadOfSite.length === 0 && (
                <div className="text-slate-400 text-center py-6">Everything is in sync.</div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-700 flex gap-2">
              <button onClick={dismiss} className="flex-1 px-3 py-2 rounded bg-slate-800 border border-slate-700 text-xs">Cancel</button>
              {!noChange && (
                <button onClick={apply} className="flex-1 px-3 py-2 rounded bg-blue-600 text-white text-xs font-semibold">
                  Apply {total} change{total === 1 ? '' : 's'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
