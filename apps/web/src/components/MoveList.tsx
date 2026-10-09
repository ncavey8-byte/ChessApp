'use client';

import type { PlayedMove } from '@acc/chess-core';
import { useEffect, useRef } from 'react';
import { moveRows } from '@/lib/game/labels';

export function MoveList({ history, startFen }: { history: readonly PlayedMove[]; startFen: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [, turn = 'w', , , , fullmove = '1'] = startFen.split(' ');
  const rows = moveRows(
    history.map((m) => m.san),
    turn === 'b' ? 'b' : 'w',
    Number(fullmove) || 1,
  );
  const lastPly = history.length;

  useEffect(() => {
    const el = container.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastPly]);

  return (
    <div className="move-list" ref={container} data-testid="move-list" aria-label="Move history" role="region" tabIndex={0}>
      {rows.length === 0 ? (
        <p className="muted small">No moves yet.</p>
      ) : (
        <ol className="move-rows">
          {rows.map((row) => (
            <li key={row.number} className="move-row">
              <span className="move-number">{row.number}.</span>
              <span className={`move-san${row.whitePly === lastPly ? ' is-last' : ''}`}>{row.white ?? '…'}</span>
              <span className={`move-san${row.blackPly === lastPly ? ' is-last' : ''}`}>{row.black ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
