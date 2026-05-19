// Phase 4: Bradley-Terry paired-comparison ratings, per flight.
//
// Pool every flight-level match across all 142 schools we fetched (qualifier
// + opponent), group by flight (1S..4D), and run an MM iteration to convergence.
// Weights per match: recency (4-week exponential half-life from 2026-05-19)
// times margin-of-victory (game-differential scaled).
//
// Outputs: data/phase4_ratings.json with per-flight player/pair ratings, SOS,
// team aggregates, and a Clarkston-focused per-flight comparison.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REF_DATE = new Date('2026-05-19T00:00:00Z')
const HALF_LIFE_DAYS = 28
const INIT_GAMMA = 1.0
const PRIOR_WINS = 1.0  // virtual win / loss against an average opponent (regularization)
const PRIOR_LOSSES = 1.0
const PRIOR_OPPONENT_GAMMA = 1.0
const ITER_MAX = 200
const ITER_EPSILON = 1e-6

// Recency: weight halves every HALF_LIFE_DAYS.
function recencyWeight(dateStr) {
  if (!dateStr) return 0.5
  const t = new Date(dateStr).getTime()
  const days = (REF_DATE.getTime() - t) / 86400000
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

// MOV: scale by total game differential. 6-0 6-0 ~1.5x, 7-6 7-6 ~0.35x.
function movWeight(setsW, setsL) {
  const diff = Math.max(0, setsW - setsL)
  const w = Math.max(0.3, Math.min(1.5, diff / 6))
  return w
}

// Sum games for one side from sets array using teamId key.
function sumGames(sets, teamId) {
  let g = 0
  for (const s of sets) {
    if (s.tie) continue // 10-pt match tiebreak isn't a real set count
    const v = s.scores?.[teamId]
    if (typeof v === 'number') g += v
  }
  return g
}

// Walk every school JSON (qualifiers + opponents) and pool unique flight-level
// matches keyed by matchId.
const SCHOOL_DIRS = [`${__dirname}/data/schools`, `${__dirname}/data/opponents`]
const seenMatches = new Map() // matchId -> match record

for (const dir of SCHOOL_DIRS) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    const data = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'))
    for (const meet of (data.meets || [])) {
      for (const m of [...(meet.matches?.Singles || []), ...(meet.matches?.Doubles || [])]) {
        if (!m.id || seenMatches.has(m.id)) continue
        // Need at least 2 sides with players + a winner.
        if (!Array.isArray(m.matchTeams) || m.matchTeams.length < 2) continue
        const sides = m.matchTeams.map(mt => ({
          teamId: mt.id,
          isWinner: !!mt.isWinner,
          players: (mt.players || []).map(p => ({
            playerId: p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
            schoolId: p.schoolId,
            schoolName: p.school?.name,
          })),
        }))
        const winSide = sides.find(s => s.isWinner)
        const loseSide = sides.find(s => !s.isWinner && s !== winSide)
        if (!winSide || !loseSide) continue
        if (!winSide.players.length || !loseSide.players.length) continue
        const winnerKey = winSide.players.map(p => p.playerId).sort().join('-')
        const loserKey  = loseSide.players.map(p => p.playerId).sort().join('-')
        if (!winnerKey || !loserKey || winnerKey === loserKey) continue
        const gW = sumGames(m.sets || [], winSide.teamId)
        const gL = sumGames(m.sets || [], loseSide.teamId)
        const flightId = `${m.flight}${m.matchType === 'Doubles' ? 'D' : 'S'}`
        seenMatches.set(m.id, {
          matchId: m.id,
          date: meet.meetDateTime,
          postSeason: meet.postSeason,
          eventId: meet.eventId,
          flightId,
          winnerKey,
          loserKey,
          winSide,
          loseSide,
          gW, gL,
          w_recency: recencyWeight(meet.meetDateTime),
          w_mov: movWeight(gW, gL),
        })
      }
    }
  }
}

const allMatches = [...seenMatches.values()]
console.log(`Pooled unique flight-level matches: ${allMatches.length}`)

// Group by flight.
const FLIGHTS = ['1S','2S','3S','4S','1D','2D','3D','4D']
const byFlight = Object.fromEntries(FLIGHTS.map(f => [f, []]))
for (const m of allMatches) {
  if (byFlight[m.flightId]) byFlight[m.flightId].push(m)
}

// Load phase1 qualifiers + phase3 records for school names.
const phase1 = JSON.parse(readFileSync(`${__dirname}/data/phase1_summary.json`, 'utf8'))
const phase3 = JSON.parse(readFileSync(`${__dirname}/data/phase3_opponents.json`, 'utf8'))
const qualifierKeysByFlight = {}
const qualifierEntryByFlightKey = {}  // flight|key -> { name, school, seed, elo2026 }
for (const reg of phase1.regionals) {
  for (const [flightId, fdata] of Object.entries(reg.flights)) {
    for (const e of (fdata.qualifiers || [])) {
      const key = e.players.map(p => p.playerId).sort().join('-')
      if (!qualifierKeysByFlight[flightId]) qualifierKeysByFlight[flightId] = new Set()
      qualifierKeysByFlight[flightId].add(key)
      const eloAvg = e.players.length ? (e.players.map(p => p.elo2026).filter(x => typeof x === 'number').reduce((a,b)=>a+b,0) / e.players.length) : null
      qualifierEntryByFlightKey[`${flightId}|${key}`] = {
        key, flight: flightId,
        playerIds: e.players.map(p => p.playerId),
        name: e.players.map(p => p.name).join(' / '),
        school: e.school,
        seed: e.seed,
        winnerReportPlacement: e.winnerReportPlacement,
        elo2026Avg: eloAvg,
        pastStateFinals: e.players.flatMap(p => p.pastStateFinals || []),
        regional: reg.key,
        regionalName: reg.regional.hostName,
      }
    }
  }
}

// Bradley-Terry MM iteration per flight.
function runFlight(matches) {
  // Build per-player aggregates.
  const players = new Map()  // key -> { wins, losses, opp:Map(key->w_total), wWins, wLosses, schoolId, schoolName, name }
  function ensure(key, side) {
    if (!players.has(key)) {
      players.set(key, {
        key,
        players: side.players,
        schoolId: side.players[0]?.schoolId,
        schoolName: side.players[0]?.schoolName,
        name: side.players.map(p => p.name).join(' / '),
        wWins: 0, wLosses: 0,
        opp: new Map(), // opponentKey -> total weight of all matches between us
      })
    }
    return players.get(key)
  }
  // First pass: register and tally.
  for (const m of matches) {
    const w = m.w_recency * m.w_mov
    const W = ensure(m.winnerKey, m.winSide)
    const L = ensure(m.loserKey, m.loseSide)
    W.wWins += w
    L.wLosses += w
    W.opp.set(m.loserKey, (W.opp.get(m.loserKey) || 0) + w)
    L.opp.set(m.winnerKey, (L.opp.get(m.winnerKey) || 0) + w)
  }
  // Initialize gammas.
  const gamma = new Map()
  for (const k of players.keys()) gamma.set(k, INIT_GAMMA)
  // MM iteration (with prior regularization: each player has PRIOR_WINS and
  // PRIOR_LOSSES virtual matches against a player of gamma=1).
  let lastDelta = Infinity
  for (let iter = 0; iter < ITER_MAX; iter++) {
    const next = new Map()
    for (const [k, p] of players) {
      let denom = (PRIOR_WINS + PRIOR_LOSSES) / (gamma.get(k) + PRIOR_OPPONENT_GAMMA)
      for (const [oppKey, totalW] of p.opp) {
        denom += totalW / (gamma.get(k) + (gamma.get(oppKey) || INIT_GAMMA))
      }
      const numer = p.wWins + PRIOR_WINS
      next.set(k, numer / denom)
    }
    // Normalize by geometric mean to keep scale stable.
    const logSum = [...next.values()].reduce((a, v) => a + Math.log(v), 0)
    const gmean = Math.exp(logSum / next.size)
    for (const [k, v] of next) next.set(k, v / gmean)
    // Check convergence.
    let delta = 0
    for (const [k, v] of next) {
      const old = gamma.get(k) || INIT_GAMMA
      delta = Math.max(delta, Math.abs(Math.log(v) - Math.log(old)))
    }
    for (const [k, v] of next) gamma.set(k, v)
    if (delta < ITER_EPSILON) {
      lastDelta = delta
      break
    }
    lastDelta = delta
  }
  // Convert to Elo-style ratings. 400 * log10(gamma) — anchored so geometric mean of gammas = 1.
  // r = 1500 + 400*log10(gamma) (since gmean(gamma) = 1 → r_avg = 1500).
  const out = []
  for (const [k, p] of players) {
    const g = gamma.get(k) || INIT_GAMMA
    const rating = 1500 + 400 * Math.log10(g)
    // SOS = log-avg of opponent gammas weighted by w
    let totalW = 0, oppLogGSum = 0
    for (const [oppKey, w] of p.opp) {
      const og = gamma.get(oppKey) || INIT_GAMMA
      oppLogGSum += w * Math.log10(og)
      totalW += w
    }
    const sosGamma = totalW > 0 ? Math.pow(10, oppLogGSum / totalW) : 1
    const sosRating = 1500 + 400 * Math.log10(sosGamma)
    out.push({
      key: k,
      name: p.name,
      schoolId: p.schoolId,
      schoolName: p.schoolName,
      gamma: g,
      rating,
      sosRating,
      wWins: p.wWins,
      wLosses: p.wLosses,
      matchCount: [...p.opp.values()].length, // distinct opponents
    })
  }
  out.sort((a, b) => b.rating - a.rating)
  return { ratings: out, iterations: lastDelta }
}

const phase4 = {
  generatedAt: new Date().toISOString(),
  config: { HALF_LIFE_DAYS, PRIOR_WINS, PRIOR_LOSSES, ITER_MAX, ITER_EPSILON, REF_DATE: REF_DATE.toISOString() },
  byFlight: {},
  qualifiers: {},   // flightId -> [{key, name, school, rating, sos, ...}]
  teamPower: {},    // schoolId -> { name, total, flightRatings:{1S:..., ...}, sosAvg }
}

for (const fid of FLIGHTS) {
  const matches = byFlight[fid]
  console.log(`\n[${fid}] ${matches.length} matches`)
  const { ratings } = runFlight(matches)
  phase4.byFlight[fid] = { matchCount: matches.length, totalPlayers: ratings.length, ratings }

  // Filter to qualifiers for the headline-quality list.
  const qkeys = qualifierKeysByFlight[fid] || new Set()
  const qrows = ratings.filter(r => qkeys.has(r.key)).map(r => ({
    ...r,
    qualifier: qualifierEntryByFlightKey[`${fid}|${r.key}`] || null,
  })).sort((a, b) => b.rating - a.rating)
  phase4.qualifiers[fid] = qrows
  console.log(`  Top 5 qualifiers ${fid}:`)
  for (const q of qrows.slice(0, 5)) {
    const sched = q.sosRating.toFixed(0)
    const elo = q.qualifier?.elo2026Avg ? q.qualifier.elo2026Avg.toFixed(0) : '—'
    console.log(`    ${q.rating.toFixed(0).padStart(4)}  SOS ${sched.padStart(4)}  trEloAvg ${elo.toString().padStart(4)}  ${q.name.padEnd(35)} ${q.schoolName}`)
  }
}

// Team power: sum of per-flight ratings of each school's qualifiers.
for (const fid of FLIGHTS) {
  for (const q of phase4.qualifiers[fid] || []) {
    const sid = q.schoolId
    if (!sid) continue
    if (!phase4.teamPower[sid]) {
      phase4.teamPower[sid] = {
        schoolId: sid,
        schoolName: q.schoolName,
        flightRatings: {},
        flightSOS: {},
        total: 0,
        sosSum: 0,
        sosCount: 0,
      }
    }
    phase4.teamPower[sid].flightRatings[fid] = q.rating
    phase4.teamPower[sid].flightSOS[fid] = q.sosRating
    phase4.teamPower[sid].total += q.rating
    phase4.teamPower[sid].sosSum += q.sosRating
    phase4.teamPower[sid].sosCount += 1
  }
}
for (const t of Object.values(phase4.teamPower)) {
  t.sosAvg = t.sosCount > 0 ? t.sosSum / t.sosCount : null
  t.totalAvg = t.sosCount > 0 ? t.total / t.sosCount : null
}

writeFileSync(`${__dirname}/data/phase4_ratings.json`, JSON.stringify(phase4, null, 2))

console.log('\n=== TEAM POWER RANKINGS (sum of qualifier ratings across 8 flights) ===')
const teams = Object.values(phase4.teamPower).sort((a, b) => b.total - a.total)
for (const t of teams) {
  console.log(`  ${t.total.toFixed(0).padStart(6)}  avgFlight ${t.totalAvg.toFixed(0).padStart(4)}  SOS ${t.sosAvg.toFixed(0).padStart(4)}  ${t.schoolName}`)
}

console.log('\n=== CLARKSTON FLIGHTS ===')
for (const fid of FLIGHTS) {
  const qrows = phase4.qualifiers[fid] || []
  const c = qrows.find(q => q.schoolId === 4052)
  if (!c) { console.log(`  ${fid}: no Clarkston qualifier`); continue }
  const rank = qrows.findIndex(q => q.schoolId === 4052) + 1
  const top = qrows[0]
  const winProb = 1 / (1 + Math.pow(10, (top.rating - c.rating) / 400))
  console.log(`  ${fid}  rank ${rank}/${qrows.length}  rating ${c.rating.toFixed(0)}  vs top ${top.name} (${top.rating.toFixed(0)}) → P(win)=${(winProb*100).toFixed(1)}%`)
  console.log(`        ${c.name} — SOS ${c.sosRating.toFixed(0)}`)
}
