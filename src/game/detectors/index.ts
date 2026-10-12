import { GAME_EVENTS, type EventData, type GameEventType } from '../events';
import { GAME_STATES } from '../constants';
import { getNumber } from '../../util/number';
import type { Dota2GameState } from '../dota2-types';
import type { DetectedEvent, Detector, Frame } from './types';
import { abilityDetector } from './abilities';
import { itemDetector } from './items';
import { CombatDetector, emitDeath } from './combat';
import { resourceDetector } from './resources';
import { statusDetector } from './status';
import { MapEventDetector } from './map-events';
import { GameStateDetector, healthPercent } from './game-state';

export type { DetectedEvent, Detector, Frame } from './types';

/** Fields every event carries, built once per frame. */
function commonData(frame: Dota2GameState): EventData {
  return {
    hero_name: frame.hero?.name,
    hero_level: frame.hero?.level,
    team: frame.player?.team_name,
    match_id: frame.map?.matchid,
    game_time: getNumber(frame.map?.game_time),
    clock_time: getNumber(frame.map?.clock_time),
    game_state: frame.map?.game_state
  };
}

/**
 * Turns consecutive GSI frames into game events by running every detector over the pair.
 *
 * Dota only includes a `previously` block when something changed. Heartbeat frames and the first
 * frame after a pause carry none, so the last frame seen is used instead. Only the very first
 * frame, or a change of match id, is a cold start: the state the lights should already be in
 * is synthesised rather than diffed.
 */
export class GameEventDetector {
  private readonly detectors: readonly Detector[];
  private lastFrame: Dota2GameState | null = null;

  constructor(detectors: readonly Detector[] = [
    abilityDetector,
    itemDetector,
    new CombatDetector(),
    resourceDetector,
    statusDetector,
    new MapEventDetector(),
    new GameStateDetector()
  ]) {
    this.detectors = detectors;
  }

  /** Forget everything; the next frame is treated as a cold start again. */
  reset(): void {
    this.lastFrame = null;
    for (const detector of this.detectors) {
      detector.reset?.();
    }
  }

  detect(current: Dota2GameState): DetectedEvent[] {
    const events: DetectedEvent[] = [];
    const common = commonData(current);
    const gameTime = getNumber(current.map?.game_time);
    const emit = (type: GameEventType, data: EventData = {}, at: number = gameTime) => {
      events.push({ type, data: { ...common, ...data }, gameTime: at });
    };

    const previous = current.previously ?? this.lastFrame ?? undefined;
    const matchChanged = previous?.map?.matchid !== undefined && current.map?.matchid !== undefined
      && previous.map.matchid !== current.map.matchid;
    if (!previous || matchChanged) {
      // Diffing a new match against the old one would report every item as sold and every
      // counter as reset, so start fresh instead.
      this.reset();
      this.coldStart(current, emit);
    } else {
      const frame: Frame = { current, previous, gameTime };
      for (const detector of this.detectors) {
        try {
          detector.detect(frame, emit);
        } catch (error) {
          emit(GAME_EVENTS.GSI.ERROR, { error: String(error), context: detector.name });
        }
      }
    }
    this.lastFrame = current;
    return events;
  }

  /** First frame this detector has seen for this match: synthesise the state the lights should be in. */
  private coldStart(frame: Dota2GameState, emit: (type: GameEventType, data?: EventData) => void): void {
    if (frame.map?.game_state !== GAME_STATES.GAME_IN_PROGRESS) {
      return;
    }
    emit(GAME_EVENTS.GAME.STARTED, { cold_start: true, health_percent: healthPercent(frame) });
    if (frame.hero?.alive === false) {
      emitDeath(frame, frame.hero.health ?? 0, emit, true);
    }
  }
}
