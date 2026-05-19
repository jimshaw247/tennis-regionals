// MHSAA D1 Girls State Finals teams. Roster derived from the 2025 bracket
// (22 regional qualifiers across 8 flights). Update once 2026 qualifiers
// are confirmed; any team not listed here can be added before draws are entered.
export const TEAMS = [
  { id: 'ann_arbor_huron',             name: 'Ann Arbor Huron',             short: 'AAH',  color: '#ef4444' },
  { id: 'ann_arbor_pioneer',           name: 'Ann Arbor Pioneer',           short: 'AAP',  color: '#f97316' },
  { id: 'bloomfield_hills',            name: 'Bloomfield Hills',            short: 'BH',   color: '#10b981' },
  { id: 'clarkston',                   name: 'Clarkston',                   short: 'CLA',  color: '#3b82f6' },
  { id: 'grand_blanc',                 name: 'Grand Blanc',                 short: 'GB',   color: '#a855f7' },
  { id: 'holland_west_ottawa',         name: 'Holland West Ottawa',         short: 'HWO',  color: '#06b6d4' },
  { id: 'howell',                      name: 'Howell',                      short: 'HOW',  color: '#ec4899' },
  { id: 'kalamazoo_central',           name: 'Kalamazoo Central',           short: 'KC',   color: '#84cc16' },
  { id: 'northville',                  name: 'Northville',                  short: 'NVL',  color: '#f59e0b' },
  { id: 'novi',                        name: 'Novi',                        short: 'NOV',  color: '#8b5cf6' },
  { id: 'okemos',                      name: 'Okemos',                      short: 'OKE',  color: '#14b8a6' },
  { id: 'portage_central',             name: 'Portage Central',             short: 'PC',   color: '#eab308' },
  { id: 'rochester',                   name: 'Rochester',                   short: 'ROC',  color: '#d946ef' },
  { id: 'rochester_adams',             name: 'Rochester Adams',             short: 'RA',   color: '#22c55e' },
  { id: 'rochester_hills_stoney_creek', name: 'Rochester Hills Stoney Creek', short: 'RHSC', color: '#0ea5e9' },
  { id: 'rockford',                    name: 'Rockford',                    short: 'RKF',  color: '#f43f5e' },
  { id: 'romeo',                       name: 'Romeo',                       short: 'ROM',  color: '#6366f1' },
  { id: 'saline',                      name: 'Saline',                      short: 'SAL',  color: '#fb923c' },
  { id: 'troy',                        name: 'Troy',                        short: 'TRY',  color: '#a3e635' },
  { id: 'troy_athens',                 name: 'Troy Athens',                 short: 'TA',   color: '#fde047' },
  { id: 'utica_eisenhower',            name: 'Utica Eisenhower',            short: 'UE',   color: '#dc2626' },
  { id: 'west_bloomfield',             name: 'West Bloomfield',             short: 'WB',   color: '#2563eb' },
]

export const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]))

export const HIGHLIGHT_TEAM = 'clarkston'

export const FLIGHTS = [
  { id: '1S', label: '1 Singles' },
  { id: '2S', label: '2 Singles' },
  { id: '3S', label: '3 Singles' },
  { id: '4S', label: '4 Singles' },
  { id: '1D', label: '1 Doubles' },
  { id: '2D', label: '2 Doubles' },
  { id: '3D', label: '3 Doubles' },
  { id: '4D', label: '4 Doubles' },
]
