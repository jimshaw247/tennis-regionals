// Unit tests for the 32-slot state-finals bracket math.
import { emptyFlight, setWinner, describeMatches, entryStanding, aggregate, FLIGHT_SIZE, ROUND_DEFS } from '../app/src/lib/bracket.js'
import { leaderboard } from '../app/src/lib/stats.js'
import { TEAMS } from '../app/src/data/teams.js'

let fails = 0
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); fails++ }
  else console.log('  ok:', msg)
}

// Helper: fill specific bracket positions with teams (one per position).
function fillFlight(positions) {
  let f = emptyFlight('1S')
  const entries = f.entries.map(e => ({ ...e }))
  for (const [pos, teamId, name] of positions) {
    entries[pos] = { ...entries[pos], teamId, seed: pos + 1, name: name || `P${pos}` }
  }
  return { ...f, entries }
}

// ---- Scenario 1: empty flight ----
console.log('Scenario: empty flight (all 32 slots)')
let f = emptyFlight('1S')
let s = entryStanding(f, 0)
assert(s.wins === 0 && !s.alive, 'empty position not alive (no teamId)')

// ---- Scenario 2: full bracket, 32 entries, top seed wins out with no byes ----
console.log('Scenario: full 32-entry bracket, top-seed wins championship')
f = fillFlight(TEAMS.slice(0, 22).map((t, i) => [i, t.id])
  // Pad to 32 by repeating first 10 teams (just for shape — we'll only inspect pos 0).
  .concat(TEAMS.slice(0, 10).map((t, i) => [22 + i, t.id, `Filler${i}`])))

// Pos 0 plays pos 1 in R1, pos 0 wins each round (top side)
f = setWinner(f, 'R1m0', 'top') // pos 0 beats pos 1 in R1
f = setWinner(f, 'R2m0', 'top') // R2: pos 0 vs winner of R1m1
f = setWinner(f, 'R1m1', 'top') // need R1m1 decided so R2 chain resolves
// Resolve dependencies: re-pick R2 now that R1m1 is in.
f = setWinner(f, 'R2m0', 'top')
// Continue
f = setWinner(f, 'R1m2', 'top'); f = setWinner(f, 'R1m3', 'top')
f = setWinner(f, 'R2m1', 'top')
f = setWinner(f, 'R3m0', 'top')
// Need to populate the SF1 opposing side; just pick whatever to make the chain advance.
for (let i = 4; i < 8; i++) f = setWinner(f, `R1m${i}`, 'top')
f = setWinner(f, 'R2m2', 'top'); f = setWinner(f, 'R2m3', 'top')
f = setWinner(f, 'R3m1', 'top')
f = setWinner(f, 'SFm0', 'top')
for (let i = 8; i < 16; i++) f = setWinner(f, `R1m${i}`, 'top')
for (let i = 4; i < 8; i++) f = setWinner(f, `R2m${i}`, 'top')
for (let i = 2; i < 4; i++) f = setWinner(f, `R3m${i}`, 'top')
f = setWinner(f, 'SFm1', 'top')
f = setWinner(f, 'Fm0', 'top')

s = entryStanding(f, 0)
assert(s.wins === 5, `pos 0 wins all 5 rounds → 5 points (got ${s.wins})`)
assert(!s.alive ? false : true, 'pos 0 still alive (won championship)')

// ---- Scenario 3: bye round payout rule ----
console.log('Scenario: bye in R1 → +1 only if R2 win')
f = emptyFlight('1S')
// Put a team at pos 0, leave pos 1 empty (bye for pos 0).
f = {
  ...f,
  entries: f.entries.map((e, i) => {
    if (i === 0) return { ...e, teamId: 'clarkston', name: 'Test' }
    if (i === 2) return { ...e, teamId: 'rockford', name: 'Opp' }
    if (i === 3) return { ...e, teamId: 'novi', name: 'Opp2' }
    return e
  }),
}
// Before any R2 winner picked: pos 0 has a R1 bye but no points credited.
s = entryStanding(f, 0)
assert(s.wins === 0 && s.pendingByes === 1, 'pos 0: R1 bye pending, 0 points so far')
assert(s.alive, 'pos 0 still alive after bye')

// R2m0 pairs winner of R1m0 (pos 0, by bye) with winner of R1m1 (pos 2 vs pos 3).
// First make R1m1 decided so R2m0 has two sides:
f = setWinner(f, 'R1m1', 'top') // pos 2 wins R1m1
// Now pos 0 wins R2m0 → both the R1 bye and the R2 win pay out.
f = setWinner(f, 'R2m0', 'top')
s = entryStanding(f, 0)
assert(s.wins === 2, `pos 0 wins R2 → 1 (R2 win) + 1 (bye payout) = 2 points (got ${s.wins})`)

// Now reverse: pos 0 LOSES R2 (pos 2 wins). Pos 0's bye should NOT pay out.
f = setWinner(f, 'R2m0', 'bot')
s = entryStanding(f, 0)
assert(s.wins === 0 && !s.alive, `pos 0 loses R2 → 0 points, bye forfeited (got ${s.wins})`)
// And pos 2 should have R1 win (1) + R2 win (1) = 2 points.
s = entryStanding(f, 2)
assert(s.wins === 2, `pos 2: actual R1 win + R2 win = 2 points (got ${s.wins})`)

// ---- Scenario 4: two consecutive byes pay out on first win ----
console.log('Scenario: bye in R1 AND R2 → +2 on R3 win')
f = emptyFlight('1S')
// Pos 0 has bye in R1 (pos 1 empty). R2m0 pairs R1m0 winner with R1m1 winner.
// If R1m1 winner is also bye-only (both pos 2 and 3 empty), R2m0 auto-favors pos 0.
// But then R2m0 is also a bye for pos 0 (opponent slot empty). Set up pos 4-7 so R3m0 is a real match.
f = {
  ...f,
  entries: f.entries.map((e, i) => {
    if (i === 0) return { ...e, teamId: 'clarkston', name: 'Test' }
    if (i === 4) return { ...e, teamId: 'rockford', name: 'O1' }
    if (i === 5) return { ...e, teamId: 'novi',     name: 'O2' }
    return e
  }),
}
// R3m0 needs both R2m0 (auto-bye to pos 0) and R2m1 (pos 4 vs pos 5) decided.
f = setWinner(f, 'R1m2', 'top') // pos 4 advances R1m2
// Actually wait — pos 4 is in R1m2 (pair of positions 4,5). With pos 5 also filled, this is a real match.
f = setWinner(f, 'R2m1', 'top') // pos 4 beats whoever in R2
// Now R3m0: pos 0 (bye-bye chain) vs pos 4. If pos 0 wins, gets 1 (R3 win) + 2 (pending byes) = 3.
f = setWinner(f, 'R3m0', 'top')
s = entryStanding(f, 0)
assert(s.wins === 3, `pos 0: R1 bye + R2 bye + R3 win → 3 points (got ${s.wins})`)

// ---- Scenario 5: cap is 5 points per entry ----
console.log('Scenario: max points per entry = 5 (one per round)')
assert(ROUND_DEFS.length === 5, 'exactly 5 rounds defined')

// ---- Scenario 6: aggregate across flights ----
console.log('Scenario: aggregate sums across flights')
const flights = [f, emptyFlight('2S'), emptyFlight('3S'), emptyFlight('4S'),
                 emptyFlight('1D'), emptyFlight('2D'), emptyFlight('3D'), emptyFlight('4D')]
const agg = aggregate(flights)
assert(agg.points.clarkston === 3, `clarkston aggregate = 3 points across all flights (got ${agg.points.clarkston})`)

// ---- Scenario 7: leaderboard sorts and ranks ----
console.log('Scenario: leaderboard ranks clarkston ahead of zero-point teams')
const rows = leaderboard(flights)
const clarkstonRow = rows.find(r => r.team.id === 'clarkston')
assert(clarkstonRow.points === 3, `leaderboard sees clarkston with 3 pts (got ${clarkstonRow.points})`)
assert(clarkstonRow.displayRank === 1, `clarkston ranked #1 (got #${clarkstonRow.displayRank})`)

if (fails > 0) {
  console.error(`\n${fails} test(s) failed.`)
  process.exit(1)
}
console.log('\nAll tests passed.')
