import { GAME_EVENTS } from '../events';
import { KILL_STREAK, RESPAWN_FORMULA } from '../constants';
import { getNumber } from '../../util/number';
import type { Dota2GameState } from '../dota2-types';
import type { Detector, Emit } from './types';

/** Respawn time from the frame, or the level formula when Dota has not filled it in yet. */
export function respawnSeconds(current: Dota2GameState): { seconds: number; source: 'GSI' | 'CALCULATED' } {
  const fromGame = current.hero?.respawn_seconds;
  if (fromGame) {
    return { seconds: fromGame, source: 'GSI' };
  }
  const level = getNumber(current.hero?.level, 1);
  return {
    seconds: Math.min(RESPAWN_FORMULA.BASE + (level - 1) * RESPAWN_FORMULA.PER_LEVEL, RESPAWN_FORMULA.MAX),
    source: 'CALCULATED'
  };
}

export function emitDeath(current: Dota2GameState, previousHealth: number, emit: Emit, coldStart = false): void {
  const respawn = respawnSeconds(current);
  emit(GAME_EVENTS.PLAYER.COMBAT.DEATH, {
    previous_health: previousHealth,
    respawn_seconds: respawn.seconds,
    respawn_source: respawn.source,
    cold_start: coldStart,
    kills: getNumber(current.player?.kills),
    deaths: getNumber(current.player?.deaths),
    assists: getNumber(current.player?.assists)
  });
}

/**
 * Death and respawn follow `hero.alive`. Buyback is the only thing that raises
 * `hero.buyback_cooldown`, so a rise is a buyback and the respawn that follows is flagged.
 * Kills feed multikill (consecutive kills inside the window) and `kill_streak` feeds sprees.
 */
export class CombatDetector implements Detector {
  readonly name = 'combat';
  private buybackPending = false;
  private lastKillGameTime: number | null = null;
  private multikill = 0;

  reset(): void {
    this.buybackPending = false;
    this.lastKillGameTime = null;
    this.multikill = 0;
  }

  detect({ current, previous, gameTime }: { current: Dota2GameState; previous: Partial<Dota2GameState>; gameTime: number }, emit: Emit): void {
    const hero = current.hero;
    const before = previous.hero;
    if (hero && before) {
      if (before.alive === true && hero.alive === false) {
        this.buybackPending = false;
        emitDeath(current, getNumber(before.health), emit);
      }
      if (before.buyback_cooldown !== undefined && hero.buyback_cooldown !== undefined && hero.buyback_cooldown > before.buyback_cooldown) {
        this.buybackPending = true;
        const goldDelta = previous.player?.gold !== undefined && current.player?.gold !== undefined
          ? current.player.gold - previous.player.gold
          : 0;
        emit(GAME_EVENTS.PLAYER.COMBAT.BUYBACK, {
          respawn_seconds_remaining: getNumber(hero.respawn_seconds),
          buyback_cooldown: hero.buyback_cooldown,
          buyback_cost: getNumber(before.buyback_cost ?? hero.buyback_cost),
          ...(goldDelta < 0 ? { gold_cost: -goldDelta } : {})
        });
      }
      if (hero.alive === false && before.respawn_seconds !== undefined && hero.respawn_seconds !== undefined &&
          hero.respawn_seconds !== before.respawn_seconds) {
        emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN_TICK, { respawn_seconds: hero.respawn_seconds });
      }
      if (before.alive === false && hero.alive === true) {
        const buyback = this.buybackPending;
        this.buybackPending = false;
        emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN, { health: hero.health, max_health: hero.max_health, buyback });
      }
    }

    const player = current.player;
    const playerBefore = previous.player;
    if (!player || !playerBefore) {
      return;
    }
    if (playerBefore.kills !== undefined && player.kills > playerBefore.kills) {
      const killCount = player.kills - playerBefore.kills;
      emit(GAME_EVENTS.PLAYER.COMBAT.KILL, {
        kills: player.kills,
        deaths: getNumber(player.deaths),
        assists: getNumber(player.assists),
        kill_streak: getNumber(player.kill_streak),
        kill_count: killCount,
        kill_list: player.kill_list
      });
      const withinWindow = this.lastKillGameTime !== null && gameTime - this.lastKillGameTime <= KILL_STREAK.MULTIKILL_WINDOW_S;
      this.multikill = withinWindow ? this.multikill + killCount : killCount;
      this.lastKillGameTime = gameTime;
      if (this.multikill >= 2) {
        emit(GAME_EVENTS.PLAYER.COMBAT.MULTIKILL, {
          multikill: this.multikill,
          multikill_name: KILL_STREAK.MULTIKILL_NAMES[Math.min(this.multikill, 5)]
        });
      }
    }
    if (playerBefore.assists !== undefined && player.assists > playerBefore.assists) {
      emit(GAME_EVENTS.PLAYER.COMBAT.ASSIST, {
        assists: player.assists,
        assist_count: player.assists - playerBefore.assists,
        kills: getNumber(player.kills),
        deaths: getNumber(player.deaths)
      });
    }
    if (playerBefore.kill_streak !== undefined && player.kill_streak > playerBefore.kill_streak && player.kill_streak >= 3) {
      emit(GAME_EVENTS.PLAYER.COMBAT.SPREE, {
        kill_streak: player.kill_streak,
        spree: KILL_STREAK.SPREE_NAMES[Math.min(player.kill_streak, 10)]
      });
    }
  }
}
