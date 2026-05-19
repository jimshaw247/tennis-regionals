// Recon school report page: capture API endpoints so we can avoid clicking
// through accordions if the season data is available as JSON.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = `${__dirname}/data/recon`
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
})

const reqs = []
const responses = []
ctx.on('request', r => {
  const url = r.url()
  if (url.includes('api.tennisreporting.com')) {
    reqs.push({ method: r.method(), url, postData: r.postData() })
  }
})
ctx.on('response', async r => {
  const url = r.url()
  if (url.includes('api.tennisreporting.com')) {
    try {
      const ct = r.headers()['content-type'] || ''
      if (ct.includes('json')) {
        const body = await r.json().catch(() => null)
        responses.push({ url, status: r.status(), body, postData: r.request().postData() })
      }
    } catch {}
  }
})

const page = await ctx.newPage()
console.log('Opening /reports/school/4052 (Clarkston) ...')
await page.goto('https://tennisreporting.com/reports/school/4052', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(5000)

console.log('\nAPI requests captured BEFORE expanding any rows:')
for (const r of reqs) {
  console.log(`  ${r.method} ${r.url}`)
  if (r.postData) console.log(`    body: ${r.postData}`)
}

// Try to find and click the first expandable row.
const expandResult = await page.evaluate(() => {
  // Look for accordion expand triggers — usually chevron icons or aria-expanded buttons.
  const candidates = [...document.querySelectorAll('button, [role="button"], [aria-expanded], [class*="expand"], [class*="accordion"], svg, [class*="chevron"]')]
  const interactiveLooking = candidates.filter(el => {
    const r = el.getBoundingClientRect()
    return r.width > 5 && r.height > 5
  })
  return {
    counts: {
      buttons: document.querySelectorAll('button').length,
      ariaExpanded: document.querySelectorAll('[aria-expanded]').length,
      accordions: document.querySelectorAll('[class*="accordion" i]').length,
      svgs: document.querySelectorAll('svg').length,
      cards: document.querySelectorAll('[class*="card" i]').length,
      tableRows: document.querySelectorAll('tr').length,
    },
    bodyHead: document.body.innerText.slice(0, 2000),
    firstFewButtons: [...document.querySelectorAll('button')].slice(0, 10).map(b => ({
      text: b.textContent.trim().slice(0, 60),
      className: b.className,
      ariaExpanded: b.getAttribute('aria-expanded'),
    })),
  }
})
console.log('\nDOM survey:')
console.log(JSON.stringify(expandResult, null, 2).slice(0, 3000))

writeFileSync(`${OUT}/school-4052-requests.json`, JSON.stringify(reqs, null, 2))
writeFileSync(`${OUT}/school-4052-responses.json`, JSON.stringify(responses, null, 2))
writeFileSync(`${OUT}/school-4052.html`, await page.content())

// Try clicking a row to capture detail-fetch endpoints.
const beforeCount = reqs.length
console.log('\nAttempting to click first interactive row...')
const clicked = await page.evaluate(() => {
  // Often accordion headers are <tr> or <div> with onclick. Try clicking rows.
  const candidates = [
    ...document.querySelectorAll('[class*="accordion" i] [class*="summary" i]'),
    ...document.querySelectorAll('[class*="MuiAccordion"] [class*="Summary"]'),
    ...document.querySelectorAll('[aria-expanded="false"]'),
    ...document.querySelectorAll('tr[role="button"]'),
    ...document.querySelectorAll('[class*="match-row"], [class*="MatchRow"]'),
  ]
  console.log('candidates:', candidates.length)
  if (candidates.length === 0) return null
  candidates[0].click()
  return { tag: candidates[0].tagName, className: candidates[0].className, text: candidates[0].textContent.trim().slice(0, 200) }
})
console.log('clicked:', clicked)
await page.waitForTimeout(3000)

console.log(`\nNew API requests after click (${reqs.length - beforeCount} new):`)
for (const r of reqs.slice(beforeCount)) {
  console.log(`  ${r.method} ${r.url}`)
  if (r.postData) console.log(`    body: ${r.postData}`)
}

writeFileSync(`${OUT}/school-4052-requests.json`, JSON.stringify(reqs, null, 2))
writeFileSync(`${OUT}/school-4052-responses.json`, JSON.stringify(responses, null, 2))

await browser.close()
