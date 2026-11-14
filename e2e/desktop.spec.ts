import { expect, test } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { createRoom, hostStart, joinRoom, newPlayer, noHorizontalScroll, readyUp } from './helpers';

test.describe('production build under /Mini-Games/', () => {
  test('serves assets from the GitHub Pages base path and supports hash deep links', async ({ page }) => {
    const bad: string[] = [];
    page.on('response', (r) => {
      if (r.url().startsWith('http://localhost:4180') && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Insert friends');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'docs/screenshots/home-desktop.png', fullPage: true, animations: 'disabled' });
    const scripts = await page.$$eval('script[src]', (els) => els.map((e) => (e as HTMLScriptElement).getAttribute('src')));
    expect(scripts.every((s) => s!.startsWith('/Mini-Games/assets/'))).toBe(true);
    // deep link straight into a hash route
    await page.goto(`${BASE_URL}#/games`);
    await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
    await expect(page.getByTestId('game-majority-trap')).toBeVisible();
    await page.screenshot({ path: 'docs/screenshots/library-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Reaction' }).click();
    await expect(page.getByTestId('game-echo-steps')).toBeVisible();
    await expect(page.getByTestId('game-majority-trap')).toHaveCount(0);
    await page.goto(`${BASE_URL}#/settings`);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.goto(`${BASE_URL}#/nope`);
    await expect(page.getByRole('heading', { name: /Lost in orbit/ })).toBeVisible();
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
    await noHorizontalScroll(page);
  });

  test('settings persist and reduced motion applies', async ({ page }) => {
    await page.goto(`${BASE_URL}#/settings`);
    await page.getByRole('switch', { name: 'Reduce motion' }).click();
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/reduce-motion/);
    await page.getByRole('switch', { name: 'Sound effects' }).click();
    await expect(page.getByRole('switch', { name: 'Sound effects' })).toHaveAttribute('aria-checked', 'false');
  });

  test('invalid and unknown room codes give clear errors', async ({ browser }) => {
    const p = await newPlayer(browser, 'Zed');
    await p.page.goto(`${BASE_URL}#/play`);
    await p.page.getByLabel('Nickname').fill('Zed');
    await p.page.getByRole('tab', { name: 'Join with a code' }).click();
    await p.page.getByLabel('Room code').fill('AB');
    await p.page.getByRole('button', { name: 'Join room' }).click();
    await expect(p.page.getByRole('alert')).toContainText('5 letters and numbers');
    await p.page.getByLabel('Room code').fill('ZZZZZ');
    await expect(p.page.getByText('No party with that code')).toBeVisible();
    await p.page.getByRole('button', { name: 'Join room' }).click();
    await expect(p.page.getByRole('alert')).toContainText('No party found');
    await p.ctx.close();
  });
});

test.describe('multiplayer in real browsers', () => {
  test('3 players: invite link, ready, Majority Trap with keyboard + mouse, results, rematch, lobby', async ({ browser }) => {
    const host = await newPlayer(browser, 'Hana');
    const code = await createRoom(host);
    const p2 = await newPlayer(browser, 'Ivo');
    const p3 = await newPlayer(browser, 'Jun');
    await joinRoom(p2, code);
    await joinRoom(p3, code);
    await expect(host.page.getByTestId('player-count')).toHaveText('3 of 12');
    await expect(host.page.getByTestId('player-list')).toContainText('Ivo');
    await host.page.screenshot({ path: 'docs/screenshots/lobby-desktop.png', fullPage: true, animations: 'disabled' });
    await expect(host.page.getByTestId('start-hint')).toContainText('Pick a game');

    await readyUp([p2, p3]);
    await hostStart(host, 'majority-trap');
    for (const p of [host, p2, p3]) await expect(p.page.getByTestId('majority-trap')).toBeVisible({ timeout: 20_000 });
    await expect(host.page).toHaveURL(/\/play$/);
    await host.page.screenshot({ path: 'docs/screenshots/majority-desktop.png', fullPage: true, animations: 'disabled' });

    for (let round = 1; round <= 2; round++) {
      // answer buttons exist only while a question is open (not during the previous reveal)
      for (const p of [host, p2, p3]) await expect(p.page.getByTestId('answer-A')).toBeVisible({ timeout: 20_000 });
      // Host uses the keyboard: A picks answer A, Shift+B predicts B is less popular, Enter locks in.
      await host.page.keyboard.press('a');
      await host.page.keyboard.press('Shift+B');
      await host.page.keyboard.press('Enter');
      await expect(host.page.getByTestId('mt-locked')).toBeVisible();
      // Others use the mouse.
      for (const p of [p2, p3]) {
        await p.page.getByTestId('answer-B').click();
        await p.page.getByTestId('predict-A').click();
        await p.page.getByTestId('mt-lock').click();
      }
      await expect(host.page.getByTestId('mt-reveal')).toBeVisible({ timeout: 10_000 });
      await expect(host.page.getByTestId('live-scores')).toBeVisible();
    }

    for (const p of [host, p2, p3]) await expect(p.page.getByTestId('winner-banner')).toBeVisible({ timeout: 25_000 });
    await expect(host.page).toHaveURL(/\/results$/);
    await host.page.screenshot({ path: 'docs/screenshots/results-desktop.png', fullPage: true, animations: 'disabled' });
    // Server-computed scores: A is the minority every round -> host gets 50/round, others predict A => 100/round
    const rows = host.page.getByTestId('scoreboard').locator('li');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('200');
    await expect(rows.last()).toContainText('Hana');
    await expect(rows.last()).toContainText('100');

    // Only the host sees host controls
    await expect(host.page.getByTestId('rematch')).toBeVisible();
    await expect(p2.page.getByTestId('rematch')).toHaveCount(0);

    await host.page.getByTestId('back-to-lobby').click();
    for (const p of [host, p2, p3]) await expect(p.page.getByTestId('room-code')).toHaveText(code);
    await expect(host.page.getByTestId('player-count')).toHaveText('3 of 12');
    await expect(host.page).toHaveURL(new RegExp(`/room/${code}$`));
    for (const p of [host, p2, p3]) await p.ctx.close();
  });

  test('a player who reloads mid-lobby rejoins the same party automatically', async ({ browser }) => {
    const host = await newPlayer(browser, 'Kai');
    const code = await createRoom(host);
    const p2 = await newPlayer(browser, 'Lea');
    await joinRoom(p2, code);
    await p2.page.reload();
    await expect(p2.page.getByTestId('room-code')).toHaveText(code, { timeout: 15_000 });
    await expect(host.page.getByTestId('player-count')).toHaveText(/2 of 12|3 of 12/);
    await host.page.getByRole('button', { name: 'Leave party' }).click();
    await expect(host.page.getByRole('heading', { level: 1 })).toContainText('Insert friends');
    await host.ctx.close();
    await p2.ctx.close();
  });

  test('host can remove a player, who sees why', async ({ browser }) => {
    const host = await newPlayer(browser, 'Mia');
    const code = await createRoom(host);
    const p2 = await newPlayer(browser, 'Noa');
    await joinRoom(p2, code);
    await host.page.getByRole('button', { name: 'Remove Noa from the party' }).click();
    await host.page.getByRole('button', { name: 'Confirm remove' }).click();
    await expect(p2.page.getByText('The host removed you')).toBeVisible();
    await expect(host.page.getByTestId('player-count')).toHaveText('1 of 12');
    await host.ctx.close();
    await p2.ctx.close();
  });

  test('Echo Steps: pads appear, watch phase then input phase, keyboard input is validated by the server', async ({ browser }) => {
    const host = await newPlayer(browser, 'Omar');
    const code = await createRoom(host, { game: 'echo-steps' });
    const p2 = await newPlayer(browser, 'Pia');
    await joinRoom(p2, code);
    await readyUp([p2]);
    await expect(host.page.getByTestId('lobby-game-echo-steps')).toContainText('Selected');
    await host.page.getByTestId('start-game').click();
    for (const p of [host, p2]) await expect(p.page.getByTestId('echo-steps')).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByTestId('echo-headline')).toHaveText('Watch…', { timeout: 10_000 });
    await expect(host.page.getByTestId('echo-headline')).toHaveText('Your turn!', { timeout: 15_000 });
    await host.page.keyboard.press('ArrowUp');
    // The server answers: either progress advanced (1/3) or we are eliminated. Both prove validation ran server-side.
    await expect(host.page.getByText(/1\/3|Wrong pad/).first()).toBeVisible({ timeout: 5000 });
    for (const p of [host, p2]) await expect(p.page.getByTestId('winner-banner')).toBeVisible({ timeout: 40_000 });
    await host.ctx.close();
    await p2.ctx.close();
  });

  test('Orbit Swap: Phaser canvas renders, keyboard moves are accepted, match ends with results', async ({ browser }) => {
    const host = await newPlayer(browser, 'Quin');
    const code = await createRoom(host, { game: 'orbit-swap' });
    const p2 = await newPlayer(browser, 'Rae');
    await joinRoom(p2, code);
    await readyUp([p2]);
    await host.page.getByTestId('start-game').click();
    for (const p of [host, p2]) await expect(p.page.getByTestId('orbit-swap').locator('canvas')).toBeVisible({ timeout: 25_000 });
    await host.page.keyboard.press('ArrowUp');
    await host.page.keyboard.press('Space');
    await expect(host.page.getByTestId('live-scores').locator('li')).toHaveCount(2);
    for (const p of [host, p2]) await expect(p.page.getByTestId('winner-banner')).toBeVisible({ timeout: 30_000 });
    await expect(host.page.getByTestId('scoreboard').locator('li')).toHaveCount(2);
    await host.ctx.close();
    await p2.ctx.close();
  });

  test('two tabs of one browser are two different players (per-tab guest sessions)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    await a.goto(BASE_URL);
    await a.getByLabel('Nickname').fill('TabA');
    await a.getByRole('button', { name: 'Create room', exact: true }).last().click();
    const code = (await a.getByTestId('room-code').textContent())!.trim();
    await b.goto(`${BASE_URL}#/join/${code}`);
    await b.getByLabel('Nickname').fill('TabB');
    await b.getByRole('button', { name: 'Join room' }).click();
    await expect(b.getByTestId('player-count')).toHaveText('2 of 12');
    await expect(a.getByTestId('player-count')).toHaveText('2 of 12');
    await ctx.close();
  });
});
