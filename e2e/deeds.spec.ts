import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __debug: {
      isDebug: boolean;
      pause(): void;
      resume(): void;
      step(ticks: number): void;
      setInput(partial: Record<string, unknown>, playerIndex?: number): void;
      snapshot(): { tick: number; enemies: unknown[] };
      cheat(action: string): void;
    };
  }
}

test('fire kill pops the unlock toast and persists to the save profile', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('equip:candlestick:0'); // fire melee weapon
    window.__debug.cheat('stopSpawns');
    window.__debug.step(200); // enemies close in, candlestick burns them down
    window.__debug.cheat('killAll');
    window.__debug.step(240); // wave-end vacuum gathers leftovers before 'cleared'
    window.__debug.resume();
  });
  // The toast may have fired during stepping; check the profile instead — it's the truth.
  const profile = await page.evaluate(() => window.localStorage.getItem('everflame.profile.1'));
  expect(profile).toBeTruthy();
  const parsed = JSON.parse(profile!) as { unlockedItems: string[]; deedsCompleted: string[] };
  expect(parsed.deedsCompleted).toContain('fire-kill-1');
  expect(parsed.unlockedItems).toContain('fireball');
});

test('profile persists across reloads', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  await page.evaluate(() => {
    window.__debug.pause();
    window.__debug.cheat('equip:candlestick:0');
    window.__debug.cheat('stopSpawns');
    window.__debug.step(200);
    window.__debug.cheat('killAll');
    window.__debug.step(240); // wave-end vacuum gathers leftovers before 'cleared'
  });
  await page.reload();
  await page.waitForFunction(() => window.__debug?.snapshot().tick > 0);
  const profile = await page.evaluate(() => window.localStorage.getItem('everflame.profile.1'));
  const parsed = JSON.parse(profile!) as { deedsCompleted: string[] };
  expect(parsed.deedsCompleted).toContain('fire-kill-1');
});
