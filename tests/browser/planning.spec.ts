import { expect, type Page, test } from '@playwright/test';

// Planning mode and the settings screen, with real keyboard and mouse input.

async function start(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('operation-shadow:settings', JSON.stringify({ quality: 'low' }));
    } catch {
      // storage unavailable
    }
  });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in as Test Operator A' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/play/boot-camp?squad=infiltrator,engineer&seed=7');
  await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 90_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__OS_GAME__!.probe().tick), { timeout: 30_000 }).toBeGreaterThan(10);
}

const probe = (page: Page) => page.evaluate(() => window.__OS_GAME__!.probe());
const pos = async (page: Page, id: string) => (await probe(page)).operatives.find((o) => o.id === id)!;

test.describe('Planning mode and settings', () => {
  test.beforeEach(async ({ page }) => start(page));

  test('orders planned while paused wait for the signal, then both specialists move together', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect(page.getByTestId('planning')).toBeVisible();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('KeyL');
    for (const [key, dx] of [['Digit1', 6], ['Digit2', 5]] as const) {
      await page.keyboard.press(key);
      const id = key === 'Digit1' ? 'op:infiltrator' : 'op:engineer';
      const p = await pos(page, id);
      const screen = (await page.evaluate(([x, z]) => window.__OS_GAME__!.screenOf(x!, z!), [p.x + dx, p.z]))!;
      await page.keyboard.down('Shift');
      await page.mouse.click(screen.x, screen.y, { button: 'right' });
      await page.keyboard.up('Shift');
    }
    await expect(page.getByTestId('plan-op:infiltrator')).toContainText('Wait for signal');
    await expect(page.getByTestId('plan-op:infiltrator')).toContainText(/Move ~\d+ s/);

    // Unpaused, nobody moves until the signal.
    await page.keyboard.press('Space');
    const before = { a: await pos(page, 'op:infiltrator'), b: await pos(page, 'op:engineer') };
    await page.waitForTimeout(1500);
    expect((await pos(page, 'op:infiltrator')).x).toBeCloseTo(before.a.x, 3);
    expect((await pos(page, 'op:engineer')).x).toBeCloseTo(before.b.x, 3);

    await page.keyboard.press('Enter');
    await expect.poll(async () => (await pos(page, 'op:infiltrator')).x - before.a.x, { timeout: 20_000 }).toBeGreaterThan(1);
    expect((await pos(page, 'op:engineer')).x - before.b.x).toBeGreaterThan(0.5);
  });

  test('keys can be remapped, conflicts are refused, and the new key works', async ({ page }) => {
    await page.keyboard.press('Escape');
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings-menu')).toBeVisible();

    // Mapping Pause onto C (Crouch) is a conflict and cannot be applied.
    await page.getByTestId('bind-pause').click();
    await page.keyboard.press('KeyC');
    await expect(page.getByTestId('key-bindings').getByRole('alert')).toContainText('Crouch');
    await expect(page.getByTestId('apply-bindings')).toBeDisabled();

    await page.getByTestId('bind-pause').click();
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('apply-bindings')).toBeEnabled();
    await page.getByTestId('apply-bindings').click();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect.poll(async () => (await probe(page)).paused).toBe(false);

    await page.keyboard.press('KeyP');
    await expect.poll(async () => (await probe(page)).paused).toBe(true);

    // Colour-blind palette and interface size apply immediately.
    await page.keyboard.press('Escape');
    await page.getByTestId('open-settings').click();
    await page.getByLabel('Colours').selectOption('colorblind');
    await page.getByLabel('Interface size').fill('1.25');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim())).toBe('1.25');

    // Restore the defaults for other tests (bindings and settings sync to the account).
    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await page.getByTestId('apply-bindings').click();
    await page.getByLabel('Colours').selectOption('standard');
    await page.getByLabel('Interface size').fill('1');
    await page.waitForTimeout(2000);
  });
});
