// Recon 3: drive the dropdowns to Female + Michigan + 2026, capture XHRs,
// then dump the events table data and any underlying API calls.
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
ctx.on('request', r => {
  const url = r.url()
  if (url.includes('api.tennisreporting.com')) {
    reqs.push({ method: r.method(), url, postData: r.postData(), headers: r.headers() })
  }
})
const responses = []
ctx.on('response', async r => {
  const url = r.url()
  if (url.includes('api.tennisreporting.com')) {
    try {
      const status = r.status()
      const ct = r.headers()['content-type'] || ''
      if (ct.includes('json')) {
        const body = await r.json().catch(() => null)
        responses.push({ url, status, body })
      } else {
        responses.push({ url, status, ct })
      }
    } catch {}
  }
})

const page = await ctx.newPage()
console.log('Opening /event ...')
await page.goto('https://tennisreporting.com/event', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)

// MUI react-select. Need to click the control, then click an option.
// Identify the three select containers by surrounding label text.
async function pickReactSelect(labelText, optionText) {
  console.log(`  picking ${optionText} for ${labelText}`)
  // Locate the label, then the next form-select container after it.
  const ok = await page.evaluate(({ labelText }) => {
    const allLabels = [...document.querySelectorAll('label, p, h3, h4, span, div')]
    const labelNode = allLabels.find(n => n.textContent.trim() === labelText)
    if (!labelNode) return null
    // Walk forward to find the next .form-select__control
    let cur = labelNode
    for (let i = 0; i < 30; i++) {
      cur = cur.nextElementSibling || cur.parentElement?.nextElementSibling || null
      if (!cur) break
      const ctrl = cur.matches?.('.form-select__control') ? cur : cur.querySelector?.('.form-select__control')
      if (ctrl) {
        ctrl.click()
        return true
      }
    }
    // Fallback: just click selects in order.
    return null
  }, { labelText })
  if (!ok) {
    // Try a generic approach: find nth control
    const controls = await page.$$('.form-select__control')
    console.log(`  fallback: found ${controls.length} controls`)
  }
  await page.waitForTimeout(400)
  // Now click the option
  await page.evaluate((optionText) => {
    const opts = [...document.querySelectorAll('.form-select-option, .form-select__option, [role="option"]')]
    const opt = opts.find(o => o.textContent.trim() === optionText)
    if (opt) opt.click()
  }, optionText)
  await page.waitForTimeout(600)
}

// Try driving by control position instead — there are 3 selects: Year, Gender, State
async function pickNthSelect(n, optionText) {
  const controls = await page.$$('.form-select__control')
  if (controls.length <= n) {
    console.log(`  only ${controls.length} controls — cannot pick #${n}`)
    return
  }
  await controls[n].click()
  await page.waitForTimeout(400)
  const clicked = await page.evaluate((optionText) => {
    const opts = [...document.querySelectorAll('.form-select-option, [class*="form-select__option"]')]
    const opt = opts.find(o => o.textContent.trim() === optionText)
    if (opt) { opt.click(); return true }
    return false
  }, optionText)
  console.log(`  picked nth=${n} option=${optionText}: ${clicked}`)
  await page.waitForTimeout(800)
}

// Year is 0, Gender 1, State 2
await pickNthSelect(1, 'Female')
await page.waitForTimeout(800)
await pickNthSelect(2, 'Michigan')
await page.waitForTimeout(2500)

// Now extract table data.
const tableData = await page.evaluate(() => {
  // Look for any rendered table or list under the headers.
  const tables = [...document.querySelectorAll('table')].map(t => ({
    rows: [...t.querySelectorAll('tr')].map(r => [...r.cells].map(c => c.textContent.trim()))
  }))
  const cards = [...document.querySelectorAll('[class*="event"], [class*="card"]')].slice(0, 40).map(d => ({
    className: d.className,
    text: d.textContent.trim().slice(0, 200),
    href: d.querySelector('a')?.getAttribute('href') || null,
  })).filter(d => d.text && (d.text.match(/regional/i) || d.text.match(/tennis/i) || d.text.match(/2026/i)))
  const allLinks = [...document.querySelectorAll('a')].map(a => ({
    href: a.getAttribute('href'),
    text: a.textContent.trim().slice(0, 120),
  })).filter(l => l.href && l.href.includes('/event/'))
  return { tables, cards, allLinks, fullText: document.body.innerText.slice(0, 3000) }
})
console.log('--- TABLE ROWS ---')
for (const t of tableData.tables) {
  for (const r of t.rows.slice(0, 30)) console.log('  ', r.join(' | '))
}
console.log('--- EVENT LINKS ---')
for (const l of tableData.allLinks.slice(0, 50)) console.log(`  ${l.href}  ${l.text}`)
console.log('--- FULL TEXT (head) ---')
console.log(tableData.fullText)

writeFileSync(`${OUT}/events-after-filter.json`, JSON.stringify(tableData, null, 2))
writeFileSync(`${OUT}/api-requests.json`, JSON.stringify(reqs, null, 2))
writeFileSync(`${OUT}/api-responses.json`, JSON.stringify(responses, null, 2))

console.log(`\nAPI requests captured: ${reqs.length}`)
for (const r of reqs) console.log(`  ${r.method} ${r.url}  ${r.postData ? '[body]' : ''}`)

await browser.close()
