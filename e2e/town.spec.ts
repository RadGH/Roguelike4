import { expect, test } from '@playwright/test';

test('full menu flow: title → slots → town → bellhop → arena', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-screen="slots"]')).toBeVisible();
  await page.locator('[data-action="play-slot-1"]').click();
  await expect(page.locator('[data-screen="town"]')).toBeVisible();
  await expect(page.locator('text=Wickburrow')).toBeVisible();
  await page.locator('[data-npc="bellhop"]').click();
  await expect(page.locator('[data-start-act="1"]')).toBeVisible();
  // Acts 2-4 locked on a fresh slot; only Hero on a fresh save
  await expect(page.locator('[data-start-act="2"]')).toBeDisabled();
  await expect(page.locator('[data-class-pick="0-hero"]')).toBeVisible();
  await page.locator('[data-start-act="1"]').click();
  await page.locator('[data-action="set-out"]').click();
  await expect(page.locator('[data-screen="arena"] canvas')).toBeVisible();
});

test('codex shows deeds with hints and locked weapons as mysteries', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Space');
  await page.locator('[data-action="play-slot-1"]').click();
  await page.locator('[data-npc="codex"]').click();
  await expect(page.locator('[data-deed="fire-kill-1"]')).toBeVisible();
  await expect(page.locator('[data-deed="fire-kill-1"]')).toContainText('fire damage');
  await page.locator('[data-codex-tab="weapons"]').click();
  await expect(page.locator('text=???').first()).toBeVisible(); // locked weapons are hidden
  await page.locator('[data-codex-tab="enemies"]').click();
  await expect(page.locator('text=Mopsy, the Enormous Gloomp')).toBeVisible();
});

test('chronicler shows lifetime stats; back navigation works', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Space');
  await page.locator('[data-action="play-slot-1"]').click();
  await page.locator('[data-npc="chronicle"]').click();
  await expect(page.locator('text=Runs set out')).toBeVisible();
  await page.locator('[data-action="back-to-town"]').click();
  await page.locator('[data-action="back-to-slots"]').click();
  await expect(page.locator('[data-screen="slots"]')).toBeVisible();
});
