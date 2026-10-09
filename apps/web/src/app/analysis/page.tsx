import type { Metadata } from 'next';
import { AnalysisScreen } from '@/components/analysis/AnalysisScreen';
import { GameLibrary } from '@/components/analysis/GameLibrary';

export const metadata: Metadata = { title: 'Analysis · Adaptive Chess Coach' };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const game = Array.isArray(params.game) ? params.game[0] : params.game;
  return game ? <AnalysisScreen key={game} gameId={game} /> : <GameLibrary />;
}
