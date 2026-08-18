import { expect, test } from '@playwright/test';

test('glimmer shops: buy a class at Flick, an item at Cinder, an upgrade from the Mayor', async ({
  page,
}) => {
  await page.goto('/');
  // Seed a rich profile in slot 3 (keeps other tests' slots clean)
  await page.evaluate(() => {
    const p = {
      schemaVersion: 1,
      slot: 3,
      unlockedItems: [],
      unlockedClasses: ['hero'],
      unlockedFeats: [],
      deedProgress: {},
      deedsCompleted: [],
      glimmers: 100,
      emberkeys: 0,
      actsCleared: [],
      endlessUnlocked: false,
      townUpgrades: {},
      lifetime: { runs: 0, wins: 0, kills: 0, deepestWave: 0 },
    };
    window.localStorage.setItem('everflame.profile.3', JSON.stringify(p));
  });
  await page.keyboard.press('Space');
  await page.locator('[data-action="play-slot-3"]').click();
  await expect(page.locator('[data-screen="town"]')).toBeVisible();

  // Flick: buy the fighter
  await page.locator('[data-npc="flick"]').click();
  await page.locator('[data-buy-class="fighter"]').click();
  await expect(page.locator('text=trained ✓')).toBeVisible();
  await page.locator('[data-action="back-to-town"]').click();

  // Cinder: buy fireball
  await page.locator('[data-npc="cinder"]').click();
  await page.locator('[data-buy-item="fireball"]').click();
  await expect(page.locator('text=forged ✓').first()).toBeVisible();
  await page.locator('[data-action="back-to-town"]').click();

  // Mayor: buy a Hearty Breakfast level
  await page.locator('[data-npc="mayor"]').click();
  await page.locator('[data-buy-upgrade="startHp"]').click();
  await expect(page.locator('text=(1/10)')).toBeVisible();

  // Everything persisted
  const profile = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('everflame.profile.3')!),
  );
  expect(profile.unlockedClasses).toContain('fighter');
  expect(profile.unlockedItems).toContain('fireball');
  expect(profile.townUpgrades.startHp).toBe(1);
  expect(profile.glimmers).toBe(100 - 15 - 8 - 3);

  // The bought class is pickable at the Bellhop
  await page.locator('[data-action="back-to-town"]').click();
  await page.locator('[data-npc="bellhop"]').click();
  await expect(page.locator('[data-class-pick="0-fighter"]')).toBeVisible();
});
