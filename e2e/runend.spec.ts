import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>): void;
      snapshot(): { tick: number; wave: number; phase: string; enemies: unknown[] };
      cheat(action: string): void;
      errors: unknown[];
    };
  }
}

test('party snuffed → game-over screen with meters → back to title', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  // Deal some damage first so the meter table has rows
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.step(90);
    window.__debug.cheat('snuffParty');
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="game-over"]')).toBeVisible();
  await expect(page.locator('[data-meter-table]')).toBeVisible();
  await page.locator('[data-action="exit-to-title"]').click();
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
});

test('clearing the act 1 boss → keystone ceremony, and the run presses on', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('gotoBossWave');
    window.__debug.step(30);
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.step(240); // wave-end vacuum gathers leftovers before 'cleared'
    window.__debug.resume();
  });
  // Acts flow onward now: the boss clear opens the intermission with the ceremony
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-ceremony]')).toBeVisible();
  // resolve every pick (chests/feats/boons) then press onward — same run, next act
  for (let i = 0; i < 20; i++) {
    const salvage = page.locator('[data-action="salvage-0"]');
    const feat = page.locator('[data-feat]');
    const boon = page.locator('[data-boon]');
    if ((await salvage.count()) > 0) await salvage.click();
    else if ((await feat.count()) > 0) await feat.first().click();
    else if ((await boon.count()) > 0) await boon.first().click();
    else break;
    await page.waitForTimeout(250);
  }
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(() => window.__debug.snapshot().wave === 11);
});
