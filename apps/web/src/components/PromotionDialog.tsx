'use client';

import type { Color, PromotionPiece } from '@acc/chess-core';
import { useEffect, useRef } from 'react';

const CHOICES: Array<{ piece: PromotionPiece; name: string; glyph: Record<Color, string> }> = [
  { piece: 'q', name: 'Queen', glyph: { w: '♕', b: '♛' } },
  { piece: 'r', name: 'Rook', glyph: { w: '♖', b: '♜' } },
  { piece: 'b', name: 'Bishop', glyph: { w: '♗', b: '♝' } },
  { piece: 'n', name: 'Knight', glyph: { w: '♘', b: '♞' } },
];

export function PromotionDialog({
  color,
  onChoose,
  onCancel,
}: {
  color: Color;
  onChoose: (piece: PromotionPiece) => void;
  onCancel: () => void;
}) {
  const firstButton = useRef<HTMLButtonElement>(null);
  useEffect(() => firstButton.current?.focus(), []);

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="promotion-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      >
        <h2 id="promotion-title" className="dialog-title">
          Promote pawn to…
        </h2>
        <div className="promotion-choices">
          {CHOICES.map((choice, index) => (
            <button
              key={choice.piece}
              ref={index === 0 ? firstButton : undefined}
              type="button"
              className="promotion-choice"
              onClick={() => onChoose(choice.piece)}
            >
              <span className="promotion-glyph" aria-hidden="true">
                {choice.glyph[color]}
              </span>
              {choice.name}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
