import { expect, type Page, test } from '@playwright/test';

// Browser tests for the "Silent Tide" vertical slice. They drive the game with real mouse and
// keyboard input and read state through the read-only window.__OS_GAME__ probe.

const SQUAD = 'engineer,infiltrator,recon,marine';

async function signIn(page: Page) {
  // SwiftShader renders in software: the Performance preset (no post-processing) keeps the clock moving.
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

async function startMission(page: Page, seed = 42) {
  await page.goto(`/play/silent-tide?squad=${SQUAD}&seed=${seed}`);
  await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__)), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__OS_GAME__!.probe().tick), { timeout: 30_000 }).toBeGreaterThan(10);
}

const probe = (page: Page) => page.evaluate(() => window.__OS_GAME__!.probe());
const screenOf = (page: Page, x: number, z: number) => page.evaluate(([px, pz]) => window.__OS_GAME__!.screenOf(px!, pz!), [x, z]);
const entityScreen = (page: Page, id: string) => page.evaluate((entity) => window.__OS_GAME__!.entityScreen(entity), id);

test.describe('Silent Tide', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('briefing explains the mission and enforces the squad rules', async ({ page }) => {
    await page.getByTestId('mission-silent-tide').click();
    await expect(page).toHaveURL(/\/missions\/silent-tide$/);
    await expect(page.getByRole('heading', { name: 'Operation Silent Tide' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rules of engagement' })).toBeVisible();

    // The Combat Engineer is required and locked in.
    await expect(page.getByTestId('pick-engineer')).toBeChecked();
    await expect(page.getByTestId('pick-engineer')).toBeDisabled();

    // Too few specialists is refused with a reason.
    await page.getByTestId('pick-recon').uncheck();
    await page.getByTestId('pick-marine').uncheck();
    await page.getByTestId('deploy').click();
    await expect(page.getByRole('alert').filter({ hasText: 'Choose 3 to 4 specialists' })).toBeVisible();

    await page.getByTestId('pick-medic').check();
    await page.getByTestId('deploy').click();
    await expect(page).toHaveURL(/\/play\/silent-tide\?squad=/);
    await expect(page.getByTestId('game-root')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('portrait-medic')).toBeVisible();
  });

  test('a fresh mission opens on the insertion reel with the clock held, and a key skips it', async ({ page }) => {
    await page.goto(`/play/silent-tide?squad=${SQUAD}&seed=42`);
    const reel = page.getByTestId('cinematic');
    await expect(reel).toBeVisible({ timeout: 60_000 });
    await expect(reel).toHaveAttribute('data-kind', 'intro');
    // Software rendering is slow enough that the reel may already be past the codename shot.
    await expect(reel).toContainText('Any key or click to skip');
    // The reel overlay can mount a moment before the debug probe is published.
    await expect.poll(() => page.evaluate(() => Boolean(window.__OS_GAME__))).toBe(true);
    expect((await probe(page)).tick).toBe(0);
    await page.keyboard.press('Space');
    await expect(reel).toBeHidden();
    // The skipping key never reaches the game: Space did not pause it.
    await expect.poll(async () => (await probe(page)).tick).toBeGreaterThan(10);
    expect((await probe(page)).paused).toBe(false);
  });

  test('the field recorder winds the world back, returns to the present, and resumes in tactical pause', async ({ page }) => {
    await startMission(page);
    await page.keyboard.press('Digit2');
    const start = (await probe(page)).operatives.find((o) => o.id === 'op:infiltrator')!;
    const target = (await screenOf(page, start.x + 7, start.z + 4))!;
    await page.mouse.click(target.x, target.y, { button: 'right' });
    const moth = async () => (await probe(page)).operatives.find((o) => o.id === 'op:infiltrator')!;
    await expect.poll(async () => Math.hypot((await moth()).x - start.x, (await moth()).z - start.z), { timeout: 30_000 }).toBeGreaterThan(2);
    const now = (await probe(page)).tick;

    // Backspace opens the recorder a few seconds back, with the clock held.
    await page.keyboard.press('Backspace');
    const recall = page.getByTestId('recall');
    await expect(recall).toBeVisible();
    await expect(recall).toContainText('Field recorder');
    const held = (await probe(page)).tick;
    expect(held).toBeLessThan(now);
    await page.waitForTimeout(400);
    expect((await probe(page)).tick).toBe(held);

    // Home winds to the first frame: the mission's opening, with MOTH back on the beach.
    await page.keyboard.press('Home');
    await expect.poll(async () => (await probe(page)).tick).toBe(0);
    expect(Math.hypot((await moth()).x - start.x, (await moth()).z - start.z)).toBeLessThan(0.5);

    // Esc puts the present back exactly as it was (the Escape never opens the pause menu).
    await page.keyboard.press('Escape');
    await expect(recall).toBeHidden();
    await expect(page.getByTestId('pause-menu')).toBeHidden();
    expect((await probe(page)).tick).toBeGreaterThanOrEqual(now);

    // Resuming from a frame plays on from there, in tactical pause so new orders come first.
    await page.getByTestId('control-recall').click();
    await expect(recall).toBeVisible();
    await page.keyboard.press('Home');
    await expect.poll(async () => (await probe(page)).tick).toBe(0);
    await page.getByTestId('recall-resume').click();
    await expect(recall).toBeHidden();
    await expect(page.getByTestId('toasts')).toContainText('Wound back');
    const resumed = await probe(page);
    expect(resumed.paused).toBe(true);
    expect(resumed.tick).toBe(0);
  });

  test('an invalid squad in the URL returns to the briefing with the reason', async ({ page }) => {
    await page.goto('/play/silent-tide?squad=recon,marine,medic');
    await expect(page).toHaveURL(/\/missions\/silent-tide\?error=/);
    await expect(page.getByRole('alert').filter({ hasText: 'requires the Combat Engineer' })).toBeVisible();
  });

  test('selection, orders, tactical pause and menus work with mouse and keyboard', async ({ page }) => {
    await startMission(page);
    expect((await probe(page)).selected).toEqual(['op:engineer']);

    await page.keyboard.press('Digit2');
    expect((await probe(page)).selected).toEqual(['op:infiltrator']);

    // Right-click on open ground moves the selected operative.
    const before = (await probe(page)).operatives.find((o) => o.id === 'op:infiltrator')!;
    const target = (await screenOf(page, before.x + 7, before.z + 4))!;
    await page.mouse.click(target.x, target.y, { button: 'right' });
    await expect
      .poll(async () => {
        const moth = (await probe(page)).operatives.find((o) => o.id === 'op:infiltrator')!;
        return Math.hypot(moth.x - before.x, moth.z - before.z);
      })
      .toBeGreaterThan(0.5);

    // Space is a tactical pause: the clock stops, and resumes on the second press.
    await page.keyboard.press('Space');
    await expect(page.getByTestId('paused')).toBeVisible();
    const frozen = (await probe(page)).tick;
    // Foresight: the paused world runs ahead on a copy and says what the next seconds hold.
    await expect(page.getByTestId('foresight-verdict')).toHaveText(/^Next 10 s: nobody sees the squad$| in \d+\.\d s$/);
    await expect(page.getByTestId('foresight-tint')).toBeVisible();
    await page.waitForTimeout(500);
    expect((await probe(page)).tick).toBe(frozen);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await probe(page)).tick).toBeGreaterThan(frozen);
    await expect(page.getByTestId('foresight')).toHaveCount(0);

    // Escape opens the pause menu (which pauses), F1 the controls.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    expect((await probe(page)).paused).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeHidden();
    await page.keyboard.press('F1');
    await expect(page.getByTestId('help')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help')).toBeHidden();
    expect((await probe(page)).paused).toBe(false);
  });

  test('drag box selects the squad and a thrown stone uses one from the pouch', async ({ page }) => {
    await startMission(page);
    await page.keyboard.press('Space');
    const points = [];
    for (const op of (await probe(page)).operatives) points.push((await entityScreen(page, op.id))!);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    await page.mouse.move(Math.min(...xs) - 30, Math.min(...ys) - 40);
    await page.mouse.down();
    await page.mouse.move(Math.max(...xs) + 30, Math.max(...ys) + 30, { steps: 6 });
    await page.mouse.up();
    expect((await probe(page)).selected).toHaveLength(4);
    await page.keyboard.press('Space');

    // BADGER's sixth slot (H) is the stone: aim at the ground, confirm with a left click.
    await page.keyboard.press('Digit1');
    await expect(page.getByTestId('ability-throw-stone')).toContainText('3');
    await page.keyboard.press('KeyH');
    const badger = (await probe(page)).operatives.find((o) => o.id === 'op:engineer')!;
    const aim = (await screenOf(page, badger.x + 6, badger.z + 2))!;
    await page.mouse.move(aim.x, aim.y);
    await expect(page.getByTestId('context-hint')).toContainText('Throw stone: left-click to confirm');
    await page.mouse.click(aim.x, aim.y);
    await expect(page.getByTestId('ability-throw-stone')).toContainText('2');
  });

  test('view cones show for a hovered soldier, a pinned one and all soldiers with Alt', async ({ page }) => {
    await startMission(page);
    await page.keyboard.press('Space');
    const guard = (await entityScreen(page, 'g:beach'))!;
    await page.mouse.move(guard.x, guard.y - 6);
    await expect.poll(async () => (await probe(page)).conesVisible).toBe(2);
    await expect(page.getByTestId('enemy-info')).toContainText('Patrolling');

    await page.mouse.click(guard.x, guard.y - 6);
    await page.mouse.move(40, 400);
    await expect.poll(async () => (await probe(page)).conesVisible).toBe(2);

    await page.keyboard.down('Alt');
    await expect.poll(async () => (await probe(page)).conesVisible).toBeGreaterThan(2);
    await page.keyboard.up('Alt');
  });

  test('a sentry sizing BADGER up shows a sightline, the danger rim and a filling chip', async ({ page }) => {
    await startMission(page);
    await page.keyboard.press('Digit1');
    await page.keyboard.press('KeyZ');
    const start = (await probe(page)).operatives.find((o) => o.id === 'op:engineer')!;
    const sentry = (await probe(page)).guards.find((g) => g.id === 'g:beach')!;
    // Walk upright up the open beach toward the beach patrol.
    const target = (await screenOf(page, start.x + (sentry.x - start.x) * 0.7, start.z + (sentry.z - start.z) * 0.7))!;
    await page.mouse.click(target.x, target.y, { button: 'right' });
    // Pause the moment he starts watching, before he can make up his mind.
    await expect
      .poll(
        async () => {
          const p = await probe(page);
          const live = p.sightlines.some((l) => l.targetId === 'op:engineer' && l.seeing);
          if (live && !p.paused) await page.keyboard.press('Space');
          return live;
        },
        { timeout: 60_000, intervals: [100] },
      )
      .toBe(true);
    await expect.poll(async () => (await probe(page)).paused).toBe(true);
    const watched = await probe(page);
    const line = watched.sightlines.find((l) => l.targetId === 'op:engineer')!;
    expect(line.level).toBeGreaterThan(0);
    expect(line.level).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await probe(page)).sightlinesVisible).toBeGreaterThan(0);
    await expect(page.getByTestId('danger-rim')).not.toHaveAttribute('data-level', 'calm');
    await expect(page.getByTestId('watch-engineer')).toBeVisible();
  });

  test('a squad that charges the garrison is lost and gets an honest debrief', async ({ page }) => {
    test.slow();
    await startMission(page);
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('KeyZ');
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('BracketRight');
    await expect
      .poll(
        async () => {
          const p = await probe(page);
          const free = p.operatives.filter((o) => o.status === 'active');
          if (p.status === 'running' && free.length > 0 && free.every((o) => !o.busy)) {
            await page.keyboard.press('Control+KeyA');
            const target = await screenOf(page, Math.min(free[0]!.x + 10, 50), Math.min(free[0]!.z + 4, 30));
            if (target) await page.mouse.dblclick(target.x, target.y, { button: 'right' });
          }
          return p.status;
        },
        { timeout: 200_000, intervals: [1500] },
      )
      .toBe('failed');
    const debrief = page.getByTestId('debrief');
    await expect(debrief).toBeVisible();
    await expect(debrief).toHaveAttribute('data-outcome', 'failed');
    await expect(debrief).toContainText('Mission failed');
    await expect(debrief).toContainText('Field report');
    // The after-action chart replays the attempt: routes, the sightings and casualties, then rests at the end.
    const chart = debrief.getByTestId('after-action');
    await expect(chart).toBeVisible();
    expect(Number(await chart.getAttribute('data-routes'))).toBeGreaterThan(0);
    expect(Number(await chart.getAttribute('data-incidents'))).toBeGreaterThan(0);
    await expect(chart).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
    await expect(chart).toContainText('Spotted');
    // Scrubbing to the start holds the replay there; play runs it again.
    await chart.getByTestId('after-action-scrub').focus();
    await page.keyboard.press('Home');
    await expect(chart).toHaveAttribute('data-state', 'paused');
    await expect(chart.getByTestId('after-action-clock')).toContainText(/^0:00/);
    await chart.getByTestId('after-action-play').click();
    await expect(chart).not.toHaveAttribute('data-state', 'paused');
    await debrief.getByRole('button', { name: 'Retry mission' }).click();
    await expect(debrief).toBeHidden();
    await expect.poll(async () => (await probe(page)).status).toBe('running');
  });
});
