// Compare scraped state (from tennisreporting) to current local state.
// Conflict rules (per user):
//   - site empty,    local empty    → no-op
//   - site has X,    local empty    → adopt X silently
//   - site has X,    local has X    → no-op
//   - site has X,    local has Y    → adopt X, flag as conflict
//   - site empty,    local has X    → keep local, flag as "ahead" (no banner)

import { MATCH_DEFS } from './bracket.js'

const MATCH_IDS = MATCH_DEFS.map(m => m.id) // ['PI', 'QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'F']

export function diffFlights(scrapedFlights, localFlights) {
  const localById = Object.fromEntries(localFlights.map(f => [f.id, f]))
  const out = {
    entryChanges: [],     // [{flightId, pos, before, after}]
    winnerChanges: [],    // [{flightId, matchId, before, after, kind: 'adopt' | 'overwrite'}]
    aheadOfSite: [],      // [{flightId, matchId, value}]
  }
  for (const scraped of scrapedFlights) {
    const local = localById[scraped.id] || { entries: [], winners: {} }

    // Entries
    for (let pos = 0; pos < 9; pos++) {
      const a = scraped.entries[pos] || { pos, teamId: null, seed: null, name: '' }
      const b = local.entries[pos]   || { pos, teamId: null, seed: null, name: '' }
      if (a.teamId !== b.teamId || a.name !== b.name) {
        out.entryChanges.push({ flightId: scraped.id, pos, before: b, after: a })
      }
    }

    // Winners
    const sW = scraped.winners || {}
    const lW = local.winners   || {}
    for (const mid of MATCH_IDS) {
      const siteVal = sW[mid]
      const localVal = lW[mid]
      if (!siteVal && !localVal) continue
      if (siteVal && !localVal) {
        out.winnerChanges.push({ flightId: scraped.id, matchId: mid, before: null, after: siteVal, kind: 'adopt' })
      } else if (siteVal && localVal && siteVal === localVal) {
        // identical — no diff
      } else if (siteVal && localVal && siteVal !== localVal) {
        out.winnerChanges.push({ flightId: scraped.id, matchId: mid, before: localVal, after: siteVal, kind: 'overwrite' })
      } else if (!siteVal && localVal) {
        out.aheadOfSite.push({ flightId: scraped.id, matchId: mid, value: localVal })
      }
    }
  }
  return out
}

// Apply the merge per rules: site wins where defined, local kept where site empty.
export function mergeState(scrapedFlights, localFlights) {
  const localById = Object.fromEntries(localFlights.map(f => [f.id, f]))
  return {
    flights: scrapedFlights.map(scraped => {
      const local = localById[scraped.id] || { entries: [], winners: {} }
      const mergedWinners = { ...(local.winners || {}) }
      // Site wins where site has a value (overwrites local). Local kept where site is empty.
      for (const [mid, val] of Object.entries(scraped.winners || {})) {
        mergedWinners[mid] = val
      }
      return {
        id: scraped.id,
        entries: scraped.entries,    // always trust site for entries
        winners: mergedWinners,
      }
    }),
  }
}
