import { expect, type Page, test } from '@playwright/test';

// The Boot Camp tutorial and the rest of the campaign, driven with real input.

async function signIn(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('operation-shadow:settings', JSON.stringify({ quality: 'low' }));
    } catch {
      // storage unavailable: the game falls back to defaults
    }
  });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in as Test Operator A' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function play(page: Page, mission: string, squad: string) {
  await page.goto(`/play/${mission}?squad=${squad}&seed=7`);
  await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 90_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__OS_GAME__!.probe().tick), { timeout: 30_000 }).toBeGreaterThan(10);
}

const step = (page: Page) => page.getByTestId('tutorial');

test.describe('Campaign', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('the tutorial teaches selection, movement, camera and squad orders step by step', async ({ page }) => {
    await play(page, 'boot-camp', 'infiltrator,engineer');
    await expect(step(page)).toHaveAttribute('data-step', 'welcome');
    await page.getByTestId('tutorial-continue').click();
    await expect(step(page)).toHaveAttribute('data-step', 'select');

    await page.keyboard.press('Digit1');
    await expect(step(page)).toHaveAttribute('data-step', 'move');

    const ring = (await page.evaluate(() => window.__OS_GAME__!.screenOf(16, 31)))!;
    await page.mouse.click(ring.x, ring.y, { button: 'right' });
    await expect(step(page)).toHaveAttribute('data-step', 'camera', { timeout: 30_000 });

    await page.keyboard.down('KeyW');
    await page.waitForTimeout(200);
    await page.keyboard.up('KeyW');
    await page.mouse.move(800, 450);
    await page.mouse.wheel(0, 200);
    await expect(step(page)).toHaveAttribute('data-step', 'group');

    await page.keyboard.press('Control+KeyA');
    await expect(step(page)).toHaveAttribute('data-step', 'cones');
    await page.keyboard.press('Alt');
    await expect(step(page)).toHaveAttribute('data-step', 'crouch');
    await expect(step(page)).toContainText('crouch');
  });

  for (const [mission, squad] of [
    ['white-silence', 'engineer,infiltrator,recon'],
    ['iron-junction', 'engineer,deception,medic'],
    ['frozen-ledger', 'engineer,medic,recon,infiltrator'],
    ['last-light', 'engineer,marine,infiltrator'],
  ] as const) {
    test(`${mission} loads and runs without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.getByTestId(`mission-${mission}`).click();
      await expect(page).toHaveURL(new RegExp(`/missions/${mission}$`));
      await play(page, mission, squad);
      await expect(page.getByTestId('game-root')).toBeVisible();
      await expect(step(page)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});
