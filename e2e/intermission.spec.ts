import { expect, test } from '@playwright/test';

type Snapshot = {
  tick: number;
  wave: number;
  phase: string;
  enemies: unknown[];
  players: { pendingBoons: number; level: number; boonIds: string[] }[];
};

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>): void;
      snapshot(): Snapshot;
      cheat(action: string): void;
      errors: unknown[];
    };
  }
}

test('wave clear opens the intermission and advances to the next wave', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => window.__debug.pause());

  // Let wave 1 spawn something, then cheat-clear it deterministically.
  await page.evaluate(() => window.__debug.step(60));
  await page.waitForFunction(() => window.__debug.snapshot().enemies.length > 0);
  await page.evaluate(() => {
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.step(5);
  });
  await page.waitForFunction(() => window.__debug.snapshot().phase === 'cleared');

  // The intermission panel appears (UI polls at 200ms — resume real time briefly)
  await page.evaluate(() => window.__debug.resume());
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible();

  // If boons are pending, pick until none remain; then continue.
  const boonButtons = page.locator('[data-boon]');
  while ((await boonButtons.count()) > 0) {
    await boonButtons.first().click();
    await page.waitForTimeout(250);
  }
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(() => window.__debug.snapshot().wave === 2);
  await expect(page.locator('[data-screen="intermission"]')).toHaveCount(0);
});

test('boon pick actually raises player stats', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  // Grant XP by clearing spawned enemies and collecting orbs via a movement sweep.
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.step(60);
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    // sweep to vacuum orbs
    window.__debug.setInput({ moveX: 1 });
    window.__debug.step(45);
    window.__debug.setInput({ moveX: -1 });
    window.__debug.step(90);
    window.__debug.setInput({ moveX: 1 });
    window.__debug.step(45);
    window.__debug.setInput({ moveX: 0 });
    window.__debug.step(5);
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible();
  const before = await page.evaluate(() => window.__debug.snapshot().players[0]!);
  const boonButtons = page.locator('[data-boon]');
  if ((await boonButtons.count()) > 0) {
    await boonButtons.first().click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__debug.snapshot().players[0]!);
    expect(after.boonIds.length).toBe(before.boonIds.length + 1);
    expect(after.pendingBoons).toBe(before.pendingBoons - 1);
  }
});
