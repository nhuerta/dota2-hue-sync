import { describe, expect, test, beforeAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { loadFixture, replayFrames, type FixtureFrame, type ReplayResult } from '../src/testing/replay';
import type { Dota2GameState } from '../src/game/dota2-types';

const FIXTURE = fileURLToPath(new URL('../fixtures/match_8200614096.jsonl.gz', import.meta.url));

let frames: FixtureFrame[];
let result: ReplayResult;

beforeAll(async () => {
  frames = loadFixture(FIXTURE);
  result = await replayFrames(frames);
});

/** Game times of frames whose `previously.hero.alive` flips to the given value. */
function aliveTransitions(to: boolean): number[] {
  return frames
    .filter(f => f.payload.previously?.hero?.alive === !to && f.payload.hero?.alive === to)
    .map(f => f.payload.map?.game_time ?? -1);
}

describe('fixture match 8200614096 (Mirana)', () => {
  test('loads every unique frame including heartbeats', () => {
    expect(frames.length).toBe(1924);
    expect(frames.filter(f => !f.payload.previously).length).toBe(18);
  });

  test('heartbeat frames during a running game do not restart the game', () => {
    // One real PRE_GAME -> IN_PROGRESS transition, then a lobby (match 0) 49 minutes later.
    const started = result.dispatcher.ofType('game:started');
    expect(started.map(e => e.data.match_id)).toEqual(['8200614096', '0']);
    expect(started.map(e => e.data.cold_start)).toEqual([undefined, true]);
  });

  test('match end fires once even though win_team and POST_GAME land together', () => {
    const ended = result.dispatcher.ofType('game:ended');
    expect(ended.length).toBe(1);
    expect(ended[0]?.data.victory).toBe(true);
    expect(ended[0]?.data.winner).toBe('radiant');
  });

  test('deaths and respawns follow hero.alive', () => {
    expect(result.dispatcher.ofType('player:combat:death').map(e => e.gameTime)).toEqual(aliveTransitions(false));
    expect(result.dispatcher.ofType('player:combat:respawn').map(e => e.gameTime)).toEqual(aliveTransitions(true));
    expect(result.dispatcher.ofType('player:combat:death').map(e => e.data.respawn_seconds)).toEqual([35, 45, 68]);
    expect(result.dispatcher.ofType('player:combat:respawn').every(e => e.data.buyback === false)).toBe(true);
  });

  test('no buyback is reported in a match without one', () => {
    expect(result.dispatcher.ofType('player:combat:buyback').length).toBe(0);
  });

  test('recipe combines and slot moves are not drops', () => {
    const purchased = result.dispatcher.ofType('player:items:purchased');
    const dropped = result.dispatcher.ofType('player:items:dropped');
    expect(purchased.length).toBe(27);
    expect(dropped.length).toBe(13);
    // The lobby that follows the match must not report the whole inventory as sold.
    expect(dropped.filter(e => e.data.sold).length).toBe(0);
    const scepter = purchased.find(e => e.data.item_name === 'item_ultimate_scepter');
    expect(scepter?.data.combined_from).toEqual(['item_staff_of_wizardry', 'item_point_booster', 'item_ogre_axe']);
    expect(dropped.map(e => e.data.item_name)).not.toContain('item_branches');
  });

  test('kills, assists and level-ups match the counters in the frames', () => {
    const last = frames[1876]?.payload;
    // Heartbeat frames carry no `previously`; the detector diffs them against the frame before.
    const assistFrames: FixtureFrame[] = [];
    let prior: Dota2GameState | undefined;
    for (const f of frames) {
      const before = f.payload.previously?.player?.assists ?? prior?.player?.assists;
      if (before !== undefined && (f.payload.player?.assists ?? 0) > before) {
        assistFrames.push(f);
      }
      prior = f.payload;
    }
    expect(result.dispatcher.ofType('player:combat:kill').length).toBe(last?.player?.kills ?? -1);
    expect(result.dispatcher.ofType('player:combat:assist').length).toBe(assistFrames.length);
    expect(result.dispatcher.ofType('player:combat:assist').filter(e => e.data.assist_count === 2).length).toBe(3);
    expect(result.dispatcher.ofType('player:resources:level_up').length).toBe((last?.hero?.level ?? 1) - 1);
  });

  test('map events are emitted once per distinct entry', () => {
    const distinct = new Set<string>();
    for (const f of frames) {
      for (const e of f.payload.events ?? []) {
        distinct.add(`${f.payload.map?.matchid}|${JSON.stringify(e)}`);
      }
    }
    expect(distinct.size).toBe(12);
    expect(result.dispatcher.ofType('map:bounty_rune_pickup').length).toBe(distinct.size);
  });

  test('hero status flags produce events on both edges', () => {
    const stunned = result.dispatcher.ofType('player:status:stunned');
    expect(stunned.filter(e => e.data.active === true).length).toBe(6);
    expect(stunned.filter(e => e.data.active === false).length).toBe(6);
  });

  test('the 49 minute gap produces one disconnect and a reconnect', () => {
    expect(result.dispatcher.ofType('gsi:disconnected').length).toBe(1);
    expect(result.dispatcher.ofType('gsi:connected').length).toBe(2);
  });

  test('emits no detector errors', () => {
    expect(result.dispatcher.ofType('gsi:error')).toEqual([]);
  });
});

/** Minimal in-game frame; `previously` carries only the fields that changed, as Dota sends them. */
function frame(t: number, hero: Partial<Dota2GameState['hero']>, previously?: Partial<Dota2GameState>): FixtureFrame {
  return {
    t: new Date(1_700_000_000_000 + t * 1000).toISOString(),
    payload: {
      provider: { name: 'Dota 2', appid: 570, version: 48, timestamp: t },
      map: {
        name: 'start', matchid: '1', game_time: t, clock_time: t, daytime: true, nightstalker_night: false,
        radiant_score: 0, dire_score: 0, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS', paused: false,
        win_team: 'none', customgamename: '', ward_purchase_cooldown: 0
      },
      player: { kills: 0, deaths: 0, assists: 0, gold: 2000, team_name: 'radiant', name: 'p', steamid: '1', accountid: '1' } as Dota2GameState['player'],
      hero: {
        name: 'npc_dota_hero_mirana', id: 9, level: 12, alive: true, respawn_seconds: 0, buyback_cost: 1250,
        buyback_cooldown: 0, health: 1500, max_health: 1500, health_percent: 100, mana: 500, max_mana: 500, mana_percent: 100,
        ...hero
      } as Dota2GameState['hero'],
      ...(previously ? { previously } : {})
    }
  };
}

describe('synthetic sequences', () => {
  test('heartbeats and a pause gap never restart the game or the death sequence', async () => {
    const dead = { alive: false, respawn_seconds: 40, health: 0, health_percent: 0 };
    const seq = [
      frame(0, {}),                                                        // cold start, alive
      frame(5, {}),                                                        // heartbeat, no previously
      frame(6, dead, { hero: { alive: true, health: 1500 } as Dota2GameState['hero'] }),
      frame(30, { ...dead, respawn_seconds: 16 }),                         // 24 s gap: watchdog disconnect, then no previously
      frame(38, { alive: true }, { hero: { alive: false } as Dota2GameState['hero'] })
    ];
    const { dispatcher } = await replayFrames(seq);
    expect(dispatcher.sequence()).toEqual([
      'gsi:connected', 'game:started',
      'player:combat:death',
      'gsi:disconnected', 'gsi:connected',
      'player:combat:respawn'
    ]);
    expect(dispatcher.ofType('game:started')[0]?.data.cold_start).toBe(true);
  });

  test('cold start while dead reports the death with the remaining timer', async () => {
    const { dispatcher } = await replayFrames([frame(100, { alive: false, respawn_seconds: 22, health: 0 })]);
    expect(dispatcher.sequence()).toEqual(['gsi:connected', 'game:started', 'player:combat:death']);
    expect(dispatcher.ofType('player:combat:death')[0]?.data.respawn_seconds).toBe(22);
  });

  test('buyback is detected from buyback_cooldown and flags the respawn', async () => {
    const seq = [
      frame(0, {}),
      frame(1, { alive: false, respawn_seconds: 50, health: 0 }, { hero: { alive: true, health: 1500 } as Dota2GameState['hero'] }),
      frame(3, { alive: false, respawn_seconds: 48, buyback_cooldown: 480 },
        { hero: { respawn_seconds: 49, buyback_cooldown: 0 } as Dota2GameState['hero'], player: { gold: 2000 } as Dota2GameState['player'] }),
      frame(4, { alive: true, respawn_seconds: 0 }, { hero: { alive: false, respawn_seconds: 48 } as Dota2GameState['hero'] })
    ];
    const { dispatcher } = await replayFrames(seq);
    expect(dispatcher.sequence()).toEqual([
      'gsi:connected', 'game:started', 'player:combat:death', 'player:combat:buyback', 'player:combat:respawn'
    ]);
    expect(dispatcher.ofType('player:combat:respawn')[0]?.data.buyback).toBe(true);
    expect(dispatcher.ofType('player:combat:buyback')[0]?.data.buyback_cost).toBe(1250);
  });

  test('a changed win_team ends the match before POST_GAME arrives', async () => {
    const last = frame(900, {}, { map: { win_team: 'none' } as Dota2GameState['map'] });
    last.payload.map!.win_team = 'dire';
    const { dispatcher } = await replayFrames([frame(899, {}), last]);
    expect(dispatcher.sequence()).toEqual(['gsi:connected', 'game:started', 'game:ended']);
    expect(dispatcher.ofType('game:ended')[0]?.data.victory).toBe(false);
  });

  test('unknown effect config keys are rejected at load time', async () => {
    const { isGameEventType } = await import('../src/game/events');
    expect(isGameEventType('player:combat:kill')).toBe(true);
    expect(isGameEventType('player.combat.kill')).toBe(false);
    expect(isGameEventType('map:roshan_killed')).toBe(true);
  });
});
