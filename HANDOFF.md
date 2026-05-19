# Tennis Tracker — State Finals Handoff

## What this is

A single-page React app for tracking the MHSAA D1 Girls **State Finals**:
8 flights (1S–4D), each a 32-slot single-elimination bracket. Built for
fast one-handed phone use at the tournament — tap a winner, leaderboard
updates, syncs to Supabase for /view followers, localStorage as offline
buffer.

Live URL: https://tennis-regionals.vercel.app
View-only: https://tennis-regionals.vercel.app/view
Repo: https://github.com/jimshaw247/tennis-regionals (folder name is
historical — the app now serves state finals).

## Bracket structure (32-slot, 5 rounds)

Each flight has 32 bracket positions (`entries[0..31]`). Empty slots become
byes for the opposing slot. Match graph:

| Round | Matches | Source pairs                                    |
|-------|---------|-------------------------------------------------|
| R1    | 16      | (0,1), (2,3), …, (30,31)                        |
| R2    | 8       | (R1m0,R1m1), (R1m2,R1m3), …                     |
| R3    | 4       | (R2m0,R2m1), …  (quarterfinals)                 |
| SF    | 2       | (R3m0,R3m1), (R3m2,R3m3) (semifinals)           |
| F     | 1       | (SFm0, SFm1) (championship)                     |

R1 matchups where one side is empty auto-advance the other (`isBye: true`
on the match). The user only clicks for matches with two real entries.

## Scoring rule

- 1 point per match won.
- A bye is worth 1 point **only if** the entry wins its first actual match
  after that bye. (Two consecutive byes both pay out on the first win.)
- Cap = 5 points per entry (one per round).

Implementation: `entryStanding` walks rounds in order, accumulating
`pendingByes` on bye rounds. On the first actual win, it awards
`1 + pendingByes`. A loss forfeits pending byes.

## Files

```
app/src/
├── App.jsx                  # tabs (Board / Flights / Draws), header, footer
├── data/teams.js            # 22 D1 schools from 2025 + flight list + Clarkston highlight
├── lib/
│   ├── bracket.js           # MATCH_DEFS, resolveSource, describeMatches, entryStanding
│   ├── stats.js             # leaderboard rows + finish bounds
│   ├── storage.js           # localStorage + normalize-on-load (handles old 9-slot saves)
│   └── sync.js              # Supabase realtime sync (unchanged)
└── components/
    ├── Bracket.jsx          # 5-column bracket render, tap-to-pick winner
    ├── DrawSetup.jsx        # 32-slot draw editor (16 R1 matchup rows × 2 slots)
    ├── Leaderboard.jsx      # team rank + points + max + alive + Top 3 badges
    ├── Gate.jsx             # admin login (VITE_ADMIN_USER / VITE_ADMIN_PASS)
    └── SyncButton.jsx       # manual push/pull
scraper/
├── scrape-state.mjs         # Playwright scraper for tennisreporting.com event 611
├── build-teams.mjs          # derive unique school list from a scrape
├── test-bracket.mjs         # 11 assertions on bracket math + scoring rules
└── state-2025.json          # 2025 D1 State Finals full bracket data (all 8 flights, all 5 rounds)
```

## Scraping tennisreporting.com

The page shows only 3 of 5 round columns at a time, toggled by `.nav-btn`
buttons in the `.bracket-navbar`. `scrape-state.mjs` clicks each round
target in turn (R1 → R2 → R3 → Semifinals → Championship) and reads the
visible `.tournament-bracket__round` block each time, then merges.

```
cd scraper
npm install
npx playwright install chromium
node scrape-state.mjs            # writes state-2025.json
node build-teams.mjs             # writes teams-2025.json (drop into app/src/data/teams.js)
node test-bracket.mjs            # unit tests
```

To scrape a different year, change `BASE` in `scrape-state.mjs`:
- `event/brackets/611` is 2025 Finals
- `division=995` is D1
- `host=2951` is State Finals-D1

## Run + deploy

```
cd app
npm install
npm run dev                      # http://localhost:5173
npm run build                    # outputs to app/dist/
```

Vercel auto-deploys on push to main. `vercel.json` rewrites all paths
to `/` so /view works.

## Admin login

Default `admin` / `tennis`. Override via Vercel env vars
`VITE_ADMIN_USER` and `VITE_ADMIN_PASS`.

## Known nits

- Old 9-slot localStorage saves auto-expand to 32 slots on first load
  (`storage.js` normalizes), so existing users won't see a crash but they
  will see empty extra slots — they should "Reset all" or import a fresh
  state.json.
- The Vercel project name is still `tennis-regionals`. Rename later if
  desired.
- 2025 SF/F data exists in `scraper/state-2025.json` if you want to load
  it as a historical demo (not currently wired into the app).
