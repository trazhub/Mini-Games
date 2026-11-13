import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

export interface Player {
  ctx: BrowserContext;
  page: Page;
  name: string;
}

export async function newPlayer(browser: Browser, name: string, contextOptions: Parameters<Browser['newContext']>[0] = {}): Promise<Player> {
  const ctx = await browser.newContext(contextOptions);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(`[${name}] pageerror:`, e.message));
  return { ctx, page, name };
}

export async function createRoom(p: Player, opts: { game?: string } = {}): Promise<string> {
  await p.page.goto(opts.game ? `${BASE_URL}#/play?game=${opts.game}` : BASE_URL);
  await p.page.getByLabel('Nickname').fill(p.name);
  if (opts.game) await p.page.getByRole('button', { name: 'Create room' }).click();
  else await p.page.getByRole('button', { name: 'Create room', exact: true }).last().click();
  const code = p.page.getByTestId('room-code');
  await expect(code).toBeVisible();
  return (await code.textContent())!.trim();
}

export async function joinRoom(p: Player, code: string): Promise<void> {
  await p.page.goto(`${BASE_URL}#/join/${code}`);
  await p.page.getByLabel('Nickname').fill(p.name);
  await p.page.getByRole('button', { name: 'Join room' }).click();
  await expect(p.page.getByTestId('room-code')).toHaveText(code);
}

export async function readyUp(players: Player[]): Promise<void> {
  for (const p of players) await p.page.getByTestId('ready-toggle').click();
}

export async function hostStart(host: Player, gameId: string): Promise<void> {
  await host.page.getByTestId(`lobby-game-${gameId}`).getByRole('button', { name: 'Select' }).click();
  const start = host.page.getByTestId('start-game');
  await expect(start).toBeEnabled();
  await start.click();
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1);
}
