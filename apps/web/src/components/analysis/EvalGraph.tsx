'use client';

import type { MoveAnalysis, PositionEvaluation } from '@acc/chess-core';
import { CLASSIFICATION_LABELS, FLAGGED, evalAreaPath, evalGraphPoints, plyAtX } from '@/lib/analysis/presentation';

const WIDTH = 600;
const HEIGHT = 120;

export function EvalGraph({
  positions,
  moves,
  ply,
  onSelect,
}: {
  positions: readonly PositionEvaluation[];
  moves: readonly MoveAnalysis[];
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const points = evalGraphPoints(positions, WIDTH, HEIGHT);
  const current = points[ply];
  const flagged = moves.filter((m) => FLAGGED.has(m.classification));
  return (
    <svg
      className="eval-graph"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Evaluation graph: ${flagged.length} flagged moves. Use the move list to navigate.`}
      data-testid="eval-graph"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onSelect(plyAtX(((event.clientX - rect.left) / rect.width) * WIDTH, WIDTH, positions.length - 1));
      }}
    >
      <rect width={WIDTH} height={HEIGHT} className="eval-bg" />
      <path d={evalAreaPath(points, HEIGHT)} className="eval-area" />
      <line x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} className="eval-mid" />
      {flagged.map((m) => {
        const p = points[m.ply];
        return p ? (
          <circle key={m.ply} cx={p.x} cy={p.y} r={4} className={`eval-dot is-${m.classification}`}>
            <title>{`${m.san}: ${CLASSIFICATION_LABELS[m.classification]}`}</title>
          </circle>
        ) : null;
      })}
      {current && <line x1={current.x} x2={current.x} y1={0} y2={HEIGHT} className="eval-cursor" />}
    </svg>
  );
}
