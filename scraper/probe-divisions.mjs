// Probe tennisreporting for D2/D3/D4 state finals host IDs.
// Strategy: spider divisions 990-1010 × hosts 2940-2970 looking for valid
// bracket pages. Real pages render player names on a JS-rendered page, so we
// use Playwright not curl.
import { chromium } from 'playwright'

const EVENT_ID = 611
const TARGETS = []
// Likely candidates: D1 is division=995. Try D2-D4 nearby.
for (const div of [994, 996, 997, 998, 999, 1000]) {
  for (const host of [2949, 2950, 2952, 2953, 2954, 2955, 2956, 2957, 2958]) {
    TARGETS.push({ div, host })
  }
}

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
})

const hits = []
for (const { div, host } of TARGETS) {
  const url = `https://tennisreporting.com/event/brackets/${EVENT_ID}?division=${div}&host=${host}&matchType=Singles&flight=1`
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(800)
    const info = await page.evaluate(() => {
      const heading = document.querySelector('h1, h2')?.textContent?.trim() || ''
      const divLabel = [...document.querySelectorAll('*')].find(el => el.children.length === 0 && /^Select a Division$/i.test(el.textContent || ''))
      const hostLabel = [...document.querySelectorAll('*')].find(el => el.children.length === 0 && /^Select a Host$/i.test(el.textContent || ''))
      const divSel = divLabel?.parentElement?.parentElement?.textContent?.trim() || ''
      const hostSel = hostLabel?.parentElement?.parentElement?.textContent?.trim() || ''
      const r1 = [...document.querySelectorAll('.tournament-bracket__round')].find(r => /Round 1/i.test(r.querySelector('.tournament-bracket__round-title')?.textContent || ''))
      const matches = r1 ? r1.querySelectorAll(':scope > ul > li').length : 0
      const sampleNames = [...document.querySelectorAll('a[href*="/reports/player/"]')].slice(0, 3).map(a => a.textContent.trim())
      return { heading, divSel, hostSel, matches, sampleNames }
    })
    if (info.matches > 0) {
      hits.push({ div, host, ...info })
      console.log(`  HIT div=${div} host=${host}: ${info.divSel.replace(/Select a Division/, '').trim()} / ${info.hostSel.replace(/Select a Host/, '').trim()} (${info.matches} R1 matches)`)
    }
  } catch { /* ignore network errors during probing */ }
  await page.close()
}

await browser.close()
console.log('\nHits:', JSON.stringify(hits, null, 2))
