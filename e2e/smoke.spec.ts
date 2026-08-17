import { expect, test } from '@playwright/test';

type Snapshot = { tick: number; players: { x: number; y: number }[] };

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>): void;
      snapshot(): Snapshot;
      screen(): string;
      errors: unknown[];
    };
  }
}

test('title screen renders with branding', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="title"] h1')).toBeVisible();
  await expect(page.locator('[data-screen="title"] h1')).not.toHaveText('');
});

test('debug mode boots straight into the arena with a canvas', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.locator('[data-screen="arena"] canvas')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.isDebug === true);
});

test('deterministic stepping: input moves the player, dash moves them faster', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.isDebug === true);
  // Let the engine finish mounting, then take control of time.
  await page.waitForFunction(() => window.__debug.snapshot().tick > 0);
  await page.evaluate(() => window.__debug.pause());

  const before = await page.evaluate(() => window.__debug.snapshot());
  await page.evaluate(() => {
    window.__debug.setInput({ moveX: 1 });
    window.__debug.step(30); // one second of simulation
  });
  const afterRun = await page.evaluate(() => window.__debug.snapshot());
  const ranDistance = afterRun.players[0]!.x - before.players[0]!.x;
  expect(ranDistance).toBeGreaterThan(6); // ≈6.8 units/s

  await page.evaluate(() => {
    window.__debug.setInput({ moveX: 1, dash: true });
    window.__debug.step(1);
    window.__debug.setInput({ moveX: 1, dash: false });
    window.__debug.step(5);
  });
  const afterDash = await page.evaluate(() => window.__debug.snapshot());
  const dashDistance = afterDash.players[0]!.x - afterRun.players[0]!.x;
  // 6 ticks (0.2s): dashing covers ≈3.4 units vs ≈1.36 running
  expect(dashDistance).toBeGreaterThan(2.5);
});

test('no page errors during boot and play', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  const harnessErrors = await page.evaluate(() => window.__debug.errors.length);
  expect(pageErrors).toEqual([]);
  expect(harnessErrors).toBe(0);
});
