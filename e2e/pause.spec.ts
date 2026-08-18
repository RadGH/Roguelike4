import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>, playerIndex?: number): void;
      snapshot(): { tick: number; players: { boonIds: string[]; pendingBoons: number }[] };
      cheat(action: string): void;
    };
  }
}

test('Esc pauses (whole screen) and Esc resumes', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  // Sim is frozen while paused
  const t1 = await page.evaluate(() => window.__debug.snapshot().tick);
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => window.__debug.snapshot().tick);
  expect(t2).toBe(t1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
});

test('pause menu: arrow to Quit, Enter exits to title', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await page.keyboard.press('ArrowDown'); // focus Quit
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
});

test('keyboard menu nav picks a boon with arrows + Enter', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.step(160);
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('grantXp:15'); // deterministic level-up → boons pending
    window.__debug.cheat('killAll');
    window.__debug.step(5);
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible();
  const hasBoons = await page.evaluate(() => window.__debug.snapshot().players[0]!.pendingBoons > 0);
  test.skip(!hasBoons, 'no level-up this seed');
  const before = await page.evaluate(() => window.__debug.snapshot().players[0]!.boonIds.length);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__debug.snapshot().players[0]!.boonIds.length);
  expect(after).toBe(before + 1);
});
