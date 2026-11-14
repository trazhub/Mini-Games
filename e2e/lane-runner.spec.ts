import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { noHorizontalScroll } from './helpers';

/** Open the library and start Lane Runner from its poster's "Play solo" button. */
async function startSoloRun(page: Page) {
  await page.goto(`${BASE_URL}#/games`);
  const poster = page.getByTestId('game-lane-runner');
  await expect(poster).toBeVisible();
  await poster.getByRole('button', { name: 'Play solo' }).click();
  await expect(page.getByTestId('lane-runner')).toBeVisible({ timeout: 20_000 });
}

test.describe('Lane Runner', () => {
  test('plays a solo run and sees the results screen', async ({ page }) => {
    test.setTimeout(120_000);
    await startSoloRun(page);
    const game = page.getByTestId('lane-runner');
    await expect(game).toHaveAttribute('data-phase', 'running', { timeout: 15_000 });
    // Steer a little like a player would, then let the run end (an obstacle, or the 90 s limit).
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.press('a');
    // The server verifies the replayed log and ends the one-player match the moment it is in, so the
    // client's own "over" state is too brief to assert on: wait for the results screen itself.
    await expect(page.getByTestId('scoreboard')).toBeVisible({ timeout: 100_000 });
    await expect(page.getByTestId('winner-banner')).toBeVisible();
    await expect(page.getByTestId('scoreboard').getByText(/^\d+$/).first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('touch controls move the runner on a phone viewport', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'touch input is exercised on the phone project');
    await startSoloRun(page);
    const game = page.getByTestId('lane-runner');
    await expect(game).toHaveAttribute('data-phase', 'running', { timeout: 15_000 });
    await expect(game).toHaveAttribute('data-lane', '1');
    const box = (await page.getByTestId('lane-canvas').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(box.x + box.width * 0.85, y); // right half
    await expect(game).toHaveAttribute('data-lane', '2');
    await page.waitForTimeout(150); // stay under the input-rate limit between taps
    await page.touchscreen.tap(box.x + box.width * 0.15, y); // left half
    await expect(game).toHaveAttribute('data-lane', '1');
    // The on-screen buttons are real touch targets.
    const h = await page.getByRole('button', { name: 'Move left' }).evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);
  });

  test('legal page is reachable from the footer', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('contentinfo').getByRole('link', { name: /Legal notes/ }).click();
    await expect(page.getByTestId('legal-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Legal notes', level: 1 })).toBeVisible();
    await expect(page.getByText('not affiliated with, endorsed by, or sponsored by')).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('profile recovery card explains itself when the server has no database', async ({ page }) => {
    // The e2e server runs without Postgres, so recovery is honestly unavailable (real server restore
    // is covered against a database by apps/server/test/identity.test.ts).
    await page.goto(`${BASE_URL}#/profile`);
    const card = page.getByTestId('recovery-card');
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Make a recovery code' }).click();
    await expect(card.getByRole('alert')).toContainText('not available');
  });

  test('a recovery code restores the same guest after clearing storage', async ({ page }) => {
    // The server half is mocked here (it needs a database); this checks the browser half end to end:
    // the code is shown once, storage can be wiped, and restoring brings back the same guest session.
    const year = 365 * 24 * 3600_000;
    const restored = { guestId: 'guest-restored', token: 'token-restored', expiresAt: Date.now() + year };
    const fresh = { guestId: 'guest-fresh', token: 'token-fresh', expiresAt: Date.now() + year };
    let restoreBody: unknown = null;
    await page.route('**/api/guest', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(fresh) }));
    await page.route('**/api/guest/recovery', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 'ABCD-EFGH-JKMN-PQRS' }) }));
    await page.route('**/api/guest/restore', (r) => {
      restoreBody = r.request().postDataJSON();
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(restored) });
    });
    await page.route('**/api/me/stats', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ persisted: false, stats: null }) }));

    await page.goto(`${BASE_URL}#/profile`);
    const card = page.getByTestId('recovery-card');
    await card.getByRole('button', { name: 'Make a recovery code' }).click();
    await expect(page.getByTestId('recovery-code')).toHaveText('ABCD-EFGH-JKMN-PQRS');
    await expect(card.getByText('Anyone who has this code can become this player')).toBeVisible();

    const stored = () => page.evaluate(() => ({ ls: localStorage.getItem('mgh.session'), ss: sessionStorage.getItem('mgh.session') }));
    const before = await stored();
    expect(`${before.ls}${before.ss}`).toContain('guest-fresh');

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    // A reload starts from empty storage, so the app quietly issues a brand-new guest (the mocked "fresh").
    await page.reload();
    await expect.poll(async () => {
      const s = await stored();
      return `${s.ls}${s.ss}`;
    }).toContain('guest-fresh');

    await page.getByTestId('recovery-card').getByPlaceholder('Paste a recovery code').fill('abcd-efgh-jkmn-pqrs');
    await page.getByTestId('recovery-card').getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Restored. This browser is now that player.')).toBeVisible();
    expect(restoreBody).toEqual({ code: 'abcd-efgh-jkmn-pqrs' });
    const after = await stored();
    expect(`${after.ls}${after.ss}`).toContain('guest-restored');
    expect(`${after.ls}${after.ss}`).not.toContain('guest-fresh');

    // The restored player sticks: another reload keeps it instead of issuing a new guest.
    await page.reload();
    await expect(page.getByTestId('recovery-card')).toBeVisible();
    const kept = await stored();
    expect(`${kept.ls}${kept.ss}`).toContain('guest-restored');
  });
});
