import { expect, type Page, test } from '@playwright/test';

// The on-screen control bar: pause, camera turning, tooltips and leaving without saving.

async function startMission(page: Page) {
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
  await page.goto('/play/silent-tide?squad=engineer,infiltrator,recon,marine&seed=42');
  await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__OS_GAME__!.probe().tick), { timeout: 30_000 }).toBeGreaterThan(10);
}

const probe = (page: Page) => page.evaluate(() => window.__OS_GAME__!.probe());

test.describe('Control bar', () => {
  test('pauses and resumes, explains itself on hover, and turns the camera', async ({ page }) => {
    await startMission(page);
    const pause = page.getByTestId('control-pause');
    await pause.click();
    await expect(page.getByTestId('paused')).toBeVisible();
    expect((await probe(page)).paused).toBe(true);
    const tick = (await probe(page)).tick;
    await page.waitForTimeout(500);
    expect((await probe(page)).tick).toBe(tick);

    // Clicking hides the tooltip; move away and back to show it again.
    await page.mouse.move(5, 300);
    await pause.hover();
    await expect(page.getByTestId('tooltip')).toContainText('Resume');

    // Turning the camera moves where a fixed world point lands on screen.
    const before = await page.evaluate(() => window.__OS_GAME__!.screenOf(80, 60));
    await page.getByRole('button', { name: 'Turn camera right' }).click();
    await page.getByRole('button', { name: 'Turn camera right' }).click();
    await expect.poll(async () => JSON.stringify(await page.evaluate(() => window.__OS_GAME__!.screenOf(80, 60))), { timeout: 5_000 }).not.toBe(JSON.stringify(before));

    await pause.click();
    await expect(page.getByTestId('paused')).toHaveCount(0);
    await expect.poll(async () => (await probe(page)).tick, { timeout: 10_000 }).toBeGreaterThan(tick);
  });

  test('exit asks first, then leaves for Field HQ without saving', async ({ page }) => {
    await startMission(page);
    await page.getByTestId('control-exit').click();
    await expect(page.getByTestId('exit-confirm')).toBeVisible();
    await page.getByTestId('exit-cancel').click();
    await expect(page.getByTestId('exit-confirm')).toHaveCount(0);
    expect((await probe(page)).status).toBe('running');

    await page.getByTestId('control-exit').click();
    await page.getByTestId('exit-confirm-button').click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
