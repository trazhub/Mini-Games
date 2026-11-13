import { devices, expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { createRoom, hostStart, joinRoom, newPlayer, noHorizontalScroll, readyUp } from './helpers';

const phone = { ...devices['Pixel 7'], channel: process.env.CI ? undefined : 'chrome' } as Parameters<typeof newPlayer>[2];

test.describe('mobile layout and touch controls (Pixel 7 viewport)', () => {
  test('home, library, settings and profile fit the phone viewport', async ({ browser }) => {
    const p = await newPlayer(browser, 'Tiny', phone);
    for (const hash of ['', '#/games', '#/play', '#/settings', '#/profile']) {
      await p.page.goto(BASE_URL + hash);
      await expect(p.page.locator('main')).toBeVisible();
      await noHorizontalScroll(p.page);
    }
    // mobile navigation menu works
    await p.page.goto(BASE_URL);
    await p.page.getByRole('button', { name: 'Menu' }).click();
    await p.page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Games' }).click();
    await expect(p.page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
    // primary buttons meet the 44px touch target guideline
    await p.page.goto(BASE_URL);
    const h = await p.page.getByRole('button', { name: 'Create room', exact: true }).last().evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
    await p.ctx.close();
  });

  test('lobby and Orbit Swap work with touch only', async ({ browser }) => {
    const host = await newPlayer(browser, 'Tap1', phone);
    const code = await createRoom(host, { game: 'orbit-swap' });
    const guest = await newPlayer(browser, 'Tap2', phone);
    await joinRoom(guest, code);
    await noHorizontalScroll(host.page);
    await noHorizontalScroll(guest.page);
    await guest.page.getByTestId('ready-toggle').tap();
    await host.page.getByTestId('start-game').tap();
    for (const p of [host, guest]) await expect(p.page.getByTestId('orbit-swap').locator('canvas')).toBeVisible({ timeout: 25_000 });
    const box = await host.page.getByTestId('orbit-swap').locator('canvas').boundingBox();
    const vp = host.page.viewportSize()!;
    expect(box!.width).toBeLessThanOrEqual(vp.width);
    await noHorizontalScroll(host.page);
    for (const id of ['orbit-outer', 'orbit-flip', 'orbit-inner']) {
      const b = host.page.getByTestId(id);
      await expect(b).toBeVisible();
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await b.tap();
    }
    for (const p of [host, guest]) await expect(p.page.getByTestId('winner-banner')).toBeVisible({ timeout: 30_000 });
    await noHorizontalScroll(host.page);
    await host.ctx.close();
    await guest.ctx.close();
  });

  test('Echo Steps pads are tappable on a phone', async ({ browser }) => {
    const host = await newPlayer(browser, 'Pad1', phone);
    const code = await createRoom(host);
    const guest = await newPlayer(browser, 'Pad2', phone);
    await joinRoom(guest, code);
    await readyUp([guest]);
    await hostStart(host, 'echo-steps');
    await expect(host.page.getByTestId('echo-headline')).toHaveText('Your turn!', { timeout: 30_000 });
    await expect(host.page.getByTestId('pad-0')).toBeEnabled();
    const b = await host.page.getByTestId('pad-0').boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(44);
    await host.page.getByTestId('pad-0').tap();
    await expect(host.page.getByText(/1\/3|Wrong pad/).first()).toBeVisible({ timeout: 5000 });
    await noHorizontalScroll(host.page);
    await host.ctx.close();
    await guest.ctx.close();
  });
});
