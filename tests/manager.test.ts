import { describe, expect, test } from 'bun:test';
import type { Hue } from '@nhuerta/node-hue-edk';
import { EventDispatcher, GAME_EVENTS, type GameEventType, type EventData } from '../src/game/events';
import { DotaEffectManager } from '../src/game/dota-effect-manager';
import { EffectScheduler } from '../src/game/effect-scheduler';
import { parseEffectsConfig } from '../src/game/effect-config-loader';
import { TestClock } from '../src/testing/clock';

/** Records every wrapper call as "method(args)" and otherwise does nothing. */
function fakeHue(calls: string[]): Hue {
  return new Proxy({}, {
    get: (_target, name: string) => (...args: unknown[]) => {
      calls.push(`${name}(${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(',')})`);
    }
  }) as unknown as Hue;
}

function setup(effects: Record<string, unknown> = {}) {
  const clock = new TestClock();
  const calls: string[] = [];
  const dispatcher = new EventDispatcher();
  const bindings = parseEffectsConfig({ version: '1.0', effects });
  const manager = new DotaEffectManager(dispatcher, fakeHue(calls), bindings, new EffectScheduler(clock));
  manager.start();
  calls.length = 0;
  const emit = (type: GameEventType, data: EventData = {}) => dispatcher.emit(type, data);
  const inGame = async () => {
    await emit(GAME_EVENTS.GAME.STARTED, { health_percent: 100 });
    calls.length = 0;
  };
  const last = () => calls[calls.length - 1];
  return { clock, calls, emit, inGame, last, manager };
}

describe('DotaEffectManager', () => {
  test('idle blue outside a match, health bar once the match starts', async () => {
    const { calls, emit } = setup();
    await emit(GAME_EVENTS.GSI.CONNECTED, { current_state: { map: { game_state: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }, hero: {} } });
    expect(calls).toEqual(['setSolidColor({"r":0,"g":100,"b":200})']);
    await emit(GAME_EVENTS.GAME.STARTED, { health_percent: 80 });
    expect(calls.at(-1)).toBe('percentageBar(80)');
  });

  test('critical health breathes, recovery stops the breathing before repainting the bar', async () => {
    const { calls, emit, inGame } = setup();
    await inGame();
    await emit(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED, { health_percent: 15 });
    expect(calls).toEqual(['breathingGradient({"r":255,"g":0,"b":0},{"r":0,"g":0,"b":0},1500)']);
    await emit(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED, { health_percent: 12 });
    expect(calls.length).toBe(1); // still breathing, not restarted
    await emit(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED, { health_percent: 45 });
    expect(calls.slice(1)).toEqual(['stopCurrentEffect()', 'percentageBar(45)']);
  });

  test('death: ripple, countdown after 3 s with the remaining time, respawn flash, then the bar', async () => {
    const { clock, calls, emit, inGame } = setup();
    await inGame();
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 40 });
    expect(calls).toEqual(['rippleGradient({"r":150,"g":0,"b":0},2000,1000)']);
    clock.advance(3000);
    expect(calls.at(-1)).toBe('countdownPulse(37)');
    clock.advance(37000);
    await emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN, {});
    expect(calls.at(-1)).toBe('gradientWave({"r":0,"g":255,"b":50},{"r":255,"g":255,"b":255},1000,1500)');
    clock.advance(1500);
    expect(calls.at(-1)).toBe('percentageBar(100)');
  });

  test('the countdown follows the game timer: a pause re-syncs it', async () => {
    const { clock, calls, emit, inGame } = setup();
    await inGame();
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 40 });
    clock.advance(3000);
    expect(calls.at(-1)).toBe('countdownPulse(37)');
    await emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN_TICK, { respawn_seconds: 36 }); // within drift: ignored
    expect(calls.length).toBe(2);
    clock.advance(20000); // game paused for 20 s: Dota still says 36 s left
    await emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN_TICK, { respawn_seconds: 36 });
    expect(calls.at(-1)).toBe('countdownPulse(36)');
  });

  test('effects while dead are dropped, death and respawn are not', async () => {
    const { calls, emit, inGame } = setup({ 'player:combat:kill': { enabled: true, type: 'flashColor', params: { color: 'red', duration: 500 } } });
    await inGame();
    await emit(GAME_EVENTS.PLAYER.COMBAT.KILL, {});
    expect(calls.at(-1)).toBe('flashColor({"r":255,"g":0,"b":0},500)');
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 30 });
    const before = calls.length;
    await emit(GAME_EVENTS.PLAYER.COMBAT.KILL, {});
    expect(calls.length).toBe(before);
  });

  test('a configured effect with a lower priority than the running one is dropped', async () => {
    const { clock, calls, emit, inGame } = setup({
      'player:combat:kill': { enabled: true, type: 'flashColor', params: { color: 'red', duration: 3000 } },
      'player:resources:level_up': { enabled: true, type: 'flashColor', params: { color: 'white', duration: 500 } }
    });
    await inGame();
    await emit(GAME_EVENTS.PLAYER.COMBAT.KILL, {});
    await emit(GAME_EVENTS.PLAYER.RESOURCES.LEVEL_UP, {});
    expect(calls).toEqual(['flashColor({"r":255,"g":0,"b":0},3000)']);
    clock.advance(3000);
    expect(calls.at(-1)).toBe('percentageBar(100)');
  });

  test('losing the GSI feed mid-game drops to idle; reconnecting while dead does not restart the death', async () => {
    const { clock, calls, emit, inGame } = setup();
    await inGame();
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 50 });
    clock.advance(3000);
    await emit(GAME_EVENTS.GSI.DISCONNECTED, {});
    expect(calls.at(-1)).toBe('setSolidColor({"r":0,"g":100,"b":200})');
    calls.length = 0;
    await emit(GAME_EVENTS.GSI.CONNECTED, { current_state: { map: { game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' }, hero: { alive: false, respawn_seconds: 30, health_percent: 0 } } });
    // leaveGame reset isAlive, so this is a fresh death sequence with the game's remaining time
    expect(calls[0]).toBe('rippleGradient({"r":150,"g":0,"b":0},2000,1000)');
    clock.advance(3000);
    expect(calls.at(-1)).toBe('countdownPulse(27)');
  });

  test('a reconnect while dead keeps the running countdown; cold-start events play no effect', async () => {
    const { clock, calls, emit, inGame } = setup({ 'game:started': { enabled: true, type: 'flashColor', params: { color: 'white', duration: 500 } } });
    await inGame();
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 40 });
    clock.advance(3000);
    expect(calls.at(-1)).toBe('countdownPulse(37)');
    const before = calls.length;
    // the detector re-reports the state on a reconnect: a match start and the death, both cold_start
    await emit(GAME_EVENTS.GAME.STARTED, { health_percent: 0, cold_start: true });
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 37, cold_start: true });
    expect(calls.length).toBe(before); // no flash, no second ripple
    await emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, { respawn_seconds: 20, cold_start: true });
    expect(calls.at(-1)).toBe('countdownPulse(20)'); // only the clock was re-synced
  });

  test('shutdown stops timers and the wrapper', () => {
    const { calls, manager } = setup();
    manager.shutdown();
    expect(calls.at(-1)).toBe('shutdown()');
  });
});
