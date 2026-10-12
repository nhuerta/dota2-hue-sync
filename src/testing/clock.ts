import type { SchedulerClock } from '../game/effect-scheduler';

/** Manual clock for tests: timers fire when `advance` passes their due time, in due order. */
export class TestClock implements SchedulerClock {
  private time = 0;
  private timers: { due: number; fn: () => void; id: number }[] = [];
  private nextId = 1;

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.push({ due: this.time + ms, fn, id });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter(t => t.id !== handle);
  }

  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const next = this.timers.filter(t => t.due <= target).sort((a, b) => a.due - b.due)[0];
      if (!next) {
        break;
      }
      this.time = next.due;
      this.timers = this.timers.filter(t => t.id !== next.id);
      next.fn();
    }
    this.time = target;
  }
}
