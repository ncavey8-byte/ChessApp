import { DEFAULT_DIFFICULTY, createSession, isValidDifficulty, type Color } from '@acc/chess-core';
import type { Metadata } from 'next';
import { PlayScreen, type InitialSetup } from '@/components/PlayScreen';
import type { ColorChoice } from '@/components/NewGamePanel';

export const metadata: Metadata = { title: 'Play · Adaptive Chess Coach' };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads optional ?color=w|b|random&level=1-6&fen=... and auto-starts when a colour is given. */
function initialSetup(params: SearchParams): InitialSetup {
  const colorParam = first(params.color);
  const levelParam = Number(first(params.level));
  const fen = first(params.fen)?.trim() ?? '';
  const color: ColorChoice = colorParam === 'w' || colorParam === 'b' || colorParam === 'random' ? colorParam : 'w';
  const level = isValidDifficulty(levelParam) ? levelParam : DEFAULT_DIFFICULTY;
  const settings = { color, level, fen };
  if (!colorParam) return { settings, start: null, error: null };

  const playerColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
  const start = { playerColor, difficulty: level, ...(fen ? { startFen: fen } : {}) };
  const created = createSession(start);
  if (!created.ok) return { settings, start: null, error: created.error };
  if (created.value.result) return { settings, start: null, error: 'That position is already finished. Choose another one.' };
  return { settings: { ...settings, color: playerColor }, start, error: null };
}

export default async function PlayPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const initial = initialSetup(params);
  // Remount when the URL changes so a new link always starts a fresh game.
  return <PlayScreen key={JSON.stringify(params)} initial={initial} />;
}
