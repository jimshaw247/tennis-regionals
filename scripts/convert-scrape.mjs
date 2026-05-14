// Convert tennisreporting.com 16-slot bracket scrapes into our 9-slot format.
//
// Their bracket: 9 players in a 16-slot draw. Round 1 has 8 pairs:
//   pairs (0,1)(2,3)(4,5)(6,7) feed QF1+QF2 → SF1
//   pairs (8,9)(10,11)(12,13)(14,15) feed QF3+QF4 → SF2
// Exactly one pair has 2 real players = play-in. The other 7 have 1 real + 1 BYE.
//
// Our 9-slot bracket forces the play-in to feed QF1. So if their play-in is in
// the lower half, we swap upper/lower (preserving actual head-to-head matchups,
// just relabeling SF1/SF2).
//
// Our QF layout: QF1=(pos 0 vs PI pos 7,8); QF2=(pos 3 vs pos 4);
//                QF3=(pos 2 vs pos 5);      QF4=(pos 1 vs pos 6).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const TEAM_ALIASES = {
  'Rochester':                'rochester',
  'Clarkston':                'clarkston',
  'Lake Orion':               'lake_orion',
  'Oxford':                   'oxford',
  'Rochester Adams':          'rochester_adams',
  'Auburn Hills Avondale':    'avondale',
  'Davison':                  'davison',
  'Lapeer':                   'lapeer',
  'Waterford United':         'waterford',
  'Waterford Kettering':      'waterford',
  'Waterford Mott':           'waterford', // just in case
}

function toTeamId(name) {
  if (TEAM_ALIASES[name]) return TEAM_ALIASES[name]
  console.warn(`Unmapped team name: "${name}"`)
  return null
}

// Pairs in display order; first 4 feed SF1, last 4 feed SF2.
// Each entry: [topSlotIdx, botSlotIdx, qfGroup ('A'|'B'|'C'|'D')]
const PAIRS = [
  [0, 1, 'A'], [2, 3, 'A'],   // QF1 in their layout
  [4, 5, 'B'], [6, 7, 'B'],   // QF2 in their layout
  [8, 9, 'C'], [10, 11, 'C'], // QF3 in their layout
  [12, 13, 'D'], [14, 15, 'D'],
]

function convertFlight(flightId, slots) {
  if (slots.length !== 16) throw new Error(`${flightId}: expected 16 slots, got ${slots.length}`)

  // Find play-in: pair where both slots have a real player
  let piPairIdx = -1
  for (let i = 0; i < 8; i++) {
    const [top, bot] = PAIRS[i]
    if (!slots[top].bye && !slots[bot].bye) {
      piPairIdx = i
      break
    }
  }

  // The QF "group" letter (A/B/C/D) tells us which QF the play-in is in.
  const piGroup = piPairIdx >= 0 ? PAIRS[piPairIdx][2] : 'A'
  // SF half: A/B → upper (SF1); C/D → lower (SF2). If play-in is in lower half,
  // swap halves so play-in lands in our SF1.
  const swapHalves = (piGroup === 'C' || piGroup === 'D')

  // For each pair, figure out the "real" player (auto-advance) or both (play-in).
  // Build a mapping: target our-position → {teamId, name, seed}
  const ourPositions = Array.from({ length: 9 }, () => ({ teamId: null, name: '', seed: null }))

  // Decide our QF assignment per their group, given swapHalves.
  const upperGroups = swapHalves ? ['C', 'D'] : ['A', 'B']  // → our QF1, QF2 (SF1)
  const lowerGroups = swapHalves ? ['A', 'B'] : ['C', 'D']  // → our QF3, QF4 (SF2)

  // The play-in's group → our QF1; the other upper group → our QF2.
  const upperOther = upperGroups.find(g => g !== piGroup)
  // (note: if piGroup is in lower half but we swap, piGroup is now upper)

  // Sort pairs by group, then by display order, to assign positions deterministically.
  const groupPairs = { A: [], B: [], C: [], D: [] }
  for (let i = 0; i < 8; i++) {
    groupPairs[PAIRS[i][2]].push(PAIRS[i])
  }

  const entryFromSlot = (slotIdx) => {
    const s = slots[slotIdx]
    if (s.bye) return null
    return { teamId: toTeamId(s.t), name: s.p || '', seed: null }
  }

  // Helper: place the single real player of an auto-advance pair at our-pos `targetPos`.
  // Place both real players of a play-in pair at our-pos 7 (top) and 8 (bot).
  function placePair(pair, qfRole) {
    const [top, bot] = pair
    const tEntry = entryFromSlot(top)
    const bEntry = entryFromSlot(bot)
    if (tEntry && bEntry) {
      // play-in
      ourPositions[7] = tEntry
      ourPositions[8] = bEntry
    } else {
      const real = tEntry || bEntry
      if (!real) return // both BYE: leave teamId null at qfRole's "auto-advance" position
      ourPositions[qfRole] = real
    }
  }

  // Our QF1 = play-in + pos 0 (auto-advance from the non-PI pair in pi group)
  // Our QF2 = pos 3 (pair 1 of upperOther) + pos 4 (pair 2 of upperOther)
  // Our QF3 = pos 2 (pair 1 of lowerGroup1) + pos 5 (pair 2 of lowerGroup1)
  // Our QF4 = pos 1 (pair 1 of lowerGroup2) + pos 6 (pair 2 of lowerGroup2)

  // QF1: process pi group's two pairs
  const piGroupPairs = groupPairs[piGroup]
  for (const pair of piGroupPairs) {
    const [top, bot] = pair
    const tE = entryFromSlot(top)
    const bE = entryFromSlot(bot)
    if (tE && bE) {
      ourPositions[7] = tE
      ourPositions[8] = bE
    } else {
      const real = tE || bE
      if (real) ourPositions[0] = real
    }
  }

  // QF2: upperOther group → pos 3 (first pair), pos 4 (second pair)
  const upperOtherPairs = groupPairs[upperOther]
  ;[3, 4].forEach((targetPos, i) => {
    const pair = upperOtherPairs[i]
    if (!pair) return
    const [top, bot] = pair
    const real = entryFromSlot(top) || entryFromSlot(bot)
    if (real) ourPositions[targetPos] = real
  })

  // QF3: lowerGroups[0] → pos 2, pos 5
  const qf3Pairs = groupPairs[lowerGroups[0]]
  ;[2, 5].forEach((targetPos, i) => {
    const pair = qf3Pairs[i]
    if (!pair) return
    const [top, bot] = pair
    const real = entryFromSlot(top) || entryFromSlot(bot)
    if (real) ourPositions[targetPos] = real
  })

  // QF4: lowerGroups[1] → pos 1, pos 6
  const qf4Pairs = groupPairs[lowerGroups[1]]
  ;[1, 6].forEach((targetPos, i) => {
    const pair = qf4Pairs[i]
    if (!pair) return
    const [top, bot] = pair
    const real = entryFromSlot(top) || entryFromSlot(bot)
    if (real) ourPositions[targetPos] = real
  })

  return {
    id: flightId,
    entries: ourPositions.map((e, pos) => ({ pos, teamId: e.teamId, seed: e.seed, name: e.name })),
    winners: {},
  }
}

// --- main ---
const scraped = JSON.parse(fs.readFileSync(path.join(ROOT, '_scraped.json'), 'utf8'))
const flightIds = ['1S', '2S', '3S', '4S', '1D', '2D', '3D', '4D']
const flights = flightIds.map(id => convertFlight(id, scraped[id]))
const state = { flights }

const outPath = path.join(ROOT, 'app', 'src', 'data', 'seedDraws.js')
fs.writeFileSync(
  outPath,
  `// Auto-generated by scripts/convert-scrape.mjs from tennisreporting.com event 786.\n` +
  `// MHSAA Regional 2026, Regional 7-Rochester Adams, Division 1 Girls.\n` +
  `export const SEED_DRAWS = ${JSON.stringify(state, null, 2)}\n`
)
console.log(`Wrote ${outPath}`)
console.log(`Summary:`)
for (const f of flights) {
  const real = f.entries.filter(e => e.teamId).length
  console.log(`  ${f.id}: ${real}/9 entries filled`)
}
