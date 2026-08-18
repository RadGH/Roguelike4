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
  // Objective banner replaces act selection; runs always start at wave 1
  await expect(page.locator('[data-objective]')).toBeVisible();
  await expect(page.locator('[data-objective]')).toContainText('Act 1');
  await expect(page.locator('[data-class-pick="hero"]')).toBeVisible();
  // Ready up → 3-2-1 countdown → arena
  await page.locator('[data-ready="0"]').click();
  await expect(page.locator('[data-countdown]')).toBeVisible();
  await expect(page.locator('[data-screen="arena"] canvas')).toBeVisible({ timeout: 8000 });
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
