import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { createRoom, joinRoom, newPlayer, noHorizontalScroll } from './helpers';

test('arcade entrance is keyboard playable in reduced motion and exposes room entry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE_URL);
  const toy = page.getByRole('button', { name: 'Collect a spark' });
  await expect(toy).toBeVisible();
  await toy.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Five sparks' })).toBeVisible();
  await page.getByRole('link', { name: 'Join a room' }).first().click();
  await expect(page.getByRole('tab', { name: 'Join with a code' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Room code', { exact: true })).toBeVisible();
  await noHorizontalScroll(page);
});

test('poster previews support focus and navigation without loading Phaser', async ({ page }) => {
  const gameRequests: string[] = [];
  page.on('request', r => { if (/phaser.*\.js/.test(r.url())) gameRequests.push(r.url()); });
  await page.goto(`${BASE_URL}#/games`);
  for (const id of ['majority-trap', 'echo-steps', 'orbit-swap']) {
    const poster = page.getByTestId(`game-${id}`);
    await expect(poster.getByRole('img')).toBeVisible();
    await poster.getByRole('link', { name: /^Play/ }).focus();
    await expect(poster.locator(':focus')).toHaveCount(1);
  }
  expect(gameRequests).toEqual([]);
  await noHorizontalScroll(page);
});

test('room entry uses arrow keys for mode tabs and avatar selection', async ({ page }) => {
  await page.goto(`${BASE_URL}#/play`);
  await page.getByRole('tab', { name: 'Create a room' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Join with a code' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Room code', { exact: true })).toBeVisible();
  const avatar = page.getByRole('radio', { checked: true });
  const original = await avatar.getAttribute('aria-label');
  await avatar.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { checked: true })).not.toHaveAttribute('aria-label', original!);
  await expect(page.getByRole('radio', { checked: true })).toBeFocused();
});

test('timing toy catches at the gate, rejects duplicate catches and stops on request', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Give it a spin' }).click();
  const catchButton = page.getByRole('button', { name: 'Catch the spark' });
  // Set the real CSS animation clock to a deterministic point inside the gate.
  await page.locator('.toy-runner').evaluate(el => { const animation = el.getAnimations()[0]!; animation.pause(); animation.currentTime = 200; });
  await catchButton.click();
  await expect(page.getByRole('status').filter({ hasText: 'Nice catch! 1 of 5' })).toBeVisible();
  await catchButton.click();
  await expect(page.getByRole('status').filter({ hasText: 'One spark per orbit' })).toBeVisible();
  await page.locator('.toy-runner').evaluate(el => { el.getAnimations()[0]!.currentTime = 6000; });
  await catchButton.click();
  await expect(page.getByRole('status').filter({ hasText: 'Just missed' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop orbit' }).click();
  await expect(page.getByRole('button', { name: 'Give it a spin' })).toBeVisible();
  await expect(page.locator('.toy-running')).toHaveCount(0);
});

test('arcade section and skip links preserve the hash route', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.getByRole('link', { name: 'Explore the arcade' }).click();
  await expect(page.getByRole('heading', { name: 'Pick your kind of trouble.' })).toBeVisible();
  await expect(page).not.toHaveURL(/#the-games/);
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Small games.');
});

test('tablet navigation keeps a route back to the party and shows disconnected seats', async ({ browser }) => {
  const host = await newPlayer(browser, 'Host', { viewport: { width: 700, height: 1000 } });
  const code = await createRoom(host);
  const guest = await newPlayer(browser, 'Guest');
  await joinRoom(guest, code);
  await host.page.getByTestId('copy-invite').click();
  await expect(host.page.getByTestId('copy-invite')).toContainText('Link copied');
  await guest.ctx.close();
  await expect(host.page.getByTestId('player-list')).toContainText('Offline');
  await host.page.goto(`${BASE_URL}#/games`);
  await host.page.getByRole('button', { name: 'Menu' }).click();
  await host.page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: `Back to party ${code}` }).click();
  await expect(host.page.getByTestId('room-code')).toHaveText(code);
  await noHorizontalScroll(host.page);
  await host.ctx.close();
});
