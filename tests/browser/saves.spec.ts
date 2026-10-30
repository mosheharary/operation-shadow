import { expect, type Page, test } from '@playwright/test';

// Saved games, campaign progress, synced settings and account endpoints, through the real UI and API.

async function signIn(page: Page, who: 'A' | 'B' = 'A') {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('operation-shadow:settings', JSON.stringify({ quality: 'low' }));
    } catch {
      // storage unavailable
    }
  });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: `Sign in as Test Operator ${who}` }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const probe = (page: Page) => page.evaluate(() => window.__OS_GAME__!.probe());
const moth = async (page: Page) => (await probe(page)).operatives.find((o) => o.id === 'op:infiltrator')!;
const json = (page: Page, method: string, url: string, data?: unknown) =>
  page.request.fetch(url, { method, data, headers: { origin: new URL(page.url()).origin } });

async function play(page: Page, url: string) {
  await page.goto(url);
  await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await probe(page)).tick, { timeout: 30_000 }).toBeGreaterThan(10);
}

test.describe('Saved games and progress', () => {
  test('quicksave, quickload and continuing from Field HQ restore the same moment', async ({ page }) => {
    await signIn(page);
    await play(page, '/play/boot-camp?squad=infiltrator,engineer&seed=7');
    await page.keyboard.press('Digit1');
    const start = await moth(page);
    const target = (await page.evaluate(() => window.__OS_GAME__!.screenOf(16, 31)))!;
    await page.mouse.click(target.x, target.y, { button: 'right' });
    await expect.poll(async () => Math.hypot((await moth(page)).x - start.x, (await moth(page)).z - start.z), { timeout: 20_000 }).toBeGreaterThan(2);

    await page.keyboard.press('Space'); // pause, so the saved moment is exact
    const saved = await moth(page);
    const savedTick = (await probe(page)).tick;
    await page.keyboard.press('F5');
    await expect(page.getByText('Quicksaved')).toBeVisible();

    await page.keyboard.press('Space');
    await expect.poll(async () => (await probe(page)).tick, { timeout: 20_000 }).toBeGreaterThan(savedTick + 40);
    await page.keyboard.press('F9');
    await expect(page.getByText('Game loaded')).toBeVisible();
    const loaded = await probe(page);
    expect(loaded.tick).toBeLessThan(savedTick + 20);
    const back = loaded.operatives.find((o) => o.id === 'op:infiltrator')!;
    expect(Math.hypot(back.x - saved.x, back.z - saved.z)).toBeLessThan(1.5);

    // Manual slot through the pause menu.
    await page.keyboard.press('Escape');
    await page.getByTestId('open-saves').click();
    await page.getByTestId('save-manual-1').getByRole('button', { name: 'Save here' }).click();
    await expect(page.getByTestId('save-manual-1')).toContainText('Boot Camp');

    await page.goto('/dashboard');
    await expect(page.getByTestId('continue')).toBeVisible();
    await page.getByTestId('continue-quick').click();
    await expect(page).toHaveURL(/\/play\/boot-camp\?save=quick$/);
    await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 90_000 }).toBe(true);
    expect((await probe(page)).tick).toBeGreaterThanOrEqual(savedTick);
    expect((await probe(page)).tick).toBeLessThan(savedTick + 200);
  });

  test('saved slots can be deleted from the pause menu and from Field HQ, after confirming', async ({ page }) => {
    await signIn(page, 'B');
    await play(page, '/play/boot-camp?squad=infiltrator,engineer&seed=7');
    await page.keyboard.press('Escape');
    await page.getByTestId('open-saves').click();
    const slot = page.getByTestId('save-manual-3');
    await slot.getByRole('button', { name: 'Save here' }).click();
    await expect(slot).toContainText('Boot Camp');

    // The first click only asks; Keep leaves the save alone.
    await page.getByTestId('delete-manual-3').click();
    await slot.getByRole('button', { name: 'Keep' }).click();
    await expect(slot).toContainText('Boot Camp');
    await page.getByTestId('delete-manual-3').click();
    await page.getByTestId('delete-confirm-manual-3').click();
    await expect(slot).toContainText('Empty');
    expect((await page.request.get('/api/v1/saves/manual-3')).status()).toBe(404);

    await slot.getByRole('button', { name: 'Save here' }).click();
    await expect(slot).toContainText('Boot Camp');
    await page.goto('/dashboard');
    await expect(page.getByTestId('continue-manual-3')).toBeVisible();
    await page.getByTestId('delete-save-manual-3').click();
    await page.getByTestId('delete-save-manual-3-confirm').click();
    await expect(page.getByTestId('continue-manual-3')).toHaveCount(0);
    expect((await page.request.get('/api/v1/saves/manual-3')).status()).toBe(404);
  });

  test('saves are private, validated and same-origin only', async ({ page, browser }) => {
    await signIn(page, 'B');
    expect((await page.request.get('/api/v1/saves/quick')).status()).toBe(404);
    expect((await page.request.get('/api/v1/saves/../../account')).status()).toBe(404);
    const junk = await page.request.put('/api/v1/saves/manual-2', { data: Buffer.from('not gzip'), headers: { origin: new URL(page.url()).origin, 'content-type': 'application/gzip' } });
    expect(junk.status()).toBe(400);
    const cross = await page.request.put('/api/v1/saves/manual-2', { data: Buffer.from(''), headers: { origin: 'https://evil.example' } });
    expect(cross.status()).toBe(403);
    // B's list never contains A's saves.
    const list = (await (await page.request.get('/api/v1/saves')).json()).saves as { slot: string }[];
    expect(list.every((s) => s.slot !== 'quick')).toBe(true);
    const anon = await (await browser.newContext()).newPage();
    await anon.goto('/sign-in');
    expect((await anon.request.get('/api/v1/saves')).status()).toBe(401);
  });

  test('a fresh campaign points first-timers at Boot Camp and records a completed mission', async ({ page }) => {
    await signIn(page);
    expect((await json(page, 'POST', '/api/v1/campaigns', { difficulty: 'standard' })).status()).toBe(201);
    await page.goto('/dashboard');
    await expect(page.getByTestId('mission-boot-camp')).toContainText('Start here');
    // The theatre map opens on the next target with its briefing one click away.
    await expect(page.getByTestId('theatre-pin-boot-camp')).toHaveAttribute('data-state', 'next');
    await expect(page.getByTestId('theatre-briefing')).toHaveAttribute('href', '/missions/boot-camp');

    const run = await json(page, 'POST', '/api/v1/mission-runs', { missionKey: 'boot-camp', squad: ['infiltrator', 'engineer'], difficulty: 'standard', seed: 7 });
    expect(run.status()).toBe(201);
    const { id } = (await run.json()).run;
    const done = await json(page, 'POST', `/api/v1/mission-runs/${id}/complete`, { outcome: 'success', score: 1800, rank: 'A', medals: ['ghost'], durationSeconds: 140, stats: { detections: 0 } });
    expect(done.status()).toBe(200);
    expect((await json(page, 'POST', `/api/v1/mission-runs/${id}/complete`, { outcome: 'failure', score: null, rank: null, medals: [], durationSeconds: 1, stats: {} })).status()).toBe(404);

    await page.goto('/dashboard');
    await expect(page.getByTestId('done-boot-camp')).toContainText('Rank A');
    await expect(page.getByTestId('mission-boot-camp')).not.toContainText('Start here');
    await expect(page.getByTestId('theatre-pin-boot-camp')).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('theatre-pin-silent-tide')).toHaveAttribute('data-state', 'next');
    await expect(page.getByTestId('theatre-card')).toContainText('Operation Silent Tide');
  });

  test('settings sync to the account, and account deletion needs explicit confirmation', async ({ page }) => {
    await signIn(page);
    const settings = { masterVolume: 0.4, subtitles: false, updatedAt: Date.now() };
    expect((await json(page, 'PUT', '/api/v1/preferences', { schemaVersion: 1, settings })).status()).toBe(200);
    expect((await (await page.request.get('/api/v1/preferences')).json()).preferences.settings).toMatchObject({ masterVolume: 0.4, subtitles: false });
    expect((await json(page, 'PUT', '/api/v1/preferences', { schemaVersion: 1, settings: { x: 'y'.repeat(17_000) } })).status()).toBe(400);
    expect((await json(page, 'PUT', '/api/v1/preferences', { schemaVersion: 1, settings: { x: 'y'.repeat(40_000) } })).status()).toBe(413);

    // The pause menu shows the synced values in a new browser context.
    await play(page, '/play/boot-camp?squad=infiltrator,engineer&seed=7');
    await page.keyboard.press('Escape');
    await page.getByTestId('open-settings').click();
    await expect(page.getByLabel('Subtitles', { exact: true })).not.toBeChecked();

    expect((await json(page, 'POST', '/api/v1/account/delete', {})).status()).toBe(400);
    expect((await json(page, 'POST', '/api/v1/account/delete', { confirm: 'delete' })).status()).toBe(400);
    await page.goto('/account');
    await expect(page.getByTestId('confirm-delete')).toBeDisabled();
    // Restore defaults for other tests.
    await json(page, 'PUT', '/api/v1/preferences', { schemaVersion: 1, settings: { masterVolume: 0.8, subtitles: true, updatedAt: Date.now() } });
  });
});
