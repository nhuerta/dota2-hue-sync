import { describe, expect, test } from 'bun:test';
import { itemDetector } from '../src/game/detectors/items';
import { CombatDetector } from '../src/game/detectors/combat';
import { abilityDetector } from '../src/game/detectors/abilities';
import type { DetectedEvent, Frame } from '../src/game/detectors/types';
import type { Dota2GameState } from '../src/game/dota2-types';
import type { EventData, GameEventType } from '../src/game/events';

/** Runs one detector over a hand-built pair of partial frames and returns what it emitted. */
function run(detector: { detect(frame: Frame, emit: (t: GameEventType, d?: EventData, g?: number) => void): void },
  current: Partial<Dota2GameState>, previous: Partial<Dota2GameState>, gameTime = 100): DetectedEvent[] {
  const events: DetectedEvent[] = [];
  detector.detect(
    { current: current as Dota2GameState, previous, gameTime },
    (type, data = {}, at = gameTime) => events.push({ type, data, gameTime: at })
  );
  return events;
}

const item = (name: string, extra: Record<string, unknown> = {}) => ({ name, ...extra });

describe('item detector', () => {
  test('a recipe combine is one purchase listing its components, and no drops', () => {
    const events = run(itemDetector,
      { items: { slot0: item('item_ultimate_scepter'), slot1: item('empty'), slot2: item('empty') }, player: { gold: 100 } as Dota2GameState['player'] },
      { items: { slot0: item('item_staff_of_wizardry'), slot1: item('item_point_booster'), slot2: item('item_ogre_axe') }, player: { gold: 1500 } as Dota2GameState['player'] });
    expect(events.map(e => e.type)).toEqual(['player:items:purchased']);
    expect(events[0]?.data.combined_from).toEqual(['item_staff_of_wizardry', 'item_point_booster', 'item_ogre_axe']);
    expect(events[0]?.data.gold_spent).toBe(1400);
  });

  test('moving an item between slots emits nothing', () => {
    const events = run(itemDetector,
      { items: { slot0: item('empty'), slot3: item('item_branches') } },
      { items: { slot0: item('item_branches'), slot3: item('empty') } });
    expect(events).toEqual([]);
  });

  test('a sold item is a drop with the gold gained; a used-up consumable is a plain drop', () => {
    const sold = run(itemDetector,
      { items: { slot0: item('empty') }, player: { gold: 900 } as Dota2GameState['player'] },
      { items: { slot0: item('item_boots') }, player: { gold: 500 } as Dota2GameState['player'] });
    expect(sold[0]?.data).toMatchObject({ item_name: 'item_boots', sold: true, gold_gained: 400 });
    const used = run(itemDetector,
      { items: { slot0: item('empty') }, player: { gold: 502 } as Dota2GameState['player'] },
      { items: { slot0: item('item_flask', { charges: 1 }) }, player: { gold: 500 } as Dota2GameState['player'] });
    expect(used.map(e => e.type)).toEqual(['player:items:dropped']);
    expect(used[0]?.data.sold).toBeUndefined();
  });

  test('a cooldown leaving zero is a use, and a mapped item also gets its own event', () => {
    const events = run(itemDetector,
      { items: { slot0: item('item_blink', { cooldown: 12 }) } },
      { items: { slot0: item('item_blink', { cooldown: 0 }) } });
    expect(events.map(e => e.type)).toEqual(['player:items:used', 'item:blink']);
    // a charge being consumed later (a TP finishing its channel) is a use but not a second cast
    const charge = run(itemDetector,
      { items: { slot0: item('item_tpscroll', { cooldown: 90, charges: 1 }) } },
      { items: { slot0: item('item_tpscroll', { cooldown: 90, charges: 2 }) } });
    expect(charge.map(e => e.type)).toEqual(['player:items:used']);
  });
});

describe('combat detector', () => {
  const hero = (extra: Record<string, unknown>) => ({ alive: true, health: 1000, respawn_seconds: 0, buyback_cooldown: 0, level: 10, ...extra });

  test('death carries the respawn timer from the game, or the level formula when missing', () => {
    const detector = new CombatDetector();
    const fromGame = run(detector, { hero: hero({ alive: false, health: 0, respawn_seconds: 40 }) as Dota2GameState['hero'] }, { hero: { alive: true, health: 300 } as Dota2GameState['hero'] });
    expect(fromGame[0]?.data).toMatchObject({ respawn_seconds: 40, respawn_source: 'GSI', previous_health: 300 });
    const computed = run(detector, { hero: hero({ alive: false, health: 0, respawn_seconds: 0, level: 5 }) as Dota2GameState['hero'] }, { hero: { alive: true } as Dota2GameState['hero'] });
    expect(computed[0]?.data).toMatchObject({ respawn_seconds: 20, respawn_source: 'CALCULATED' });
  });

  test('buyback cooldown rising is a buyback and flags the next respawn', () => {
    const detector = new CombatDetector();
    run(detector, { hero: hero({ alive: false, health: 0, respawn_seconds: 50 }) as Dota2GameState['hero'] }, { hero: { alive: true } as Dota2GameState['hero'] });
    const buyback = run(detector, { hero: hero({ alive: false, buyback_cooldown: 480, respawn_seconds: 48 }) as Dota2GameState['hero'] }, { hero: { buyback_cooldown: 0 } as Dota2GameState['hero'] });
    expect(buyback.map(e => e.type)).toEqual(['player:combat:buyback']);
    const respawn = run(detector, { hero: hero({}) as Dota2GameState['hero'] }, { hero: { alive: false } as Dota2GameState['hero'] });
    expect(respawn[0]?.data.buyback).toBe(true);
    const natural = run(detector, { hero: hero({}) as Dota2GameState['hero'] }, { hero: { alive: false } as Dota2GameState['hero'] });
    expect(natural[0]?.data.buyback).toBe(false);
  });

  test('kills inside the window stack into a multikill; the streak field drives sprees', () => {
    const detector = new CombatDetector();
    const player = (kills: number, streak: number) => ({ kills, kill_streak: streak, assists: 0, deaths: 0 });
    const first = run(detector, { player: player(1, 1) as Dota2GameState['player'] }, { player: player(0, 0) as Dota2GameState['player'] }, 100);
    expect(first.map(e => e.type)).toEqual(['player:combat:kill']);
    const second = run(detector, { player: player(2, 2) as Dota2GameState['player'] }, { player: player(1, 1) as Dota2GameState['player'] }, 110);
    expect(second.map(e => e.type)).toEqual(['player:combat:kill', 'player:combat:multikill']);
    expect(second[1]?.data.multikill_name).toBe('double_kill');
    const third = run(detector, { player: player(3, 3) as Dota2GameState['player'] }, { player: player(2, 2) as Dota2GameState['player'] }, 150);
    expect(third.map(e => e.type)).toEqual(['player:combat:kill', 'player:combat:spree']);
    expect(third[1]?.data.spree).toBe('killing_spree');
  });
});

describe('ability detector', () => {
  test('a cast emits the generic event and the hero-specific one with the mana cost', () => {
    const events = run(abilityDetector,
      { hero: { name: 'npc_dota_hero_mirana', mana: 350 } as Dota2GameState['hero'], abilities: { ability0: { name: 'mirana_celestial_quiver', cooldown: 8, level: 1, can_cast: false, passive: false, ability_active: true, ultimate: false } } },
      { hero: { mana: 400 } as Dota2GameState['hero'], abilities: { ability0: { cooldown: 0 } as Dota2GameState['abilities'] extends Record<string, infer A> ? A : never } });
    expect(events.map(e => e.type)).toEqual(['player:abilities:used', 'hero:mirana:celestial_quiver']);
    expect(events[0]?.data.mana_cost).toBe(50);
  });
});
