// Phase 0 recon: verify what tennisreporting.com is showing right now.
// 1. Hit user-supplied 786 Clarkston URL — verify it has 2026 content.
// 2. Hit /event and look for 2026 D1 Girls regionals.
// 3. Save raw HTML for both for offline grep.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = `${__dirname}/data/recon`
mkdirSync(OUT, { recursive: true })

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ userAgent: USER_AGENT })

async function fetchAndSnap(label, url, waitMs = 5000) {
  const page = await ctx.newPage()
  console.log(`[${label}] ${url}`)
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  } catch (e) {
    console.log(`  goto warning: ${e.message}`)
  }
  await page.waitForTimeout(waitMs)
  const title = await page.title().catch(() => '')
  const html = await page.content()
  writeFileSync(`${OUT}/${label}.html`, html)

  // Pull a few diagnostic things from the page.
  const snapshot = await page.evaluate(() => {
    const text = document.body?.innerText || ''
    return {
      h1: [...document.querySelectorAll('h1')].map(e => e.textContent.trim()).slice(0, 5),
      h2: [...document.querySelectorAll('h2')].map(e => e.textContent.trim()).slice(0, 10),
      hostHeader: document.querySelector('.host-header, .event-header, .header-info')?.textContent?.trim()?.slice(0, 300) || null,
      bracketTitle: document.querySelector('.tournament-bracket__round-title')?.textContent?.trim() || null,
      navBtns: [...document.querySelectorAll('.bracket-navbar .nav-btn')].map(e => e.textContent.trim()),
      events_links: [...document.querySelectorAll('a[href*="/event/brackets/"]')].slice(0, 30).map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim().slice(0, 80),
      })),
      // Generic links that look like event listings
      sample_links: [...document.querySelectorAll('a')].slice(0, 50).map(a => ({
        href: a.getAttribute('href'),
        text: a.textContent.trim().slice(0, 80),
      })).filter(x => x.text && x.href),
      year_mentions: (text.match(/\b20(2[4-6])\b/g) || []).slice(0, 20),
      text_head: text.slice(0, 2000),
    }
  })
  console.log(`  title: ${title}`)
  console.log(`  h1: ${JSON.stringify(snapshot.h1)}`)
  console.log(`  h2: ${JSON.stringify(snapshot.h2)}`)
  if (snapshot.hostHeader) console.log(`  hostHeader: ${snapshot.hostHeader}`)
  if (snapshot.bracketTitle) console.log(`  bracketTitle: ${snapshot.bracketTitle}`)
  if (snapshot.navBtns.length) console.log(`  navBtns: ${JSON.stringify(snapshot.navBtns)}`)
  console.log(`  year mentions in page: ${JSON.stringify([...new Set(snapshot.year_mentions)])}`)
  console.log(`  event-bracket links: ${snapshot.events_links.length}`)
  writeFileSync(`${OUT}/${label}.json`, JSON.stringify(snapshot, null, 2))
  await page.close()
  return snapshot
}

// 1. User-provided Clarkston regional URL — strip the funky spaces.
const clarkstonRegional = 'https://tennisreporting.com/event/brackets/786?division=1262&host=3598&matchType=Singles&flight=1'
await fetchAndSnap('clarkston-regional-786', clarkstonRegional, 6000)

// 2. Public events listing page
await fetchAndSnap('events-listing', 'https://tennisreporting.com/event', 6000)

// 3. Tennisreporting.com home (often has tournament listings)
await fetchAndSnap('home', 'https://tennisreporting.com/', 5000)

await browser.close()
console.log('\nDone. HTML + JSON snapshots written to scraper/sos/data/recon/')
