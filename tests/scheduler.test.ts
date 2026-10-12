import { describe, expect, test } from 'bun:test';
import { EffectScheduler, Priority, type SchedulerClock } from '../src/game/effect-scheduler';

/** Manual clock: timers fire when `advance` passes their due time, in due order. */
class TestClock implements SchedulerClock {
  private time = 0;
  private timers: { due: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now() { return this.time; }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ due: this.time + ms, fn, id });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.timers = this.timers.filter(t => t.id !== handle);
  }
  advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const next = this.timers.filter(t => t.due <= target).sort((a, b) => a.due - b.due)[0];
      if (!next) { break; }
      this.time = next.due;
      this.timers = this.timers.filter(t => t.id !== next.id);
      next.fn();
    }
    this.time = target;
  }
}

function setup() {
  const clock = new TestClock();
  const scheduler = new EffectScheduler(clock);
  const log: string[] = [];
  scheduler.setAmbient(() => log.push('ambient'));
  const effect = (name: string, priority: Priority, duration: number, preempt?: 'lower' | 'all') => ({
    name, priority, duration, preempt, run: () => log.push(name)
  });
  return { clock, scheduler, log, effect };
}

describe('EffectScheduler', () => {
  test('plays immediately when idle and restores ambient when done', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('kill', Priority.HIGH, 3000));
    expect(log).toEqual(['kill']);
    clock.advance(2999);
    expect(log).toEqual(['kill']);
    clock.advance(1);
    expect(log).toEqual(['kill', 'ambient']);
    expect(scheduler.isPlaying()).toBe(false);
  });

  test('a level-up on the same tick as a kill waits for the kill instead of replacing it', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('kill', Priority.HIGH, 3000));
    scheduler.request(effect('level_up', Priority.NORMAL, 2000));
    expect(log).toEqual(['kill']);
    expect(scheduler.queuedNames()).toEqual(['level_up']);
    clock.advance(3000);
    expect(log).toEqual(['kill', 'level_up']);
    clock.advance(2000);
    expect(log).toEqual(['kill', 'level_up', 'ambient']);
  });

  test('a higher priority request preempts a running lower one', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('leap', Priority.LOW, 1500));
    scheduler.request(effect('kill', Priority.HIGH, 3000));
    expect(log).toEqual(['leap', 'kill']);
    clock.advance(1500);
    // the preempted leap's timer must not end the kill early
    expect(scheduler.currentName()).toBe('kill');
    clock.advance(1500);
    expect(log).toEqual(['leap', 'kill', 'ambient']);
  });

  test('equal priority requests play in order; abilities cut each other off no more', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('starfall', Priority.LOW, 2500));
    scheduler.request(effect('leap', Priority.LOW, 1500));
    expect(log).toEqual(['starfall']);
    clock.advance(2500);
    expect(log).toEqual(['starfall', 'leap']);
  });

  test('stale queued effects are dropped instead of playing late', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('kill', Priority.HIGH, 5000));
    scheduler.request(effect('level_up', Priority.NORMAL, 2000));
    clock.advance(5000);
    expect(log).toEqual(['kill', 'ambient']);
    expect(scheduler.queuedNames()).toEqual([]);
  });

  test('queue is ordered by priority then arrival', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('kill', Priority.HIGH, 1000));
    scheduler.request(effect('arrow', Priority.LOW, 500));
    scheduler.request(effect('assist', Priority.NORMAL, 500));
    scheduler.request(effect('starfall', Priority.LOW, 500));
    expect(scheduler.queuedNames()).toEqual(['assist', 'arrow', 'starfall']);
    clock.advance(1000);
    expect(log).toEqual(['kill', 'assist']);
  });

  test('preempt all stops the current effect and empties the queue', () => {
    const { clock, scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('kill', Priority.HIGH, 3000));
    scheduler.request(effect('assist', Priority.NORMAL, 1000));
    scheduler.request(effect('death', Priority.CRITICAL, 40000, 'all'));
    expect(log).toEqual(['kill', 'death']);
    expect(scheduler.queuedNames()).toEqual([]);
    clock.advance(3000);
    expect(scheduler.currentName()).toBe('death');
  });

  test('ambient is replaced, never queued, and refresh only paints while idle', () => {
    const { scheduler, log, effect } = setup();
    log.length = 0;
    scheduler.request(effect('kill', Priority.HIGH, 3000));
    scheduler.refreshAmbient();
    scheduler.setAmbient(() => log.push('ambient2'));
    expect(log).toEqual(['kill']);
    scheduler.clear('test');
    expect(log).toEqual(['kill', 'ambient2']);
  });

  test('rejects effects without a finite duration', () => {
    const { scheduler } = setup();
    expect(() => scheduler.request({ name: 'forever', priority: Priority.LOW, duration: 0, run: () => {} })).toThrow();
    expect(() => scheduler.request({ name: 'forever', priority: Priority.LOW, duration: Infinity, run: () => {} })).toThrow();
  });
});
