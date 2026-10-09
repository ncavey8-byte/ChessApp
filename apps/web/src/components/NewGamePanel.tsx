'use client';

import { DIFFICULTY_PRESETS, type Color } from '@acc/chess-core';
import { useState } from 'react';

export type ColorChoice = Color | 'random';

export interface NewGameSettings {
  color: ColorChoice;
  level: number;
  fen: string;
}

export function NewGamePanel({
  defaults,
  error,
  onStart,
  onCancel,
}: {
  defaults: NewGameSettings;
  error: string | null;
  onStart: (settings: NewGameSettings) => void;
  onCancel?: () => void;
}) {
  const [color, setColor] = useState<ColorChoice>(defaults.color);
  const [level, setLevel] = useState(defaults.level);
  const [fen, setFen] = useState(defaults.fen);

  return (
    <form
      className="panel new-game"
      aria-labelledby="new-game-title"
      onSubmit={(e) => {
        e.preventDefault();
        onStart({ color, level, fen: fen.trim() });
      }}
    >
      <h2 id="new-game-title" className="panel-title">
        New game
      </h2>

      <fieldset className="fieldset">
        <legend className="label">Play as</legend>
        <div className="segmented">
          {(
            [
              ['w', 'White'],
              ['b', 'Black'],
              ['random', 'Random'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`segment${color === value ? ' is-selected' : ''}`}>
              <input type="radio" name="color" value={value} checked={color === value} onChange={() => setColor(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="label">Opponent strength</legend>
        <div className="levels">
          {DIFFICULTY_PRESETS.map((preset) => (
            <label key={preset.level} className={`level${level === preset.level ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="level"
                value={preset.level}
                checked={level === preset.level}
                onChange={() => setLevel(preset.level)}
              />
              <span className="level-name">
                {preset.level}. {preset.label}
              </span>
              <span className="level-desc">{preset.description}</span>
            </label>
          ))}
        </div>
        <p className="muted small">Levels are approximate and not calibrated to a rating.</p>
      </fieldset>

      <details className="details" open={Boolean(defaults.fen)}>
        <summary>Start from a position (optional)</summary>
        <label htmlFor="start-fen" className="label">
          FEN
        </label>
        <input
          id="start-fen"
          className="input mono"
          value={fen}
          onChange={(e) => setFen(e.target.value)}
          placeholder="Leave empty for the standard starting position"
          spellCheck={false}
          autoComplete="off"
        />
      </details>

      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        <button type="submit" className="btn btn-primary">
          Start game
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
