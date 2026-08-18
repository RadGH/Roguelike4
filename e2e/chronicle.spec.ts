import { expect, test } from '@playwright/test';

type Snapshot = { tick: number; wave: number; phase: string; enemies: unknown[] };

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      cheat(action: string): void;
      snapshot(): Snapshot;
    };
  }
}

test('first act clear plays the keystone ceremony and lands in the chronicle', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  // Skip to the boss and delete it — a first clear on a fresh debug profile
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('gotoBossWave');
    window.__debug.step(40); // brief — bosses now punish idlers, as requested
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.step(240); // wave-end vacuum gathers leftovers before 'cleared'
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-ceremony]')).toBeVisible();
  await expect(page.locator('[data-ceremony]')).toContainText('EMBERKEY');
});
