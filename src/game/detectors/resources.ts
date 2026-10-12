import { GAME_EVENTS } from '../events';
import { THRESHOLDS } from '../constants';
import type { Detector } from './types';

/** Level, gold, health and mana changes above their thresholds. Health and mana are 10 Hz events. */
export const resourceDetector: Detector = {
  name: 'resources',
  detect({ current, previous }, emit) {
    const hero = current.hero;
    const before = previous.hero;
    // Level 0 -> 1 is the hero being assigned at pick, not a level-up.
    if (hero && before?.level !== undefined && before.level > 0 && hero.level > before.level) {
      emit(GAME_EVENTS.PLAYER.RESOURCES.LEVEL_UP, { level: hero.level, previous_level: before.level });
    }
    if (previous.player?.gold !== undefined && current.player?.gold !== undefined) {
      const delta = current.player.gold - previous.player.gold;
      if (Math.abs(delta) > THRESHOLDS.GOLD_CHANGE_MIN) {
        emit(GAME_EVENTS.PLAYER.RESOURCES.GOLD_CHANGED, {
          gold: current.player.gold,
          gold_change: delta,
          reliable: current.player.gold_reliable,
          unreliable: current.player.gold_unreliable
        });
      }
    }
    if (!hero || !before) {
      return;
    }
    if (before.health !== undefined) {
      const delta = hero.health - before.health;
      if (Math.abs(delta) > THRESHOLDS.HEALTH_CHANGE_MIN) {
        emit(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED, {
          health: hero.health,
          max_health: hero.max_health,
          health_change: delta,
          health_percent: hero.max_health > 0 ? (hero.health / hero.max_health) * 100 : 0
        });
      }
    }
    if (before.mana !== undefined) {
      const delta = hero.mana - before.mana;
      if (Math.abs(delta) > THRESHOLDS.MANA_CHANGE_MIN) {
        emit(GAME_EVENTS.PLAYER.RESOURCES.MANA_CHANGED, {
          mana: hero.mana,
          max_mana: hero.max_mana,
          mana_change: delta,
          mana_percent: hero.max_mana > 0 ? (hero.mana / hero.max_mana) * 100 : 0
        });
      }
    }
  }
};
