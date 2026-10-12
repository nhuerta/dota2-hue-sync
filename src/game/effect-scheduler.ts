/**
 * Decides which light effect plays when several want the strip at once.
 *
 * Two layers:
 * - the ambient layer (idle colour, health bar, critical-health breathing) is a single callback
 *   that repaints whenever nothing else is playing; it is replaced, never queued;
 * - the effect layer holds at most one effect. A request of higher or equal priority replaces
 *   the running one, so ability spam always shows the latest cast; a request of lower priority
 *   is dropped. Nothing is ever played late.
 *
 * Every effect has a finite duration; when it ends the ambient layer is restored. Timers are
 * injected so tests can drive the clock by hand.
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
}

export interface SchedulerClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: SchedulerClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export class EffectScheduler {
  private readonly clock: SchedulerClock;
  private current: EffectRequest | null = null;
  private currentTimer: unknown = null;
  private ambient: (() => void) | null = null;
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

  request(req: EffectRequest): void {
    if (!(req.duration > 0) || !Number.isFinite(req.duration)) {
      throw new Error(`Effect ${req.name} needs a finite positive duration, got ${req.duration}`);
    }
    if (this.current && req.priority < this.current.priority) {
      this.trace(`dropped ${req.name} p${req.priority}: ${this.current.name} p${this.current.priority} is playing`);
      return;
    }
    this.start(req, this.current ? `replacing ${this.current.name}` : undefined);
  }

  /** Stop the running effect and repaint the ambient layer. */
  clear(reason = 'cleared'): void {
    if (this.current) {
      this.trace(`${reason}: stopped ${this.current.name}`);
    }
    this.stopCurrent();
    this.paintAmbient();
  }

  private start(req: EffectRequest, note?: string): void {
    this.stopCurrent();
    this.current = req;
    this.trace(`start ${req.name} p${req.priority} ${req.duration}ms${note ? ` (${note})` : ''}`);
    req.run();
    this.currentTimer = this.clock.setTimeout(() => this.finish(req), req.duration);
  }

  private finish(req: EffectRequest): void {
    if (this.current !== req) {
      return;
    }
    this.current = null;
    this.currentTimer = null;
    this.trace(`done ${req.name}`);
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
