/**
 * Decides which light effect plays when several want the strip at once.
 *
 * Two layers:
 * - the ambient layer (idle colour, health bar, critical-health breathing) is a single callback
 *   that repaints whenever nothing else is playing; it is replaced, never queued;
 * - the effect layer is a priority queue. A request preempts a running effect of lower priority,
 *   waits behind one of equal or higher priority, and is dropped if it waited too long to still
 *   make sense (a level-up flash three seconds late is noise).
 *
 * Every effect has a finite duration; when it ends the next queued one starts, or the ambient
 * layer is restored. Timers are injected so tests can drive the clock by hand.
 */

export enum Priority {
  LOW = 0,       // abilities, item use, status flags
  NORMAL = 1,    // assists, level-ups
  HIGH = 2,      // kills, buyback, Roshan, aegis
  CRITICAL = 3   // death, respawn, game start/end
}

export const PRIORITY_NAMES: Record<string, Priority> = {
  low: Priority.LOW,
  normal: Priority.NORMAL,
  high: Priority.HIGH,
  critical: Priority.CRITICAL
};

export interface EffectRequest {
  /** Shown in logs. */
  name: string;
  priority: Priority;
  /** How long the effect owns the strip, in ms. Must be finite and positive. */
  duration: number;
  /** Starts the effect on the lights. Called at most once. */
  run: () => void;
  /**
   * `lower` (default): preempt only a running effect of lower priority, otherwise queue.
   * `all`: stop whatever is running, drop the queue, play now.
   */
  preempt?: 'lower' | 'all';
  /** Drop the request if it has waited longer than this, in ms. Defaults to DEFAULT_MAX_WAIT. */
  maxWait?: number;
}

export interface SchedulerClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const DEFAULT_MAX_WAIT = 4000;

interface QueuedRequest extends EffectRequest {
  seq: number;
  enqueuedAt: number;
}

const realClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export class EffectScheduler {
  private readonly clock: SchedulerClock;
  private queue: QueuedRequest[] = [];
  private current: QueuedRequest | null = null;
  private currentTimer: unknown = null;
  private ambient: (() => void) | null = null;
  private seq = 0;
  /** Called after every start, finish or drop, with a one-line description. */
  onTrace: ((line: string) => void) | null = null;

  constructor(clock: SchedulerClock = realClock) {
    this.clock = clock;
  }

  /** The background painter used whenever no effect is playing. Repaints immediately if idle. */
  setAmbient(paint: (() => void) | null): void {
    this.ambient = paint;
    if (!this.current) {
      this.paintAmbient();
    }
  }

  /** Re-run the ambient painter now if nothing is playing (health changed, state changed). */
  refreshAmbient(): void {
    if (!this.current) {
      this.paintAmbient();
    }
  }

  isPlaying(): boolean {
    return this.current !== null;
  }

  currentName(): string | null {
    return this.current?.name ?? null;
  }

  queuedNames(): string[] {
    return this.queue.map(entry => entry.name);
  }

  request(req: EffectRequest): void {
    if (!(req.duration > 0) || !Number.isFinite(req.duration)) {
      throw new Error(`Effect ${req.name} needs a finite positive duration, got ${req.duration}`);
    }
    const entry: QueuedRequest = { ...req, seq: this.seq++, enqueuedAt: this.clock.now() };
    if (req.preempt === 'all') {
      this.queue = [];
      this.start(entry, this.current ? `preempting ${this.current.name} and clearing queue` : undefined);
      return;
    }
    if (!this.current) {
      this.start(entry);
      return;
    }
    if (entry.priority > this.current.priority) {
      this.start(entry, `preempting ${this.current.name}`);
      return;
    }
    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
    this.trace(`queued ${entry.name} behind ${this.current.name} (${this.queue.length} waiting)`);
  }

  /** Stop the running effect, drop the queue and repaint the ambient layer. */
  clear(reason = 'cleared'): void {
    this.queue = [];
    if (this.current) {
      this.trace(`${reason}: stopped ${this.current.name}`);
    }
    this.stopCurrent();
    this.paintAmbient();
  }

  private start(entry: QueuedRequest, note?: string): void {
    this.stopCurrent();
    this.current = entry;
    this.trace(`start ${entry.name} p${entry.priority} ${entry.duration}ms${note ? ` (${note})` : ''}`);
    entry.run();
    this.currentTimer = this.clock.setTimeout(() => this.finish(entry), entry.duration);
  }

  private finish(entry: QueuedRequest): void {
    if (this.current !== entry) {
      return;
    }
    this.current = null;
    this.currentTimer = null;
    this.trace(`done ${entry.name}`);
    this.startNext();
  }

  private startNext(): void {
    const now = this.clock.now();
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      const waited = now - next.enqueuedAt;
      if (waited > (next.maxWait ?? DEFAULT_MAX_WAIT)) {
        this.trace(`dropped ${next.name} after waiting ${waited}ms`);
        continue;
      }
      this.start(next);
      return;
    }
    this.paintAmbient();
  }

  private stopCurrent(): void {
    if (this.currentTimer !== null) {
      this.clock.clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    this.current = null;
  }

  private paintAmbient(): void {
    if (this.ambient) {
      try {
        this.ambient();
      } catch (error) {
        console.error('Ambient paint failed:', error);
      }
    }
  }

  private trace(line: string): void {
    if (this.onTrace) {
      this.onTrace(line);
    }
  }
}
