import { TEAMS } from '../data/teams.js'
import { FLIGHT_SIZE } from '../lib/bracket.js'

// 32-slot draw editor laid out as 16 R1 matchups (pairs of slots).
// Leave a slot empty to give the opposing slot a bye.
export default function DrawSetup({ flight, onUpdate }) {
  const set = (pos, patch) => {
    const entries = flight.entries.map((e, i) => i === pos ? { ...e, ...patch } : e)
    onUpdate({ ...flight, entries })
  }

  const isDoubles = flight.id.endsWith('D')

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">
        Enter up to {FLIGHT_SIZE} entries in bracket order. Each row is one R1 matchup —
        leave a slot blank to give the other side a bye.
      </div>
      {Array.from({ length: FLIGHT_SIZE / 2 }, (_, mi) => {
        const a = mi * 2
        const b = mi * 2 + 1
        return (
          <div key={mi} className="rounded-lg border border-slate-700 bg-slate-900/40">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2 pt-1">R1 match {mi + 1}</div>
            <SlotRow flight={flight} pos={a} set={set} isDoubles={isDoubles} />
            <SlotRow flight={flight} pos={b} set={set} isDoubles={isDoubles} />
          </div>
        )
      })}
    </div>
  )
}

function SlotRow({ flight, pos, set, isDoubles }) {
  const e = flight.entries[pos]
  const usedTeams = new Set(flight.entries.filter(x => x.pos !== pos).map(x => x.teamId).filter(Boolean))
  return (
    <div className="px-2 py-2 border-t border-slate-800 first:border-t-0 space-y-1">
      <div className="flex gap-2 items-center">
        <span className="text-[10px] text-slate-500 w-6">#{pos}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="seed"
          value={e.seed ?? ''}
          onChange={ev => set(pos, { seed: ev.target.value === '' ? null : Number(ev.target.value) })}
          className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
        />
        <select
          value={e.teamId ?? ''}
          onChange={ev => set(pos, { teamId: ev.target.value || null })}
          className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
        >
          <option value="">— bye —</option>
          {TEAMS.map(t => (
            <option key={t.id} value={t.id} disabled={usedTeams.has(t.id) && t.id !== e.teamId}>
              {t.name}{usedTeams.has(t.id) && t.id !== e.teamId ? ' (used)' : ''}
            </option>
          ))}
        </select>
      </div>
      {e.teamId && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={isDoubles ? 'player 1' : 'player name'}
            value={e.name ?? ''}
            onChange={ev => set(pos, { name: ev.target.value })}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          />
          {isDoubles && (
            <input
              type="text"
              placeholder="player 2"
              value={e.partner ?? ''}
              onChange={ev => set(pos, { partner: ev.target.value })}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            />
          )}
        </div>
      )}
    </div>
  )
}
