export const GAME_EVENTS = {
    GSI: {
        CONNECTED: 'gsi:connected',
        DISCONNECTED: 'gsi:disconnected',
        ERROR: 'gsi:error'
    },
    GAME: {
        STARTED: 'game:started',
        FIRST_BLOOD: 'game:first_blood',
        PAUSED: 'game:paused',
        UNPAUSED: 'game:unpaused',
        ENDED: 'game:ended',
        RECONNECTED: 'game:reconnected'
    },
    MAP: {
        COURIER_KILLED: 'map:courier_killed',
        ROSHAN_KILLED: 'map:roshan_killed',
        AEGIS_PICKED_UP: 'map:aegis_picked_up',
        AEGIS_DENIED: 'map:aegis_denied',
        BOUNTY_RUNE_PICKUP: 'map:bounty_rune_pickup',
        TIP: 'map:tip'
    },
    PLAYER: {
        COMBAT: {
            KILL: 'player:combat:kill',
            DEATH: 'player:combat:death',
            ASSIST: 'player:combat:assist',
            RESPAWN: 'player:combat:respawn',
            BUYBACK: 'player:combat:buyback',
            RESPAWN_TICK: 'player:combat:respawn_tick',
            MULTIKILL: 'player:combat:multikill',
            SPREE: 'player:combat:spree',
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
        STATUS: {
            SILENCED: 'player:status:silenced',
            STUNNED: 'player:status:stunned',
            DISARMED: 'player:status:disarmed',
            MAGIC_IMMUNE: 'player:status:magic_immune',
            HEXED: 'player:status:hexed',
            MUTED: 'player:status:muted',
            BREAK: 'player:status:break',
            SMOKED: 'player:status:smoked'
        },
    },
    HEROES: {
        MIRANA: {
            ARROW_CAST: 'hero:mirana:arrow_cast',
            STARFALL: 'hero:mirana:starfall',
            LEAP: 'hero:mirana:leap',
            MOONLIGHT: 'hero:mirana:moonlight',
            CELESTIAL_QUIVER: 'hero:mirana:celestial_quiver'
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
type Leaves<T> = T extends string ? T : { [K in keyof T]: Leaves<T[K]> }[keyof T];
/** Every event the detector can emit, derived from GAME_EVENTS so the two cannot drift apart. */
export type GameEventType = Leaves<typeof GAME_EVENTS>;

function collectLeaves(node: unknown, into: string[]): string[] {
  if (typeof node === 'string') {
    into.push(node);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      collectLeaves(value, into);
    }
  }
  return into;
}
export const ALL_EVENT_TYPES: ReadonlySet<string> = new Set(collectLeaves(GAME_EVENTS, []));
export function isGameEventType(value: string): value is GameEventType {
  return ALL_EVENT_TYPES.has(value);
}
export type EventData = Record<string, unknown>;
export interface GameEvent {
  type: GameEventType;
  timestamp: number;
  gameTime?: number;
  data: EventData;
}
export type EventHandler = (event: GameEvent) => void | Promise<void>;
// High-frequency events that would flood the console (every 100 ms tick)
const QUIET_EVENTS = new Set<string>([
  'player:combat:respawn_tick',
  'player:resources:health_changed',
  'player:resources:mana_changed',
  'player:resources:gold_changed'
]);

export class EventDispatcher {
  private handlers: Map<GameEventType, Set<EventHandler>> = new Map();

  on(eventType: GameEventType, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  async emit(eventType: GameEventType, data: EventData, gameTime?: number): Promise<void> {
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
