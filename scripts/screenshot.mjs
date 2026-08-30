// Dev tool: capture an arena screenshot for readability review.
// Usage: node scripts/screenshot.mjs [outPath] [waitMs]
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'screenshot.png'
const wait = Number(process.argv[3] ?? 9000)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:5173/')
await page.getByTestId('start-run').click()
await page.getByTestId('begin-run').click()
await page.waitForTimeout(wait)
await page.screenshot({ path: out })
await browser.close()
console.log(`saved ${out}`)
