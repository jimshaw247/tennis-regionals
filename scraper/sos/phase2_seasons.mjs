// Phase 2: Fetch full season match data for all 22 qualifying schools via
// the school report API. Each response includes every dual meet + tournament
// with full flight-level detail (Singles flights 1-4, Doubles flights 1-4)
// and per-set scores. Output: data/schools/{id}.json + phase2_summary.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHOOLS_DIR = `${__dirname}/data/schools`
mkdirSync(SCHOOLS_DIR, { recursive: true })

const phase1 = JSON.parse(readFileSync(`${__dirname}/data/phase1_summary.json`, 'utf8'))
const qualifiers = Object.values(phase1.qualifierTeams)
console.log(`Fetching season data for ${qualifiers.length} qualifying schools...`)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchSchool(schoolId) {
  const url = `https://api.tennisreporting.com/report/school/${schoolId}?year=2026&isNotVarsity=0`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${schoolId}: HTTP ${res.status}`)
  return res.json()
}

const phase2 = {
  generatedAt: new Date().toISOString(),
  schools: {},      // schoolId -> { name, record, meetCount, matchCount }
  matches: [],      // flat list of all flight-level matches across all qualifying schools
  perSchool: {},    // schoolId -> { matches: [...] }
  opponentSchools: {}, // schoolId -> { name } encountered as opponents
}

for (const q of qualifiers) {
  const id = q.schoolId
  const outFile = `${SCHOOLS_DIR}/${id}.json`
  let data
  if (existsSync(outFile)) {
    data = JSON.parse(readFileSync(outFile, 'utf8'))
    console.log(`  ${q.schoolName}: cached`)
  } else {
    try {
      data = await fetchSchool(id)
      writeFileSync(outFile, JSON.stringify(data, null, 2))
      const win = data.overallRecord?.win ?? 0
      const loss = data.overallRecord?.loss ?? 0
      const tie = data.overallRecord?.tie ?? 0
      console.log(`  ${q.schoolName.padEnd(35)} ${win}-${loss}-${tie}  meets=${data.meets?.length || 0}`)
      await sleep(500)
    } catch (e) {
      console.log(`  ${q.schoolName}: FAILED - ${e.message}`)
      continue
    }
  }

  phase2.schools[id] = {
    id,
    name: data.school?.name || q.schoolName,
    record: data.overallRecord || { win: 0, loss: 0, tie: 0 },
    meetCount: data.meets?.length || 0,
  }

  const schoolMatches = []
  for (const meet of (data.meets || [])) {
    const meetMeta = {
      meetId: meet.id,
      title: meet.title,
      date: meet.meetDateTime,
      postSeason: meet.postSeason,
      eventId: meet.eventId,
    }
    // Record opponent schools.
    const all = [...(meet.schools?.winners || []), ...(meet.schools?.losers || [])]
    for (const s of all) {
      if (s.id !== id && !phase2.opponentSchools[s.id]) {
        phase2.opponentSchools[s.id] = { id: s.id, name: s.name }
      }
    }
    for (const m of [...(meet.matches?.Singles || []), ...(meet.matches?.Doubles || [])]) {
      // Extract sides
      const sides = (m.matchTeams || []).map(mt => ({
        teamId: mt.id,
        isWinner: !!mt.isWinner,
        players: (mt.players || []).map(p => ({
          playerId: p.id,
          name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          schoolId: p.schoolId,
          schoolName: p.school?.name,
          grade: p.grade,
          position: p.matchTeamPlayer?.position,
        })),
      }))
      // Sets — keyed by matchTeam.id
      const sets = (m.sets || []).map(s => {
        const { number, tie, ...scores } = s
        return { number, tie, scores }
      })
      const match = {
        meet: meetMeta,
        matchId: m.id,
        flight: m.flight,
        matchType: m.matchType,
        finish: m.finish,
        winnerTeamId: m.winnerTeamId,
        sides,
        sets,
      }
      schoolMatches.push(match)
      phase2.matches.push({ schoolPerspective: id, ...match })
    }
  }
  phase2.perSchool[id] = { id, name: phase2.schools[id].name, matches: schoolMatches }
}

writeFileSync(`${__dirname}/data/phase2_summary.json`, JSON.stringify(phase2, null, 2))

console.log('\n=== Phase 2 summary ===')
console.log(`Schools fetched:    ${Object.keys(phase2.schools).length}`)
console.log(`Total flight matches collected: ${phase2.matches.length}`)
console.log(`Unique opponent schools encountered: ${Object.keys(phase2.opponentSchools).length}`)
console.log(`\nMatches per qualifying school (top 5):`)
const counts = Object.values(phase2.perSchool).map(s => ({ name: s.name, n: s.matches.length })).sort((a,b) => b.n - a.n)
for (const c of counts.slice(0, 5)) console.log(`  ${c.name.padEnd(35)} ${c.n}`)
console.log(`  ... median: ${counts[Math.floor(counts.length/2)].n}`)
