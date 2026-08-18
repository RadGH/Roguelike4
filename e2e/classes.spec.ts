import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>, playerIndex?: number): void;
      snapshot(): {
        tick: number;
        players: { classId: string; level: number; weapons: { itemId: string }[]; pendingClassItems: string[][] }[];
      };
      cheat(action: string): void;
    };
  }
}

test('debug ?classes= boots the chosen class with its starting kit', async ({ page }) => {
  await page.goto('/?debug=1&classes=mage');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  const p = await page.evaluate(() => window.__debug.snapshot().players[0]!);
  expect(p.classId).toBe('mage');
  expect(p.weapons.map((w) => w.itemId)).toEqual(['wand']);
});

test('mage level 2 offers the signature-spell choice in the intermission', async ({ page }) => {
  await page.goto('/?debug=1&classes=mage');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('grantXp:10'); // level 2 → class choice queued
    window.__debug.cheat('stopSpawns');
    window.__debug.cheat('killAll');
    window.__debug.step(240); // wave-end vacuum gathers leftovers before 'cleared'
    window.__debug.resume();
  });
  await expect(page.locator('[data-screen="intermission"]')).toBeVisible();
  await expect(page.locator('[data-class-item="0-fireball"]')).toBeVisible();
  await page.locator('[data-class-item="0-fireball"]').click();
  await page.waitForTimeout(250);
  const p = await page.evaluate(() => window.__debug.snapshot().players[0]!);
  expect(p.weapons.map((w) => w.itemId)).toContain('fireball');
  expect(p.pendingClassItems.length).toBe(0);
});
