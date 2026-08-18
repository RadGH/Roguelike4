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

test('clearing the boss wave → victory screen', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('gotoBossWave');
    window.__debug.step(30);
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.step(5);
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="victory"]')).toBeVisible();
  await expect(page.locator('[data-meter-table]')).toBeVisible();
});
