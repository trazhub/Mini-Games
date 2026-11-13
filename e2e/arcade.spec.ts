import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { noHorizontalScroll } from './helpers';

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
