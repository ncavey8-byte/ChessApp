import { expect, test, type Page } from '@playwright/test';

const square = (page: Page, sq: string) => page.locator(`#play-board-square-${sq}`);
const status = (page: Page) => page.getByTestId('game-status');
const moveList = (page: Page) => page.getByTestId('move-list');

async function waitForEngine(page: Page) {
  await expect(page.getByText(/Engine: Stockfish/)).toBeVisible({ timeout: 30_000 });
}

async function clickMove(page: Page, from: string, to: string) {
  await square(page, from).click();
  await square(page, to).click();
}

function playUrl(params: Record<string, string>) {
  return `/play?${new URLSearchParams(params).toString()}`;
}

test('home page leads to a new game against the engine', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Play the computer' }).click();
  await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();
  await page.getByRole('radio', { name: /Beginner/ }).check();
  await page.getByRole('button', { name: 'Start game' }).click();
  await waitForEngine(page);
  await expect(status(page)).toHaveText('Your move');

  await clickMove(page, 'e2', 'e4');
  await expect(moveList(page)).toContainText('e4');
  // The engine replies and it becomes the player's turn again.
  await expect(moveList(page).locator('.move-row').first().locator('.move-san').nth(1)).not.toBeEmpty();
  await expect(status(page)).toHaveText('Your move');

  // Undo takes back both moves.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(moveList(page)).toContainText('No moves yet.');
});

test('illegal moves are rejected and typed moves are accepted', async ({ page }) => {
  await page.goto(playUrl({ color: 'w', level: '1' }));
  await waitForEngine(page);
  await clickMove(page, 'e2', 'e5');
  await expect(moveList(page)).toContainText('No moves yet.');

  const input = page.getByLabel('Type a move');
  await input.fill('Ke2');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('"Ke2" is not a legal move here')).toBeVisible();

  await input.fill('Nf3');
  await input.press('Enter');
  await expect(moveList(page)).toContainText('Nf3');
});

test('player can finish a game by checkmate', async ({ page }) => {
  await page.goto(playUrl({ color: 'w', level: '1', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1' }));
  await clickMove(page, 'a1', 'a8');
  await expect(page.getByTestId('result-banner')).toContainText('You won!');
  await expect(page.getByTestId('result-banner')).toContainText('checkmate');
});

test('engine can finish a game by checkmate', async ({ page }) => {
  await page.goto(playUrl({ color: 'w', level: '6', fen: 'r5k1/8/8/8/8/8/5PPP/6K1 b - - 0 1' }));
  await waitForEngine(page);
  await expect(page.getByTestId('result-banner')).toContainText('Stockfish won', { timeout: 30_000 });
  await expect(moveList(page)).toContainText('Ra1#');
});

test('promotion asks which piece to promote to', async ({ page }) => {
  await page.goto(playUrl({ color: 'w', level: '1', fen: '8/P7/8/8/8/8/k7/7K w - - 0 1' }));
  await clickMove(page, 'a7', 'a8');
  const dialog = page.getByRole('dialog', { name: 'Promote pawn to…' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Knight' }).click();
  await expect(moveList(page)).toContainText('a8=N');
});

test('resigning ends the game', async ({ page }) => {
  await page.goto(playUrl({ color: 'w', level: '1' }));
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Confirm resign' }).click();
  await expect(page.getByTestId('result-banner')).toContainText('Stockfish won by resignation');
});

test('invalid start positions show a helpful error', async ({ page }) => {
  await page.goto(playUrl({ color: 'w', fen: 'not-a-fen' }));
  await expect(page.getByRole('alert').filter({ hasText: 'Invalid start position' })).toBeVisible();
});

test('engine load failure is reported with a retry option', async ({ page }) => {
  await page.route('**/engine/stockfish-19-lite-single.js', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto(playUrl({ color: 'b', level: '1' }));
  await expect(page.getByText('Engine problem.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Restart engine' })).toBeVisible();
});
