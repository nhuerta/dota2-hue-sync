export const GAME_EVENTS = {
    GSI: {
        CONNECTED: 'gsi:connected',
        DISCONNECTED: 'gsi:disconnected',
        DATA: 'gsi:data',
        ERROR: 'gsi:error'
    },
    GAME: {
        RESET: 'game:reset',
        STARTED: 'game:started',
        PAUSED: 'game:paused',
        UNPAUSED: 'game:unpaused',
        ENDED: 'game:ended',
        SCORE_CHANGED: 'game:score_changed',
        DAY_NIGHT_CHANGED: 'game:day_night_changed'
    },
    PLAYER: {
        COMBAT: {
            KILL: 'player:combat:kill',
            DEATH: 'player:combat:death',
            ASSIST: 'player:combat:assist',
            RESPAWN: 'player:combat:respawn',
            BUYBACK: 'player:combat:buyback',
        },
        RESOURCES: {
            HEALTH_CHANGED: 'player:resources:health_changed',
            MANA_CHANGED: 'player:resources:mana_changed',
            GOLD_CHANGED: 'player:resources:gold_changed',
            LEVEL_UP: 'player:resources:level_up',
        },
        ITEMS: {
            USED: 'player:items:used',
            PURCHASED: 'player:items:purchased',
            DROPPED: 'player:items:dropped',
        },
        ABILITIES: {
            USED: 'player:abilities:used',
            UPGRADED: 'player:abilities:upgraded',
        },
    },
    HEROES: {
        MIRANA: {
            ARROW_CAST: 'hero:mirana:arrow_cast',
            STARFALL: 'hero:mirana:starfall',
            LEAP: 'hero:mirana:leap',
            MOONLIGHT: 'hero:mirana:moonlight'
        },
        WEAVER: {
            THE_SWARM: 'hero:weaver:the_swarm',
            SHUKUCHI: 'hero:weaver:shukuchi',
            GERMINATE_ATTACK: 'hero:weaver:germinate_attack',
            TIME_LAPSE: 'hero:weaver:time_lapse'
        },
        DARK_SEER: {
            VACUUM: 'hero:dark_seer:vacuum',
            ION_SHELL: 'hero:dark_seer:ion_shell',
            SURGE: 'hero:dark_seer:surge',
            WALL_OF_REPLICA: 'hero:dark_seer:wall_of_replica'
        },
        ENCHANTRESS: {
            UNTOUCHABLE: 'hero:enchantress:untouchable',
            ENCHANT: 'hero:enchantress:enchant',
            NATURES_ATTENDANTS: 'hero:enchantress:natures_attendants',
            IMPETUS: 'hero:enchantress:impetus'
        },
        SPECTRE: {
            SPECTRAL_DAGGER: 'hero:spectre:spectral_dagger',
            DESOLATE: 'hero:spectre:desolate',
            DISPERSION: 'hero:spectre:dispersion',
            HAUNT: 'hero:spectre:haunt'
        }
    },
} as const;
export type GameEventType =
  | 'gsi:connected' | 'gsi:disconnected' | 'gsi:data' | 'gsi:error'
  | 'game:reset' | 'game:started' | 'game:paused' | 'game:unpaused' | 'game:ended' | 'game:score_changed' | 'game:day_night_changed'
  | 'player:combat:kill' | 'player:combat:death' | 'player:combat:assist' | 'player:combat:respawn' | 'player:combat:buyback'
  | 'player:resources:health_changed' | 'player:resources:mana_changed' | 'player:resources:gold_changed' | 'player:resources:level_up'
  | 'player:items:used' | 'player:items:purchased' | 'player:items:dropped'
  | 'player:abilities:used' | 'player:abilities:upgraded'
  | 'hero:mirana:arrow_cast' | 'hero:mirana:starfall' | 'hero:mirana:leap' | 'hero:mirana:moonlight'
  | 'hero:weaver:the_swarm' | 'hero:weaver:shukuchi' | 'hero:weaver:germinate_attack' | 'hero:weaver:time_lapse'
  | 'hero:dark_seer:vacuum' | 'hero:dark_seer:ion_shell' | 'hero:dark_seer:surge' | 'hero:dark_seer:wall_of_replica'
  | 'hero:enchantress:untouchable' | 'hero:enchantress:enchant' | 'hero:enchantress:natures_attendants' | 'hero:enchantress:impetus'
  | 'hero:spectre:spectral_dagger' | 'hero:spectre:desolate' | 'hero:spectre:dispersion' | 'hero:spectre:haunt';
export type EventData = Record<string, unknown>;
export interface GameEvent {
  type: GameEventType | string;
  timestamp: number;
  gameTime?: number;
  data: EventData;
}
export type EventHandler = (event: GameEvent) => void | Promise<void>;
// High-frequency events that would flood the console (every 100 ms tick)
const QUIET_EVENTS = new Set<string>([
  'gsi:data',
  'player:resources:health_changed',
  'player:resources:mana_changed',
  'player:resources:gold_changed'
]);

export class EventDispatcher {
  private handlers: Map<GameEventType | string, Set<EventHandler>> = new Map();

  on(eventType: GameEventType, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  async emit(eventType: GameEventType | string, data: EventData, gameTime?: number): Promise<void> {
    const event: GameEvent = {
      type: eventType,
      timestamp: Date.now(),
      gameTime,
      data
    };
    if (!QUIET_EVENTS.has(eventType)) {
      const d = data as Record<string, unknown>;
      const extra = ['ability_name', 'kills', 'assists', 'level', 'health_percent', 'respawn_seconds', 'cold_start', 'error', 'context']
        .filter(k => d[k] !== undefined)
        .map(k => `${k}=${String(d[k])}`)
        .join(' ');
      console.log(`[event] ${eventType}${gameTime !== undefined ? ` t=${gameTime}` : ''}${extra ? ' ' + extra : ''}`);
    }
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const promises = [];
      for (const handler of handlers) {
        promises.push(
          Promise.resolve(handler(event)).catch(error => {
            console.error(`Error in event handler for ${eventType}:`, error);
            // Emit error event if this isn't already an error event (prevent infinite loop)
            if (eventType !== 'gsi:error') {
              this.emit('gsi:error', {
                error: String(error),
                context: 'event_handler',
                event_type: eventType,
                timestamp: Date.now()
              }).catch(err => {
                console.error('Failed to emit error event from handler:', err);
              });
            }
          })
        );
      }
      await Promise.all(promises);
    }
  }
}
