import { GAME_EVENTS } from '../events';
import { GAME_STATES } from '../constants';
import { getNumber } from '../../util/number';
import type { Dota2GameState } from '../dota2-types';
import type { Detector, Emit, Frame } from './types';

export function healthPercent(frame: Dota2GameState): number {
  const hero = frame.hero;
  return hero && hero.max_health ? (hero.health / hero.max_health) * 100 : 100;
}

/** Match start, end, reconnect, first blood and pauses. End fires once per match id. */
export class GameStateDetector implements Detector {
  readonly name = 'game-state';
  private endedMatchId: string | null = null;

  reset(): void {
    this.endedMatchId = null;
  }

  detect({ current, previous }: Frame, emit: Emit): void {
    const matchId = current.map?.matchid ?? '';
    const before = previous.map?.game_state;
    const after = current.map?.game_state;
    if (before !== undefined && after !== undefined && before !== after) {
      if (before === GAME_STATES.DISCONNECT) {
        emit(GAME_EVENTS.GAME.RECONNECTED, { health_percent: healthPercent(current) });
      }
      if (after === GAME_STATES.GAME_IN_PROGRESS) {
        emit(GAME_EVENTS.GAME.STARTED, { health_percent: healthPercent(current) });
      }
      if (after === GAME_STATES.POST_GAME) {
        this.emitEnded(current, matchId, emit);
      }
    }
    // `previously` only carries the score that changed; the other one is unchanged from `current`.
    const scoreChanged = previous.map?.radiant_score !== undefined || previous.map?.dire_score !== undefined;
    if (scoreChanged && current.map) {
      const prevScore = getNumber(previous.map?.radiant_score, current.map.radiant_score) + getNumber(previous.map?.dire_score, current.map.dire_score);
      if (prevScore === 0 && current.map.radiant_score + current.map.dire_score > 0) {
        const team = current.map.radiant_score > 0 ? 'radiant' : 'dire';
        emit(GAME_EVENTS.GAME.FIRST_BLOOD, {
          team,
          own_team: current.player?.team_name === team,
          own_kill: (current.player?.kills ?? 0) > getNumber(previous.player?.kills, current.player?.kills ?? 0)
        });
      }
    }
    // Dota sometimes stops posting before POST_GAME; the winner is set a frame or two earlier.
    if (previous.map?.win_team === 'none' && current.map?.win_team !== undefined && current.map.win_team !== 'none') {
      this.emitEnded(current, matchId, emit);
    }
    if (previous.map?.paused !== undefined && current.map?.paused !== undefined && previous.map.paused !== current.map.paused) {
      emit(current.map.paused ? GAME_EVENTS.GAME.PAUSED : GAME_EVENTS.GAME.UNPAUSED);
    }
  }

  private emitEnded(current: Dota2GameState, matchId: string, emit: Emit): void {
    if (this.endedMatchId === matchId) {
      return;
    }
    this.endedMatchId = matchId;
    emit(GAME_EVENTS.GAME.ENDED, {
      victory: current.player?.team_name === current.map?.win_team,
      winner: current.map?.win_team,
      player_team: current.player?.team_name,
      radiant_score: getNumber(current.map?.radiant_score),
      dire_score: getNumber(current.map?.dire_score)
    });
  }
}
