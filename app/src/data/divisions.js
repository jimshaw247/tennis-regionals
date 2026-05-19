// Per-division config for MHSAA State Finals.
//
// Each division has its own Supabase row (id) and its own highlight team.
// `host` is the host parameter used in the tennisreporting.com URL — needed
// only for re-running the scraper. `null` means we don't have it yet (you'll
// find it from the live bracket URL once the division's bracket is posted).
export const DIVISIONS = [
  { id: 'D1', label: 'D1', stateRowId: 1, division: 995, host: 2951, highlightTeam: 'clarkston', available: true },
  { id: 'D2', label: 'D2', stateRowId: 2, division: 996, host: 2952, highlightTeam: null,        available: true },
  { id: 'D3', label: 'D3', stateRowId: 3, division: 997, host: 2953, highlightTeam: null,        available: true },
  { id: 'D4', label: 'D4', stateRowId: 4, division: 998, host: 2954, highlightTeam: null,        available: true },
]

export const DIVISION_BY_ID = Object.fromEntries(DIVISIONS.map(d => [d.id, d]))

// Read current division from URL hash (`#d=D2`) or default to D1.
export function readDivisionFromUrl() {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/[#&]d=(D[1-4])/i)
  return (m?.[1] || 'D1').toUpperCase()
}

export function writeDivisionToUrl(id) {
  if (typeof location === 'undefined') return
  location.hash = `d=${id}`
}
