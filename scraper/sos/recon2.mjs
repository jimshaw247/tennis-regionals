// Recon 2: drive the /event page filters to find 2026 D1 Girls regionals.
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

// Capture XHRs so we can see how the events list is fetched and reuse the API directly.
const reqs = []
ctx.on('request', r => {
  const url = r.url()
  if (url.includes('api') || url.includes('event')) {
    reqs.push({ method: r.method(), url, postData: r.postData() })
  }
})

const page = await ctx.newPage()
console.log('Opening /event ...')
await page.goto('https://tennisreporting.com/event', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(3000)

// Dump every select / dropdown on the page so we can drive them.
const controls = await page.evaluate(() => {
  return {
    selects: [...document.querySelectorAll('select')].map(s => ({
      name: s.getAttribute('name') || s.getAttribute('id') || s.className,
      options: [...s.querySelectorAll('option')].map(o => ({ value: o.value, text: o.textContent.trim() })),
    })),
    inputs: [...document.querySelectorAll('input')].map(i => ({
      type: i.type,
      name: i.name,
      id: i.id,
      className: i.className,
      placeholder: i.placeholder,
      value: i.value,
    })),
    buttons: [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent.trim().slice(0, 80),
      className: b.className,
    })).slice(0, 40),
    // React-style filter rows often use divs with role=combobox or .Select__control
    customDropdowns: [...document.querySelectorAll('[class*="select"], [class*="Select"], [class*="dropdown"], [role="combobox"]')].slice(0, 30).map(d => ({
      className: d.className,
      text: d.textContent.trim().slice(0, 120),
    })),
  }
})
console.log('Controls:')
console.log(JSON.stringify(controls, null, 2).slice(0, 4000))
writeFileSync(`${OUT}/events-controls.json`, JSON.stringify(controls, null, 2))

console.log('\nCaptured network requests so far:')
for (const r of reqs.slice(0, 30)) console.log(`  ${r.method} ${r.url}`)
writeFileSync(`${OUT}/events-requests.json`, JSON.stringify(reqs, null, 2))

await browser.close()
