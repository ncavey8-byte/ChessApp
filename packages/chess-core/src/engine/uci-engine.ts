import { DIFFICULTY_PRESETS } from './difficulty';
import { goCommand, parseUciLine, positionCommand, setOptionCommand, type UciMessage } from './uci';
import {
  EngineError,
  type BestMoveRequest,
  type BestMoveResult,
  type ChessEngine,
  type EngineIdentity,
  type SearchInfo,
  type UciTransport,
} from './types';

export interface UciEngineOptions {
  /** Max time to wait for `uciok`/`readyok` during startup. */
  initTimeoutMs?: number;
  /** Extra time allowed beyond `movetimeMs` before a search is considered hung. */
  searchGraceMs?: number;
  /** Max time for searches limited only by depth/nodes. */
  maxSearchMs?: number;
}

type Waiter = {
  match: (message: UciMessage) => boolean;
  resolve: (message: UciMessage) => void;
  reject: (error: EngineError) => void;
  timer: ReturnType<typeof setTimeout>;
};

const MAX_SKILL_LEVEL = Math.max(...DIFFICULTY_PRESETS.map((p) => p.skillLevel));

/**
 * Platform-independent UCI engine client. It serialises requests, so callers can
 * fire requests without coordinating, and it fails loudly (EngineError) on timeouts,
 * crashes and disposal instead of hanging.
 */
export class UciEngine implements ChessEngine {
  private readonly transport: UciTransport;
  private readonly options: Required<UciEngineOptions>;
  private readonly waiters = new Set<Waiter>();
  private readonly unsubscribe: Array<() => void> = [];
  private initPromise: Promise<EngineIdentity> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private failure: EngineError | null = null;
  private currentSkill: number | null = null;
  private lastInfo: SearchInfo | undefined;

  constructor(transport: UciTransport, options: UciEngineOptions = {}) {
    this.transport = transport;
    this.options = {
      initTimeoutMs: options.initTimeoutMs ?? 20_000,
      searchGraceMs: options.searchGraceMs ?? 10_000,
      maxSearchMs: options.maxSearchMs ?? 60_000,
    };
    this.unsubscribe.push(
      transport.onLine((line) => this.handleLine(line)),
      transport.onError((error) => this.fail(new EngineError('crashed', `Engine crashed: ${error.message}`))),
    );
  }

  init(): Promise<EngineIdentity> {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.initPromise) this.initPromise = this.handshake();
    return this.initPromise;
  }

  bestMove(request: BestMoveRequest): Promise<BestMoveResult> {
    const run = async (): Promise<BestMoveResult> => {
      await this.init();
      if (request.signal?.aborted) throw new EngineError('aborted', 'Search was cancelled');
      const skill = request.skillLevel ?? MAX_SKILL_LEVEL;
      if (!Number.isInteger(skill) || skill < 0 || skill > 20) {
        throw new EngineError('invalid-request', `Skill level must be an integer from 0 to 20, got ${skill}`);
      }
      let go: string;
      try {
        go = goCommand(request.limits);
      } catch (error) {
        throw new EngineError('invalid-request', (error as Error).message);
      }
      if (skill !== this.currentSkill) {
        this.send(setOptionCommand('Skill Level', skill));
        this.currentSkill = skill;
      }
      this.send(positionCommand(request.startFen, request.moves));
      await this.request('isready', (m) => m.type === 'readyok', this.options.initTimeoutMs, 'search-timeout');

      this.lastInfo = undefined;
      const timeout = request.limits.movetimeMs !== undefined && request.limits.depth === undefined && request.limits.nodes === undefined
        ? request.limits.movetimeMs + this.options.searchGraceMs
        : Math.min(this.options.maxSearchMs, (request.limits.movetimeMs ?? this.options.maxSearchMs) + this.options.searchGraceMs);

      let aborted = false;
      const onAbort = () => {
        aborted = true;
        this.send('stop');
      };
      request.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const message = await this.request(go, (m) => m.type === 'bestmove', timeout, 'search-timeout');
        if (aborted) throw new EngineError('aborted', 'Search was cancelled');
        if (message.type !== 'bestmove') throw new EngineError('crashed', 'Unexpected engine response');
        const result: BestMoveResult = { bestMove: message.move };
        if (message.ponder) result.ponder = message.ponder;
        if (this.lastInfo) result.info = this.lastInfo;
        return result;
      } finally {
        request.signal?.removeEventListener('abort', onAbort);
      }
    };
    const task = this.queue.then(run, run);
    this.queue = task.catch(() => undefined);
    return task;
  }

  dispose(): void {
    this.fail(new EngineError('disposed', 'Engine was disposed'));
  }

  private async handshake(): Promise<EngineIdentity> {
    const identity: EngineIdentity = { name: 'Unknown engine' };
    const collectId = this.transport.onLine((line) => {
      const message = parseUciLine(line);
      if (message.type === 'id' && message.key === 'name') identity.name = message.value;
      if (message.type === 'id' && message.key === 'author') identity.author = message.value;
    });
    try {
      await this.request('uci', (m) => m.type === 'uciok', this.options.initTimeoutMs, 'init-timeout');
      await this.request('isready', (m) => m.type === 'readyok', this.options.initTimeoutMs, 'init-timeout');
      return identity;
    } finally {
      collectId();
    }
  }

  private send(command: string): void {
    if (this.failure) throw this.failure;
    this.transport.send(command);
  }

  private request(
    command: string,
    match: (message: UciMessage) => boolean,
    timeoutMs: number,
    timeoutCode: 'init-timeout' | 'search-timeout',
  ): Promise<UciMessage> {
    return new Promise<UciMessage>((resolve, reject) => {
      if (this.failure) return reject(this.failure);
      const waiter: Waiter = {
        match,
        resolve: (message) => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          reject(error);
        },
        timer: setTimeout(() => {
          // A hung engine leaves the protocol in an unknown state; treat it as fatal.
          this.fail(new EngineError(timeoutCode, `Engine did not respond to "${command.split(' ')[0]}" within ${timeoutMs} ms`));
        }, timeoutMs),
      };
      this.waiters.add(waiter);
      try {
        this.transport.send(command);
      } catch (error) {
        this.fail(new EngineError('crashed', `Failed to send command: ${(error as Error).message}`));
      }
    });
  }

  private handleLine(line: string): void {
    const message = parseUciLine(line);
    if (message.type === 'info' && message.info.pv && (message.info.multipv ?? 1) === 1) {
      this.lastInfo = message.info;
    }
    for (const waiter of [...this.waiters]) {
      if (waiter.match(message)) waiter.resolve(message);
    }
  }

  private fail(error: EngineError): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of [...this.waiters]) waiter.reject(error);
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    try {
      this.transport.terminate();
    } catch {
      // Ignore: the transport is already unusable.
    }
  }
}
