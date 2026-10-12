import { GAME_EVENTS, type GameEventType } from '../events';
import { getNumber } from '../../util/number';
import type { GameEvent as MapEvent } from '../dota2-types';
import type { Detector, Emit, Frame } from './types';

/** `events[]` entries from the map node, keyed by their `event_type`. */
const MAP_EVENT_MAP: Readonly<Record<string, GameEventType>> = {
  courier_killed: GAME_EVENTS.MAP.COURIER_KILLED,
  roshan_killed: GAME_EVENTS.MAP.ROSHAN_KILLED,
  aegis_picked_up: GAME_EVENTS.MAP.AEGIS_PICKED_UP,
  aegis_denied: GAME_EVENTS.MAP.AEGIS_DENIED,
  bounty_rune_pickup: GAME_EVENTS.MAP.BOUNTY_RUNE_PICKUP,
  tip: GAME_EVENTS.MAP.TIP
};

/** The `events[]` node repeats recent entries on every frame; each distinct entry is emitted once. */
export class MapEventDetector implements Detector {
  readonly name = 'map-events';
  private seen = new Set<string>();

  reset(): void {
    this.seen.clear();
  }

  detect({ current }: Frame, emit: Emit): void {
    if (!Array.isArray(current.events) || current.events.length === 0) {
      return;
    }
    const matchId = current.map?.matchid ?? '';
    const ownTeam = current.player?.team_name;
    for (const mapEvent of current.events as MapEvent[]) {
      const key = `${matchId}|${JSON.stringify(mapEvent)}`;
      if (this.seen.has(key)) {
        continue;
      }
      this.seen.add(key);
      const eventType = MAP_EVENT_MAP[mapEvent.event_type];
      if (!eventType) {
        continue;
      }
      emit(eventType, {
        ...mapEvent,
        own_team: ownTeam !== undefined && (mapEvent.team === ownTeam || mapEvent.killer_team === ownTeam)
      }, getNumber(mapEvent.game_time, getNumber(current.map?.game_time)));
    }
  }
}
