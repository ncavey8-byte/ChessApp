import type { Score, SearchInfo, SearchLimits } from './types';

export type UciMessage =
  | { type: 'id'; key: string; value: string }
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'bestmove'; move: string | null; ponder?: string }
  | { type: 'info'; info: SearchInfo; string?: string }
  | { type: 'other'; line: string };

const INT_FIELDS: Record<string, keyof SearchInfo> = {
  depth: 'depth',
  seldepth: 'seldepth',
  multipv: 'multipv',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
};

function parseInfo(tokens: string[]): { info: SearchInfo; string?: string } {
  const info: SearchInfo = {};
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token === 'string') return { info, string: tokens.slice(i + 1).join(' ') };
    if (token === 'pv') {
      info.pv = tokens.slice(i + 1);
      break;
    }
    if (token === 'score') {
      const kind = tokens[i + 1];
      const value = Number(tokens[i + 2]);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(value)) {
        info.score = { type: kind, value } satisfies Score;
      }
      i += 2;
      continue;
    }
    const field = INT_FIELDS[token];
    if (field) {
      const value = Number(tokens[i + 1]);
      if (Number.isFinite(value)) (info as Record<string, number>)[field] = value;
      i += 1;
    }
  }
  return { info };
}

export function parseUciLine(raw: string): UciMessage {
  const line = raw.trim();
  const tokens = line.split(/\s+/);
  switch (tokens[0]) {
    case 'uciok':
      return { type: 'uciok' };
    case 'readyok':
      return { type: 'readyok' };
    case 'id':
      return { type: 'id', key: tokens[1] ?? '', value: tokens.slice(2).join(' ') };
    case 'bestmove': {
      const move = tokens[1];
      const isMove = move !== undefined && move !== '(none)' && move !== '0000';
      const ponderIndex = tokens.indexOf('ponder');
      const ponder = ponderIndex > 0 ? tokens[ponderIndex + 1] : undefined;
      return ponder ? { type: 'bestmove', move: isMove ? move : null, ponder } : { type: 'bestmove', move: isMove ? move : null };
    }
    case 'info': {
      const parsed = parseInfo(tokens);
      return parsed.string !== undefined
        ? { type: 'info', info: parsed.info, string: parsed.string }
        : { type: 'info', info: parsed.info };
    }
    default:
      return { type: 'other', line };
  }
}

export function positionCommand(startFen: string, moves: readonly string[]): string {
  const base = `position fen ${startFen}`;
  return moves.length ? `${base} moves ${moves.join(' ')}` : base;
}

export function goCommand(limits: SearchLimits): string {
  const parts = ['go'];
  if (limits.depth !== undefined) parts.push('depth', String(Math.max(1, Math.floor(limits.depth))));
  if (limits.movetimeMs !== undefined) parts.push('movetime', String(Math.max(1, Math.floor(limits.movetimeMs))));
  if (limits.nodes !== undefined) parts.push('nodes', String(Math.max(1, Math.floor(limits.nodes))));
  if (parts.length === 1) throw new Error('Search limits must include depth, movetimeMs or nodes');
  return parts.join(' ');
}

export function setOptionCommand(name: string, value: string | number | boolean): string {
  return `setoption name ${name} value ${String(value)}`;
}
