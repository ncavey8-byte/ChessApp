'use client';

import { EngineError, UciEngine, type ChessEngine } from '@acc/chess-core';
import { useCallback, useEffect, useState } from 'react';
import { createWorkerTransport } from './worker-transport';

export type EngineState =
  | { status: 'loading'; engine: null }
  | { status: 'ready'; engine: ChessEngine; name: string }
  | { status: 'error'; engine: null; error: string };

export function describeEngineError(error: unknown): string {
  if (error instanceof EngineError) {
    switch (error.code) {
      case 'init-timeout':
        return 'The chess engine took too long to start.';
      case 'search-timeout':
        return 'The chess engine stopped responding while thinking.';
      case 'crashed':
        return 'The chess engine crashed.';
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Unknown engine error.';
}

/** Starts a browser Stockfish instance and exposes its lifecycle to React. */
export function useEngine() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<EngineState>({ status: 'loading', engine: null });

  useEffect(() => {
    let cancelled = false;
    let engine: UciEngine | null = null;
    const start = async () => {
      engine = new UciEngine(createWorkerTransport());
      const identity = await engine.init();
      return { engine, identity };
    };
    start().then(
      ({ engine: ready, identity }) => {
        if (!cancelled) setState({ status: 'ready', engine: ready, name: identity.name });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', engine: null, error: describeEngineError(error) });
      },
    );
    return () => {
      cancelled = true;
      engine?.dispose();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading', engine: null });
    setAttempt((n) => n + 1);
  }, []);

  const reportFailure = useCallback((error: unknown) => {
    setState({ status: 'error', engine: null, error: describeEngineError(error) });
  }, []);

  return { state, retry, reportFailure };
}
