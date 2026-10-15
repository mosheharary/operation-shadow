import { expect, test } from '@playwright/test';

test.describe('foundation', () => {
  test('health and readiness endpoints report a working stack', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBe(true);
    expect(await health.json()).toMatchObject({ status: 'ok', service: 'operation-shadow' });

    const ready = await request.get('/api/ready');
    expect(ready.status()).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready', checks: { database: 'ok', migrations: 'ok' } });
  });

  test('protected pages redirect signed-out visitors to sign-in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { name: 'Operation Shadow' })).toBeVisible();
  });

  test('dev operator signs in, renders the 3D test range, and signs out', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in as Test Operator A' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Test Operator A')).toBeVisible();
    await expect(page.getByLabel('System status')).toContainText('Database');

    await page.getByRole('link', { name: /Test range/ }).click();
    await expect(page).toHaveURL(/\/test-range$/);
    await expect(page.locator('canvas')).toBeVisible();

    // A canvas element alone proves nothing: wait until the renderer has produced real frames with draw calls.
    await expect
      .poll(async () => page.evaluate(() => window.__OS_RENDER__ ?? null), { timeout: 60_000 })
      .toMatchObject({ frames: expect.any(Number) });
    await expect.poll(async () => (await page.evaluate(() => window.__OS_RENDER__?.frames ?? 0)) > 20, { timeout: 60_000 }).toBe(true);
    const sample = await page.evaluate(() => window.__OS_RENDER__!);
    expect(sample.drawCalls).toBeGreaterThan(0);
    expect(sample.triangles).toBeGreaterThan(1000);

    await page.getByRole('link', { name: 'Back to Field HQ' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('the second operator gets their own session', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in as Test Operator B' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Test Operator B')).toBeVisible();
    await expect(page.getByText('Test Operator A')).toHaveCount(0);
  });
});
