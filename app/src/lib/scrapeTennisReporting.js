// Fetch live bracket data from tennisreporting.com and convert to our state shape.
// CORS is open (Access-Control-Allow-Origin: *) so this can run directly in the browser.

import { FLIGHTS, TEAMS } from '../data/teams.js'
import { emptyFlight } from './bracket.js'

const EVENT_ID = 786
const HOST_ID  = 3598
const API_BASE = `https://api.tennisreporting.com/event/${EVENT_ID}/host/${HOST_ID}/bracket/get`
const SEEDS_API = `https://api.tennisreporting.com/event/${EVENT_ID}/seed_list_by_params`

// Team name normalization (tennisreporting uses some variants).
const TEAM_ALIASES = {
  'Rochester':             'rochester',
  'Clarkston':             'clarkston',
  'Lake Orion':            'lake_orion',
  'Oxford':                'oxford',
  'Rochester Adams':       'rochester_adams',
  'Auburn Hills Avondale': 'avondale',
  'Davison':               'davison',
  'Lapeer':                'lapeer',
  'Waterford United':      'waterford',
  'Waterford Kettering':   'waterford',
}

function toTeamId(schoolName) {
  return TEAM_ALIASES[schoolName] || null
}

// Build display name for a single match-slot entry (singles = one player, doubles = "P1/P2").
function formatPlayerName(players) {
  if (!players || !players.length) return ''
  const names = players.map(p => `${p.firstName} ${p.lastName}`.trim()).filter(Boolean)
  return names.join('/')
}

// Round-1 match position (1..8) determines which 16-slot pair it covers.
// pair_n teams are slots (n-1)*2 and (n-1)*2+1 in zero-indexed 16-slot layout.
// Their bracket items have `position` (1..) per round and `teams[]` with team.position 1/2.
function r1SlotFor(itemPos, teamPos) {
  return (itemPos - 1) * 2 + (teamPos - 1)
}

// Map a 16-slot index to one of our 9-slot positions. Mirrors scripts/convert-scrape.mjs.
// Returns { ourPos, role } where role tells us what side they sit on (for downstream sanity).
function buildSlotMap(round1Items) {
  // For each R1 match (position 1..8) determine if it's PI or auto-advance.
  // Pair 1 (pos 1, slots 0-1) → group A; pair 2 → group A; pair 3-4 → B; 5-6 → C; 7-8 → D.
  const groupOf = (pairIdx) => 'ABCD'[Math.floor((pairIdx - 1) / 2)]
  // For each pair, find which slot is "real" (player present) or both.
  const pairs = []
  for (const item of round1Items) {
    const idx = item.position
    const slots = [r1SlotFor(idx, 1), r1SlotFor(idx, 2)]
    const realCount = item.teams.filter(t => t.items && t.items.length).length
    const realSlots = item.teams.map((t, i) => t.items && t.items.length ? slots[i] : null)
    pairs.push({ idx, group: groupOf(idx), slots, realSlots, isPlayIn: realCount === 2 })
  }
  const piPair = pairs.find(p => p.isPlayIn)
  const piGroup = piPair ? piPair.group : 'A'
  const swap = piGroup === 'C' || piGroup === 'D'
  const upperGroups = swap ? ['C', 'D'] : ['A', 'B']
  const lowerGroups = swap ? ['A', 'B'] : ['C', 'D']
  const upperOther = upperGroups.find(g => g !== piGroup)
  // Helper: pairs of a given group in display order
  const pairsOf = (g) => pairs.filter(p => p.group === g)
  const slotToOurPos = new Map()
  // QF1: piGroup's two pairs → pos 0 (auto-advance) and pos 7,8 (PI)
  for (const p of pairsOf(piGroup)) {
    if (p.isPlayIn) {
      // slot 0 → our pos 7 (top), slot 1 → our pos 8 (bot)
      slotToOurPos.set(p.slots[0], 7)
      slotToOurPos.set(p.slots[1], 8)
    } else {
      // auto-advance pair: real slot → our pos 0
      const real = p.realSlots.find(s => s !== null)
      if (real != null) slotToOurPos.set(real, 0)
    }
  }
  // QF2: upperOther → pos 3, pos 4 (first pair, second pair)
  pairsOf(upperOther).forEach((p, i) => {
    const targetPos = [3, 4][i]
    if (targetPos == null) return
    const real = p.realSlots.find(s => s !== null)
    if (real != null) slotToOurPos.set(real, targetPos)
  })
  // QF3: lowerGroups[0] → pos 2, pos 5
  pairsOf(lowerGroups[0]).forEach((p, i) => {
    const targetPos = [2, 5][i]
    if (targetPos == null) return
    const real = p.realSlots.find(s => s !== null)
    if (real != null) slotToOurPos.set(real, targetPos)
  })
  // QF4: lowerGroups[1] → pos 1, pos 6
  pairsOf(lowerGroups[1]).forEach((p, i) => {
    const targetPos = [1, 6][i]
    if (targetPos == null) return
    const real = p.realSlots.find(s => s !== null)
    if (real != null) slotToOurPos.set(real, targetPos)
  })
  return { slotToOurPos, piGroup, swap }
}

// Round/position → our match id. PI is always at R1 position 2 in this event's brackets.
function matchIdFor(round, position) {
  if (round === 1 && position === 2) return 'PI'
  if (round === 2 && position >= 1 && position <= 4) return `QF${position}`
  if (round === 3 && position >= 1 && position <= 2) return `SF${position}`
  if (round === 4 && position === 1) return 'F'
  return null
}

// Fetch the bracket and seed list for a single flight; return our flight shape.
async function fetchFlight(flightSpec) {
  const [num, kind] = [parseInt(flightSpec.id, 10), flightSpec.id.endsWith('D') ? 'Doubles' : 'Singles']
  const body = JSON.stringify({ isConsolation: false, matchType: kind, flight: num, host: HOST_ID })
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
  const [bracketRes, seedsRes] = await Promise.all([
    fetch(API_BASE, opts),
    fetch(SEEDS_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isConsolation: false, matchType: kind, flight: num, host: HOST_ID, division: 1262 }) }),
  ])
  if (!bracketRes.ok) throw new Error(`bracket fetch failed for ${flightSpec.id}: ${bracketRes.status}`)
  if (!seedsRes.ok) throw new Error(`seed_list fetch failed for ${flightSpec.id}: ${seedsRes.status}`)
  const bracket = await bracketRes.json()
  const seedListRaw = await seedsRes.json()
  // seed list is an object keyed by 0-indexed seed index, with `players` array each containing `player.id`+`firstName`+`lastName`+`school.name`+`seed`.
  const seedItems = Array.isArray(seedListRaw) ? seedListRaw : Object.values(seedListRaw)
  const playerInfoById = new Map()
  for (const item of seedItems) {
    const players = (item.players || []).map(pw => pw.player).filter(Boolean)
    if (!players.length) continue
    const school = players[0]?.school?.name || ''
    const name = formatPlayerName(players)
    const teamId = toTeamId(school) || null
    for (const pl of players) {
      playerInfoById.set(pl.id, { teamId, name, seed: item.seed, school })
    }
  }

  const items = bracket?.configuration?.bracketItems || []
  const r1 = items.filter(i => i.round === 1).sort((a, b) => a.position - b.position)
  const { slotToOurPos } = buildSlotMap(r1)

  // Build entries[]
  const entries = Array.from({ length: 9 }, (_, i) => ({ pos: i, teamId: null, seed: null, name: '' }))
  for (const item of r1) {
    for (let t = 0; t < item.teams.length; t++) {
      const team = item.teams[t]
      if (!team.items || !team.items.length) continue
      const slot = r1SlotFor(item.position, team.position)
      const ourPos = slotToOurPos.get(slot)
      if (ourPos == null) continue
      const pid = team.items[0].id
      const info = playerInfoById.get(pid)
      if (info) {
        entries[ourPos] = {
          pos: ourPos,
          teamId: info.teamId,
          seed: info.seed ?? null,
          name: info.name || '',
        }
      } else {
        // Player ID present but not in seed list — keep slot but with unknown info
        entries[ourPos] = { pos: ourPos, teamId: null, seed: null, name: '' }
      }
    }
  }

  // Build winners{}
  const winners = {}
  for (const item of items) {
    const mid = matchIdFor(item.round, item.position)
    if (!mid) continue
    const winnerIdx = item.teams.findIndex(t => t.isWinner)
    if (winnerIdx === 0) winners[mid] = 'top'
    else if (winnerIdx === 1) winners[mid] = 'bot'
  }

  return { id: flightSpec.id, entries, winners }
}

// Top-level: scrape all 8 flights. Returns { flights: [...] }.
export async function scrapeAllFlights() {
  const flights = await Promise.all(FLIGHTS.map(f => fetchFlight(f)))
  return { flights }
}

// Re-export for testing / debugging.
export { fetchFlight, TEAM_ALIASES, toTeamId }
