import { expect, test } from '@playwright/test';

type Snapshot = {
  tick: number;
  players: { x: number; y: number; alive: boolean }[];
};

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>, playerIndex?: number): void;
      snapshot(): Snapshot;
      cheat(action: string): void;
    };
  }
}

test('two players render two HUD clusters and move independently', async ({ page }) => {
  await page.goto('/?debug=1&players=2');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await expect(page.locator('[data-player-hud="0"]')).toBeVisible();
  await expect(page.locator('[data-player-hud="1"]')).toBeVisible();

  await page.evaluate(() => window.__debug.pause());
  const before = await page.evaluate(() => window.__debug.snapshot().players);
  await page.evaluate(() => {
    window.__debug.setInput({ moveX: 1 }, 0); // P1 goes right
    window.__debug.setInput({ moveY: 1 }, 1); // P2 goes down
    window.__debug.step(30);
  });
  const after = await page.evaluate(() => window.__debug.snapshot().players);
  expect(after[0]!.x).toBeGreaterThan(before[0]!.x);
  expect(Math.abs(after[0]!.y - before[0]!.y)).toBeLessThan(0.2);
  expect(after[1]!.y).toBeGreaterThan(before[1]!.y);
});

test('intermission shows one panel per player', async ({ page }) => {
  await page.goto('/?debug=1&players=2');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.step(60);
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.step(5);
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible();
  await expect(page.locator('[data-player-panel="0"]')).toBeVisible();
  await expect(page.locator('[data-player-panel="1"]')).toBeVisible();
});

test('revive: P2 channels P1 back to life', async ({ page }) => {
  await page.goto('/?debug=1&players=2');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.cheat('snuff:0');
    // Walk P2 onto P1's wisp (they spawn ~2 units apart), then hold interact
    window.__debug.setInput({ moveX: -1 }, 1);
    window.__debug.step(8);
    window.__debug.setInput({ moveX: 0, interact: true }, 1);
    window.__debug.step(30 * 4);
  });
  const players = await page.evaluate(() => window.__debug.snapshot().players);
  expect(players[0]!.alive).toBe(true);
});
