// Readability review: four-player framing + quarter-screen intermission panels.
import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://127.0.0.1:5173/')
await page.getByRole('button', { name: '4 players' }).click()
await page.getByTestId('start-run').click()
await page.getByTestId('begin-run').click()
await page.waitForTimeout(6000)
await page.screenshot({ path: process.argv[2] ?? '4p-arena.png' })
// Also capture a 4-panel intermission mock: pause menu shows 4 tabs at least.
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.screenshot({ path: process.argv[3] ?? '4p-pause.png' })
await browser.close()
console.log('saved')
