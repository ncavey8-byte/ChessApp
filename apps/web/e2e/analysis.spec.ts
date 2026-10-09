import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FORTY_MOVES = readFileSync(resolve(process.cwd(), '../../packages/chess-core/test/fixtures/forty-moves.pgn'), 'utf8');

async function clickMove(page: Page, from: string, to: string) {
  await page.locator(`#play-board-square-${from}`).click();
  await page.locator(`#play-board-square-${to}`).click();
}

async function importPgn(page: Page, pgn: string) {
  await page.goto('/analysis');
  await page.getByLabel('Paste a single game').fill(pgn);
  await page.getByRole('button', { name: 'Import and open' }).click();
}

test('an in-progress game is resumed after a reload', async ({ page }) => {
  await page.goto('/play?color=w&level=1');
  await expect(page.getByText(/Engine: Stockfish/)).toBeVisible({ timeout: 30_000 });
  await clickMove(page, 'e2', 'e4');
  const moves = page.getByTestId('move-list');
  await expect(moves.locator('.move-row').first().locator('.move-san').nth(1)).not.toBeEmpty();
  await expect(page.getByTestId('game-status')).toHaveText('Your move');
  const before = (await moves.textContent()) ?? "";

  await page.goto('/play');
  await expect(page.getByText('Resumed your saved game.')).toBeVisible();
  await expect(page.getByTestId('move-list')).toHaveText(before);
  await expect(page.getByTestId('game-status')).toHaveText('Your move');
});

test('a finished game can be analysed and appears in the library', async ({ page }) => {
  await page.goto(`/play?${new URLSearchParams({ color: 'w', level: '1', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1' })}`);
  await clickMove(page, 'a1', 'a8');
  await expect(page.getByTestId('result-banner')).toContainText('You won!');
  await page.getByRole('link', { name: 'Analyse this game' }).click();

  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByTestId('analysis-summary')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Ra8#/ }).click();
  await expect(page.getByTestId('move-detail')).toContainText('Best move');
  await expect(page.getByText(/Move labels are estimates/)).toBeVisible();

  await page.goto('/analysis');
  await expect(page.getByTestId('game-list')).toContainText('You vs Stockfish (level 1)');
  await expect(page.getByTestId('game-list')).toContainText('Analysed');
});

test('a 40-move imported game is analysed without freezing the page', async ({ page }) => {
  test.setTimeout(150_000);
  await importPgn(page, FORTY_MOVES);
  await expect(page.getByTestId('analysis-move-list')).toContainText('Qe4');
  const analyse = page.getByRole('button', { name: 'Analyse game' });
  await expect(analyse).toBeEnabled({ timeout: 30_000 });

  await page.evaluate(() => {
    const w = window as unknown as { maxLongTask: number };
    w.maxLongTask = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.maxLongTask = Math.max(w.maxLongTask, entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  await analyse.click();
  await expect(page.getByRole('status').filter({ hasText: /Analysing position \d+ of 81/ })).toBeVisible();

  // The page stays interactive while the engine works in its worker.
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.getByTestId('analysis-move-list').getByRole('button', { name: /^d4|^e4|^Nf3|^c4/ }).first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('status').filter({ hasText: /Analysing position/ })).toBeVisible();

  await expect(page.getByTestId('analysis-summary')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('eval-graph')).toBeVisible();
  const maxLongTask = await page.evaluate(() => (window as unknown as { maxLongTask: number }).maxLongTask);
  expect(maxLongTask).toBeLessThan(500);
});

test('malformed PGN is rejected with a message', async ({ page }) => {
  await importPgn(page, '1. e4 e5 2. Ke3 Ke6 3. Qxf7');
  await expect(page.getByRole('alert').filter({ hasText: /Could not read the PGN|Illegal/ })).toBeVisible();
  await expect(page).toHaveURL(/\/analysis$/);
});

test('an unknown game id shows a not-found message', async ({ page }) => {
  await page.goto('/analysis?game=does-not-exist');
  await expect(page.getByRole('heading', { name: 'Game not found' })).toBeVisible();
});
