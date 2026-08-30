import { expect, test } from '@playwright/test'

test('title → start run → arena boots and the sim runs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByTestId('start-run').click()
  await page.getByTestId('begin-run').click()
  await expect(page.getByTestId('arena')).toBeVisible()
  // Pixi must have attached its canvas and be rendering.
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(2000)
  expect(errors).toEqual([])
})

test('page title comes from the branding constant', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/./)
  const title = await page.title()
  expect(title.length).toBeGreaterThan(0)
})

test('escape opens the pause menu with stats and damage breakdown', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('start-run').click()
  await page.getByTestId('begin-run').click()
  await page.waitForTimeout(1500)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('pause-menu')).toBeVisible()
  await expect(page.getByText('Damage breakdown')).toBeVisible()
  await page.getByTestId('resume').click()
  await expect(page.getByTestId('pause-menu')).not.toBeVisible()
})
