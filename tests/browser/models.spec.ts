import { expect, type Page, test } from '@playwright/test';

// Authored glTF models are only loaded with the "detailed models" setting (High preset); every
// other spec runs the procedural Performance path. These check that the models load under the
// real content security policy, and that a failed download falls back to procedural models.

const CHARACTER_MODELS = ['char.body-male', 'char.body-female', 'char.animations'];

async function signIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('operation-shadow:settings', JSON.stringify({ quality: 'custom', shadows: false, postEffects: false, resolutionScale: 1, models: true, environment: 'basic' }));
  });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in as Test Operator A' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const assets = (page: Page) => page.evaluate(() => window.__OS_ASSETS__?.() ?? { loaded: [], failed: {} });

test.describe('authored models', () => {
  test('characters load under the content security policy', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy|Couldn't load texture/i.test(msg.text())) violations.push(msg.text());
    });
    await signIn(page);
    await page.goto('/test-range/characters');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(async () => (await assets(page)).loaded, { timeout: 90_000 }).toEqual(expect.arrayContaining(CHARACTER_MODELS));
    expect((await assets(page)).failed).toEqual({});
    expect(violations).toEqual([]);
  });

  test('a mission plays with authored characters: they load, and picking still selects them', async ({ page }) => {
    await signIn(page);
    await page.goto('/play/silent-tide?squad=engineer,infiltrator,recon,marine&seed=42');
    await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 60_000 }).toBe(true);
    const probe = () => page.evaluate(() => window.__OS_GAME__!.probe());
    // Every squad member, guard and prisoner switches to the skinned rig once the library loads.
    await expect.poll(async () => (await probe()).rigs.authored, { timeout: 90_000 }).toBeGreaterThanOrEqual(4);
    expect((await probe()).rigs.procedural).toBe(0);
    // Picking goes through the hitboxes, not the skinned meshes: clicking an operative selects it.
    const at = (await page.evaluate(() => window.__OS_GAME__!.entityScreen('op:recon')))!;
    await page.mouse.click(at.x, at.y);
    await expect.poll(async () => (await probe()).selected).toEqual(['op:recon']);
    expect((await page.evaluate(() => window.__OS_ASSETS__?.() ?? { failed: {} })).failed).toEqual({});
  });

  test('a failed model download falls back to the procedural figures', async ({ page }) => {
    await page.route('**/media/models/**', (route) => route.fulfill({ status: 404, body: '' }));
    await signIn(page);
    await page.goto('/test-range/characters');
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(async () => Object.keys((await assets(page)).failed), { timeout: 60_000 }).toContain('characters');
    expect((await assets(page)).loaded).toEqual([]);
    await expect(page.getByTestId('rig-mode-authored')).toBeVisible();
  });
});
