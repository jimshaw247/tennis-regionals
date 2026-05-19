// Phase 1.a: Discover all 8 D1 Girls Tennis 2026 Regionals from the
// tennisreporting.com events API. Output: data/regionals.json
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = `${__dirname}/data`
mkdirSync(OUT, { recursive: true })

const EVENTS_API = 'https://api.tennisreporting.com/events'
const YEAR = 2026
const GENDER_FEMALE = 2
const STATE_MICHIGAN = 30
// D1 division name is "1" — we'll resolve the id at scrape time.

async function fetchEvents(page = 0, pageSize = 100) {
  const body = {
    page,
    pageSize,
    sorted: { dateEventStart: 'DESC' },
    filtered: { year: YEAR, genderId: GENDER_FEMALE, stateId: STATE_MICHIGAN },
  }
  const res = await fetch(EVENTS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`events fetch ${res.status}: ${await res.text()}`)
  return res.json()
}

const all = []
let page = 0
while (true) {
  const { rows, count, pages } = await fetchEvents(page, 100)
  all.push(...rows)
  console.log(`page ${page}: ${rows.length} rows  (total so far: ${all.length} / ${count})`)
  if (all.length >= count || rows.length === 0) break
  page++
  if (page > 10) break
}

// Each event has `divisions: [{ id, name: '1'|'2'|..., hosts: [{ id, name }] }]`.
// "MHSAA Regional-2026" is the regional series. Each regional event represents
// one host location across all four divisions, so the event has 4 divisions.
// Hosts per division are different IDs.
const regionals = all.filter(e => /^MHSAA Regional/i.test(e.name))
console.log(`\nFound ${regionals.length} regional events`)

// Each "MHSAA Regional" event contains all 8 regional sites under its D1
// division's `hosts` array. Enumerate every host.
const d1Regionals = []
for (const ev of regionals) {
  const d1 = (ev.divisions || []).find(d => d.name === '1')
  if (!d1) continue
  for (const host of (d1.hosts || [])) {
    d1Regionals.push({
      eventId: ev.id,
      eventName: ev.name,
      bracketType: ev.bracketType,
      dateEventStart: ev.dateEventStart,
      dateBracketView: ev.dateBracketView,
      divisionId: d1.id,
      divisionName: d1.name,
      hostId: host.id,
      hostName: host.name,
    })
  }
}

// Sort by regional number parsed from the host name (e.g., "Regional 1-Clarkston" → 1).
d1Regionals.sort((a, b) => {
  const an = parseInt((a.hostName.match(/Regional\s*(\d+)/i) || [])[1] || '999', 10)
  const bn = parseInt((b.hostName.match(/Regional\s*(\d+)/i) || [])[1] || '999', 10)
  return an - bn
})

console.log('\nD1 Regionals (sorted by regional number):')
for (const r of d1Regionals) {
  console.log(`  ${r.hostName.padEnd(40)} event=${r.eventId}  host=${r.hostId}  division=${r.divisionId}  bracketType=${r.bracketType}  start=${r.dateEventStart?.slice(0,10)}`)
}

// Also pull the state finals for reference.
const stateFinals = all.find(e => /MHSAA Finals/i.test(e.name))
const sfD1 = stateFinals && (stateFinals.divisions || []).find(d => d.name === '1')
const sfHost = sfD1?.hosts?.[0]
const stateFinalsD1 = stateFinals && sfHost ? {
  eventId: stateFinals.id,
  eventName: stateFinals.name,
  bracketType: stateFinals.bracketType,
  dateEventStart: stateFinals.dateEventStart,
  divisionId: sfD1.id,
  hostId: sfHost.id,
  hostName: sfHost.name,
} : null
console.log('\nState Finals D1:', stateFinalsD1)

writeFileSync(`${OUT}/regionals.json`, JSON.stringify({ d1Regionals, stateFinalsD1, generatedAt: new Date().toISOString() }, null, 2))
writeFileSync(`${OUT}/all_events_2026_d1_girls.json`, JSON.stringify(all, null, 2))
console.log(`\nWrote ${d1Regionals.length} D1 regionals + state finals to data/regionals.json`)
console.log(`Wrote all ${all.length} events to data/all_events_2026_d1_girls.json`)
