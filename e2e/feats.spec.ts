import { expect, test } from '@playwright/test';

type Snapshot = {
  tick: number;
  wave: number;
  phase: string;
  enemies: unknown[];
  players: { level: number; pendingFeats: number; feats: string[] }[];
};

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

test('reaching level 3 offers a 1-of-4 feat pick in the intermission', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.step(160);
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('grantXp:30'); // level 3 → one feat owed
    window.__debug.cheat('killAll');
    window.__debug.step(5);
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible();
  expect(await page.evaluate(() => window.__debug.snapshot().players[0]!.pendingFeats)).toBe(1);

  // The feat panel comes after chests; resolve any chest first
  for (const sel of ['[data-chest-weapon]', '[data-action="salvage-0"]']) {
    void sel; // chests may or may not appear on wave 1 — salvage if present
  }
  const salvage = page.locator('[data-action="salvage-0"]');
  while ((await salvage.count()) > 0) {
    await salvage.click();
    await page.waitForTimeout(250);
  }

  const featButtons = page.locator('[data-feat]');
  await expect(featButtons.first()).toBeVisible();
  expect(await featButtons.count()).toBeGreaterThanOrEqual(2);
  await featButtons.first().click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => window.__debug.snapshot().players[0]!);
  expect(after.pendingFeats).toBe(0);
  expect(after.feats.length).toBe(1);
  await expect(page.locator('[data-feat]')).toHaveCount(0);
});
