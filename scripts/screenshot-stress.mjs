// Readability review: capture the horde stress condition (late wave, crowd).
import { chromium } from '@playwright/test'
const out = process.argv[2] ?? 'stress.png'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:5173/?wave=9&seed=42')
await page.getByTestId('start-run').click()
await page.getByTestId('begin-run').click()
const dirs = [['w'], ['w','d'], ['d'], ['s','d'], ['s'], ['s','a'], ['a'], ['w','a']]
for (let i = 0; i < 40; i++) {
  const keys = dirs[i % dirs.length]
  for (const k of keys) await page.keyboard.down(k)
  await page.waitForTimeout(400)
  for (const k of keys) await page.keyboard.up(k)
}
await page.screenshot({ path: out })
await browser.close()
console.log(`saved ${out}`)
