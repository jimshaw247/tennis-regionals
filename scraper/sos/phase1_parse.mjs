// Phase 1.c: Parse raw regional bracket JSON into structured per-regional and
// per-flight summaries. Identify qualifiers using the seedList's
// `isQualified` flag (set by tennisreporting after regionals conclude).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REG_DIR = `${__dirname}/data/regionals`
const { d1Regionals } = JSON.parse(readFileSync(`${__dirname}/data/regionals.json`, 'utf8'))

function regionalKey(r) {
  const m = r.hostName.match(/Regional\s*(\d+)/i)
  const num = m ? m[1].padStart(2, '0') : '99'
  const place = r.hostName.replace(/Regional\s*\d+-/i, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  return `r${num}_${place}`
}

function formatPlayers(players) {
  return (players || []).map(p => `${p.player?.firstName || ''} ${p.player?.lastName || ''}`.trim()).filter(Boolean).join(' / ')
}

function schoolOf(seedEntry) {
  const s = seedEntry.players?.[0]?.player?.school
  return s ? { id: s.id, name: s.name } : null
}

const out = {
  generatedAt: new Date().toISOString(),
  regionals: [],
  qualifierTeams: {},   // schoolId -> { schoolName, totalPoints, qualifyingFlights:[] }
  qualifierEntries: [], // every isQualified seed entry across all regionals
  allSchools: {},       // schoolId -> { name, regionals:Set, flightsPlayed:Set, totalPoints, regionalPoints:{} }
}

function recordSchool(school, regionalKey, flightId) {
  if (!school) return
  if (!out.allSchools[school.id]) out.allSchools[school.id] = { id: school.id, name: school.name, regionals: new Set(), flightsPlayed: new Set(), totalPoints: 0, regionalPoints: {} }
  out.allSchools[school.id].regionals.add(regionalKey)
  out.allSchools[school.id].flightsPlayed.add(`${regionalKey}|${flightId}`)
}

for (const reg of d1Regionals) {
  const key = regionalKey(reg)
  const summary = {
    key,
    regional: reg,
    flights: {},
    teamPoints: {},     // schoolId -> points (sum across all 8 flights at this regional)
    teamNames: {},      // schoolId -> name (display)
    qualifiers: [],     // seed entries flagged isQualified
  }

  for (const fid of ['1S','2S','3S','4S','1D','2D','3D','4D']) {
    const file = `${REG_DIR}/${key}/${fid}.json`
    let data
    try { data = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    const items = data.bracket?.configuration?.bracketItems || []
    const seedList = data.seedList || []
    const playerIdToInfo = new Map()
    for (const entry of seedList) {
      for (const pw of (entry.players || [])) {
        const p = pw.player
        if (!p) continue
        playerIdToInfo.set(p.id, {
          playerId: p.id,
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          school: p.school ? { id: p.school.id, name: p.school.name } : null,
          seed: entry.seed,
          elo2026: (p.elos || []).find(e => e.year === 2026)?.elo ?? null,
          grade: p.grade,
          pastStateFinals: (p.playerInStateTournaments || []).map(t => ({ eventId: t.eventId, year: t.eventYear, name: t.eventName })),
        })
      }
    }

    // For doubles, players come paired in the same seedList entry. Build an entryId by stable seed.
    // For singles, each entry has one player.
    const entries = seedList.map(entry => {
      const players = (entry.players || []).map(pw => pw.player).filter(Boolean)
      const school = entry.players?.[0]?.player?.school || null
      return {
        seed: entry.seed,
        isQualified: entry.players?.some(pw => pw.isQualified) || false,
        winnerReportPlacement: entry.players?.[0]?.winnerReportPlacement ?? null,
        players: players.map(p => ({
          playerId: p.id,
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          grade: p.grade,
          elo2026: (p.elos || []).find(e => e.year === 2026)?.elo ?? null,
          pastStateFinals: (p.playerInStateTournaments || []).map(t => ({ year: t.eventYear, name: t.eventName })),
        })),
        school: school ? { id: school.id, name: school.name } : null,
      }
    })

    // Parse matches.
    const matches = items.map(item => {
      const teams = (item.teams || []).map(t => {
        const playerId = t.items?.[0]?.id ?? null
        const info = playerId ? playerIdToInfo.get(playerId) : null
        return {
          position: t.position,
          isWinner: !!t.isWinner,
          isEmpty: !!t.isEmpty,
          playerId,
          name: info?.name || null,
          school: info?.school || null,
          seed: info?.seed ?? null,
          points: t.points ?? 0,
        }
      })
      return {
        round: item.round,
        position: item.position,
        matchId: item.matchId || null,
        date: item.date,
        score: item.score, // array of "6 - 4" set strings
        finish: item.finish,
        teams,
      }
    })

    // Sum team points for this flight.
    const flightTeamPoints = {}
    for (const m of matches) {
      for (const t of m.teams) {
        if (t.school?.id && t.points) {
          flightTeamPoints[t.school.id] = (flightTeamPoints[t.school.id] || 0) + t.points
          summary.teamNames[t.school.id] = t.school.name
        }
      }
    }

    // Record school participation.
    for (const e of entries) {
      if (e.school) recordSchool(e.school, key, fid)
    }

    // Add flight summary.
    summary.flights[fid] = {
      entryCount: entries.length,
      matchCount: matches.length,
      finalists: matches.filter(m => m.round === Math.max(...matches.map(x => x.round))).flatMap(m =>
        m.teams.filter(t => !t.isEmpty && t.school).map(t => ({
          name: t.name, school: t.school, placement: t.isWinner ? 1 : 2,
        }))
      ),
      qualifiers: entries.filter(e => e.isQualified),
      teamPoints: flightTeamPoints,
      entries,
      matches,
    }

    // Aggregate qualifiers (per-flight).
    for (const e of entries) {
      if (e.isQualified) {
        summary.qualifiers.push({ flight: fid, ...e })
        out.qualifierEntries.push({ regional: key, regionalName: reg.hostName, flight: fid, ...e })
        if (e.school?.id) {
          if (!out.qualifierTeams[e.school.id]) out.qualifierTeams[e.school.id] = { schoolId: e.school.id, schoolName: e.school.name, regional: key, regionalName: reg.hostName, flights: [] }
          out.qualifierTeams[e.school.id].flights.push(fid)
        }
      }
    }

    // Update aggregate.
    for (const [sid, pts] of Object.entries(flightTeamPoints)) {
      summary.teamPoints[sid] = (summary.teamPoints[sid] || 0) + pts
      if (out.allSchools[sid]) {
        out.allSchools[sid].totalPoints = (out.allSchools[sid].totalPoints || 0) + pts
        if (!out.allSchools[sid].regionalPoints[key]) out.allSchools[sid].regionalPoints[key] = 0
        out.allSchools[sid].regionalPoints[key] += pts
      }
    }
  }

  // Rank teams at this regional.
  summary.teamRanking = Object.entries(summary.teamPoints)
    .map(([sid, pts]) => ({ schoolId: parseInt(sid, 10), schoolName: summary.teamNames[sid], points: pts }))
    .sort((a, b) => b.points - a.points)

  out.regionals.push(summary)
}

// Normalize sets to arrays for JSON.
for (const s of Object.values(out.allSchools)) {
  s.regionals = [...s.regionals]
  s.flightsPlayed = [...s.flightsPlayed]
}

writeFileSync(`${__dirname}/data/phase1_summary.json`, JSON.stringify(out, null, 2))

// Print human-readable summary.
console.log('=== Regional team standings ===\n')
for (const r of out.regionals) {
  console.log(`${r.regional.hostName}  (bracketType ${r.regional.bracketType})`)
  for (const t of r.teamRanking.slice(0, 6)) {
    const star = (out.qualifierTeams[t.schoolId]?.flights?.length || 0) > 0 ? ' [qualifiers]' : ''
    console.log(`  ${String(t.points).padStart(3)}  ${t.schoolName}${star}`)
  }
  console.log()
}

console.log('=== Schools with qualifiers (qualifying for state finals) ===')
const qTeams = Object.values(out.qualifierTeams).sort((a, b) => a.regionalName.localeCompare(b.regionalName))
for (const t of qTeams) {
  console.log(`  ${t.schoolName.padEnd(35)} via ${t.regionalName}: flights ${[...new Set(t.flights)].sort().join(',')}`)
}
console.log(`\nTotal distinct qualifying schools: ${qTeams.length}`)
console.log(`Total qualifier entries (player/pair-level): ${out.qualifierEntries.length}`)
