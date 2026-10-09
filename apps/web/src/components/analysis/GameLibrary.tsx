'use client';

import { archiveFromPgn, parsePgn, type ArchivedGame } from '@acc/chess-core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getGameRepository, newGameId } from '@/lib/storage/game-repository';

export function GameLibrary() {
  const router = useRouter();
  const [games, setGames] = useState<ArchivedGame[] | null>(null);
  const [pgn, setPgn] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGameRepository()
      .listArchived()
      .then(setGames, () => setGames([]));
  }, []);

  async function importPgn(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parsePgn(pgn);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const game = archiveFromPgn(parsed.value, newGameId());
    try {
      await getGameRepository().saveArchived(game);
    } catch {
      setError('Could not save the game in your browser.');
      return;
    }
    router.push(`/analysis?game=${game.id}`);
  }

  return (
    <div className="library">
      <section className="panel">
        <h1 className="panel-title">Your games</h1>
        {games === null ? (
          <p className="muted">Loading…</p>
        ) : games.length === 0 ? (
          <p className="muted">
            No finished games yet. <Link href="/play">Play a game</Link> or import one below.
          </p>
        ) : (
          <ul className="game-list" data-testid="game-list">
            {games.map((g) => (
              <li key={g.id}>
                <Link href={`/analysis?game=${g.id}`} className="game-link">
                  <span>
                    {g.white} vs {g.black}
                  </span>
                  <span className="muted small">
                    {g.outcome} · {Math.ceil(g.record.moves.length / 2)} moves · {new Date(g.finishedAt).toLocaleDateString()}
                  </span>
                  <span className={`badge${g.analysis ? ' badge-live' : ''}`}>{g.analysis ? 'Analysed' : 'Not analysed'}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">Games are stored in this browser only. Accounts and cloud sync come later.</p>
      </section>

      <form className="panel" onSubmit={importPgn}>
        <h2 className="panel-title">Import a PGN</h2>
        <label htmlFor="pgn-input" className="label">
          Paste a single game
        </label>
        <textarea
          id="pgn-input"
          className="input mono pgn-input"
          rows={8}
          value={pgn}
          onChange={(e) => {
            setPgn(e.target.value);
            setError(null);
          }}
          placeholder={'[White "Me"]\n[Black "Friend"]\n\n1. e4 e5 2. Nf3 Nc6 …'}
          spellCheck={false}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          Import and open
        </button>
      </form>
    </div>
  );
}
