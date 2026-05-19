// Phase 1.b: Fetch all 8 D1 regional brackets × 8 flights via the
// tennisreporting.com bracket API. Also fetch seed lists (player info).
// Output: data/regionals/{regionalKey}/{flightId}.json containing
// raw bracket + seed_list + parsed entries/winners.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = `${__dirname}/data/regionals`
mkdirSync(BASE, { recursive: true })

const { d1Regionals } = JSON.parse(readFileSync(`${__dirname}/data/regionals.json`, 'utf8'))

const FLIGHTS = [
  ...[1, 2, 3, 4].map(f => ({ id: `${f}S`, matchType: 'Singles', flight: f })),
  ...[1, 2, 3, 4].map(f => ({ id: `${f}D`, matchType: 'Doubles', flight: f })),
]

async function fetchJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${url} ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function regionalKey(r) {
  const m = r.hostName.match(/Regional\s*(\d+)/i)
  const num = m ? m[1].padStart(2, '0') : '99'
  const place = r.hostName.replace(/Regional\s*\d+-/i, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  return `r${num}_${place}`
}

for (const reg of d1Regionals) {
  const key = regionalKey(reg)
  const dir = `${BASE}/${key}`
  mkdirSync(dir, { recursive: true })
  console.log(`\n=== ${reg.hostName} (event ${reg.eventId} / host ${reg.hostId} / div ${reg.divisionId}) ===`)
  for (const f of FLIGHTS) {
    const outFile = `${dir}/${f.id}.json`
    if (existsSync(outFile)) {
      console.log(`  ${f.id}: cached`)
      continue
    }
    const bracketUrl = `https://api.tennisreporting.com/event/${reg.eventId}/host/${reg.hostId}/bracket/get`
    const seedsUrl   = `https://api.tennisreporting.com/event/${reg.eventId}/seed_list_by_params`
    const reqBody = { isConsolation: false, matchType: f.matchType, flight: f.flight, host: reg.hostId, division: reg.divisionId }
    try {
      const [bracket, seedsRaw] = await Promise.all([
        fetchJson(bracketUrl, reqBody),
        fetchJson(seedsUrl, reqBody),
      ])
      const seedList = Array.isArray(seedsRaw) ? seedsRaw : Object.values(seedsRaw || {})
      writeFileSync(outFile, JSON.stringify({ regional: reg, flight: f, bracket, seedList }, null, 2))
      const items = bracket?.configuration?.bracketItems || []
      const r1 = items.filter(i => i.round === 1)
      const decided = items.filter(i => (i.teams || []).some(t => t.isWinner))
      console.log(`  ${f.id}: bracketItems=${items.length} r1=${r1.length} decided=${decided.length} seedListEntries=${seedList.length}`)
    } catch (e) {
      console.log(`  ${f.id}: FAILED - ${e.message}`)
      writeFileSync(`${dir}/${f.id}.error.txt`, e.message)
    }
    await sleep(400)
  }
}

console.log('\nDone. Raw bracket data saved per regional under data/regionals/')
