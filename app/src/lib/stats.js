import { TEAM_BY_ID } from '../data/teams.js'
import { aggregate } from './bracket.js'

// Sorted leaderboard for state finals: rank, points, max possible, alive entries,
// and conservative best/worst finish bounds.
// Only teams with at least one entry in the current flights show up — TEAMS
// is a master list across all 4 divisions, so we filter to the current state.
export function leaderboard(flights) {
  const { points, remaining, alive } = aggregate(flights)
  const presentIds = new Set()
  for (const f of flights) {
    for (const e of f.entries) {
      if (e?.teamId) presentIds.add(e.teamId)
    }
  }
  const rows = [...presentIds].map(id => {
    const team = TEAM_BY_ID[id] || { id, name: id, short: id.slice(0, 4).toUpperCase(), color: '#64748b' }
    const cur = points[id] || 0
    const rem = remaining[id] || 0
    return {
      team,
      points: cur,
      maxPossible: cur + rem,
      remaining: rem,
      alive: alive[id] || 0,
    }
  })

  for (const r of rows) {
    r.bestRank = 1 + rows.filter(o => o.team.id !== r.team.id && o.points > r.maxPossible).length
    r.worstRank = 1 + rows.filter(o => o.team.id !== r.team.id && o.maxPossible > r.points).length
  }

  rows.sort((a, b) =>
    b.points - a.points
    || b.maxPossible - a.maxPossible
    || a.team.name.localeCompare(b.team.name)
  )
  // Rank by points only (the tournament's tiebreak in the live UI). Two
  // teams with equal points share a rank; both get a tied flag so the UI
  // can prefix "T-".
  let rankCursor = 0
  let lastPts = null
  rows.forEach((r, i) => {
    if (r.points !== lastPts) { rankCursor = i + 1; lastPts = r.points }
    r.displayRank = rankCursor
  })
  for (const r of rows) {
    r.tied = rows.some(o => o.team.id !== r.team.id && o.displayRank === r.displayRank)
  }

  for (const r of rows) {
    r.clinchedTop3 = r.worstRank <= 3
    r.eliminatedTop3 = r.bestRank > 3
    r.clinchedFirst = r.worstRank === 1
    r.eliminatedAll = r.maxPossible === 0 && r.points === 0
  }

  return rows
}
