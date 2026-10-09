'use client';

import type { ChessPosition, MoveInput as Move } from '@acc/chess-core';
import { useState } from 'react';

export function MoveInput({ position, disabled, onMove }: { position: ChessPosition; disabled: boolean; onMove: (move: Move) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="move-input"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = position.parseMoveText(text);
        if (!parsed.ok) {
          setError(parsed.error);
          return;
        }
        setError(null);
        setText('');
        onMove(parsed.value);
      }}
    >
      <label htmlFor="move-text" className="label">
        Type a move
      </label>
      <div className="move-input-row">
        <input
          id="move-text"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Nf3, exd5, O-O, e7e8q"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          aria-describedby="move-text-error"
        />
        <button type="submit" className="btn btn-secondary" disabled={disabled || !text.trim()}>
          Play
        </button>
      </div>
      <p id="move-text-error" className="field-error" aria-live="polite">
        {error}
      </p>
    </form>
  );
}
