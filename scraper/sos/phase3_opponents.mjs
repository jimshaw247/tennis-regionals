// Phase 3: Fetch season data for every opponent school encountered by any
// qualifying team. Same endpoint as Phase 2 — provides team record + meets.
// We persist their full response but only build a thin "opponent record"
// summary plus their own opponent list (for recursive SOS).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OPP_DIR = `${__dirname}/data/opponents`
mkdirSync(OPP_DIR, { recursive: true })

const phase2 = JSON.parse(readFileSync(`${__dirname}/data/phase2_summary.json`, 'utf8'))
const targets = Object.values(phase2.opponentSchools)
console.log(`Phase 3: fetching ${targets.length} second-degree opponent schools`)

const qualifierIds = new Set(Object.keys(phase2.schools).map(Number))
// Skip the qualifier schools themselves — we already have their data.
const todo = targets.filter(t => !qualifierIds.has(t.id))
console.log(`After excluding already-fetched qualifiers: ${todo.length} new fetches`)

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchSchool(schoolId) {
  const url = `https://api.tennisreporting.com/report/school/${schoolId}?year=2026&isNotVarsity=0`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${schoolId}: HTTP ${res.status}`)
  return res.json()
}

const opponents = {
  generatedAt: new Date().toISOString(),
  records: {},   // schoolId -> { name, record, opponentSchoolIds:Set }
  failed: [],
}

let okCount = 0, failCount = 0
for (const t of todo) {
  const outFile = `${OPP_DIR}/${t.id}.json`
  let data
  if (existsSync(outFile)) {
    data = JSON.parse(readFileSync(outFile, 'utf8'))
  } else {
    try {
      data = await fetchSchool(t.id)
      writeFileSync(outFile, JSON.stringify(data, null, 2))
      okCount++
      if (okCount % 10 === 0) console.log(`  ...${okCount}/${todo.length} fetched`)
      await sleep(400)
    } catch (e) {
      failCount++
      opponents.failed.push({ id: t.id, name: t.name, error: e.message })
      continue
    }
  }
  const opps = new Set()
  for (const meet of (data.meets || [])) {
    const all = [...(meet.schools?.winners || []), ...(meet.schools?.losers || [])]
    for (const s of all) if (s.id !== t.id) opps.add(s.id)
  }
  opponents.records[t.id] = {
    id: t.id,
    name: data.school?.name || t.name,
    record: data.overallRecord || { win: 0, loss: 0, tie: 0 },
    meetCount: data.meets?.length || 0,
    opponentSchoolIds: [...opps],
  }
}

// Also fold the qualifier schools' records into the same shape — useful for
// downstream SOS where we need a unified rating-able set.
for (const [sid, info] of Object.entries(phase2.schools)) {
  const data = JSON.parse(readFileSync(`${__dirname}/data/schools/${sid}.json`, 'utf8'))
  const opps = new Set()
  for (const meet of (data.meets || [])) {
    const all = [...(meet.schools?.winners || []), ...(meet.schools?.losers || [])]
    for (const s of all) if (s.id !== Number(sid)) opps.add(s.id)
  }
  opponents.records[sid] = {
    id: Number(sid),
    name: info.name,
    record: info.record,
    meetCount: info.meetCount,
    opponentSchoolIds: [...opps],
    isQualifier: true,
  }
}

writeFileSync(`${__dirname}/data/phase3_opponents.json`, JSON.stringify(opponents, null, 2))

console.log(`\n=== Phase 3 summary ===`)
console.log(`Fetched: ${okCount} new opponents`)
console.log(`Failed:  ${failCount}`)
console.log(`Total records in registry: ${Object.keys(opponents.records).length} (includes 22 qualifiers)`)

// Top opponents by W%
const ranked = Object.values(opponents.records)
  .filter(r => (r.record.win + r.record.loss) >= 5)
  .map(r => ({ ...r, gp: r.record.win + r.record.loss + r.record.tie, wpct: r.record.win / Math.max(1, r.record.win + r.record.loss) }))
  .sort((a, b) => b.wpct - a.wpct)
console.log(`\nTop 15 by W% (min 5 decisions):`)
for (const r of ranked.slice(0, 15)) {
  const tag = r.isQualifier ? ' (q)' : ''
  console.log(`  ${(r.wpct * 100).toFixed(1).padStart(5)}%  ${String(r.record.win).padStart(2)}-${String(r.record.loss).padStart(2)}-${String(r.record.tie).padStart(2)}  ${r.name}${tag}`)
}
