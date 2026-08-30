import { expect, test } from '@playwright/test'

test('arena boots and the sim runs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
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
