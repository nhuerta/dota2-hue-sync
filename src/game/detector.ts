import { EventDispatcher, type EventData, type GameEventType } from './events';
import { GAME_EVENTS } from './events';
import type { Dota2GameState, GameEvent as MapEvent, Hero } from './dota2-types';
import { getNumber } from '../server/utils';
import { THRESHOLDS, RESPAWN_FORMULA, GAME_STATES } from './constants';

const HERO_ABILITY_MAP: Record<string, Record<string, GameEventType>> = {
  'npc_dota_hero_mirana': {
    'mirana_arrow': GAME_EVENTS.HEROES.MIRANA.ARROW_CAST,
    'mirana_starfall': GAME_EVENTS.HEROES.MIRANA.STARFALL,
    'mirana_leap': GAME_EVENTS.HEROES.MIRANA.LEAP,
    'mirana_invis': GAME_EVENTS.HEROES.MIRANA.MOONLIGHT,
    'mirana_moonlight': GAME_EVENTS.HEROES.MIRANA.MOONLIGHT
  },
  'npc_dota_hero_weaver': {
    'weaver_the_swarm': GAME_EVENTS.HEROES.WEAVER.THE_SWARM,
    'weaver_shukuchi': GAME_EVENTS.HEROES.WEAVER.SHUKUCHI,
    'weaver_geminate_attack': GAME_EVENTS.HEROES.WEAVER.GERMINATE_ATTACK,
    'weaver_time_lapse': GAME_EVENTS.HEROES.WEAVER.TIME_LAPSE
  },
  'npc_dota_hero_dark_seer': {
    'dark_seer_vacuum': GAME_EVENTS.HEROES.DARK_SEER.VACUUM,
    'dark_seer_ion_shell': GAME_EVENTS.HEROES.DARK_SEER.ION_SHELL,
    'dark_seer_surge': GAME_EVENTS.HEROES.DARK_SEER.SURGE,
    'dark_seer_wall_of_replica': GAME_EVENTS.HEROES.DARK_SEER.WALL_OF_REPLICA
  },
  'npc_dota_hero_enchantress': {
    'enchantress_untouchable': GAME_EVENTS.HEROES.ENCHANTRESS.UNTOUCHABLE,
    'enchantress_enchant': GAME_EVENTS.HEROES.ENCHANTRESS.ENCHANT,
    'enchantress_natures_attendants': GAME_EVENTS.HEROES.ENCHANTRESS.NATURES_ATTENDANTS,
    'enchantress_impetus': GAME_EVENTS.HEROES.ENCHANTRESS.IMPETUS
  },
  'npc_dota_hero_spectre': {
    'spectre_spectral_dagger': GAME_EVENTS.HEROES.SPECTRE.SPECTRAL_DAGGER,
    'spectre_desolate': GAME_EVENTS.HEROES.SPECTRE.DESOLATE,
    'spectre_dispersion': GAME_EVENTS.HEROES.SPECTRE.DISPERSION,
    'spectre_haunt': GAME_EVENTS.HEROES.SPECTRE.HAUNT,
    'spectre_reality': GAME_EVENTS.HEROES.SPECTRE.HAUNT
  }
} as const;

/** Hero status flags turned into `player:status:*` events on both edges. */
const STATUS_FLAGS: Record<string, GameEventType> = {
  silenced: GAME_EVENTS.PLAYER.STATUS.SILENCED,
  stunned: GAME_EVENTS.PLAYER.STATUS.STUNNED,
  disarmed: GAME_EVENTS.PLAYER.STATUS.DISARMED,
  magicimmune: GAME_EVENTS.PLAYER.STATUS.MAGIC_IMMUNE,
  hexed: GAME_EVENTS.PLAYER.STATUS.HEXED,
  muted: GAME_EVENTS.PLAYER.STATUS.MUTED,
  break: GAME_EVENTS.PLAYER.STATUS.BREAK,
  smoked: GAME_EVENTS.PLAYER.STATUS.SMOKED
};

/** `events[]` entries from the map node, keyed by their `event_type`. */
const MAP_EVENT_MAP: Record<string, GameEventType> = {
  courier_killed: GAME_EVENTS.MAP.COURIER_KILLED,
  roshan_killed: GAME_EVENTS.MAP.ROSHAN_KILLED,
  aegis_picked_up: GAME_EVENTS.MAP.AEGIS_PICKED_UP,
  aegis_denied: GAME_EVENTS.MAP.AEGIS_DENIED,
  bounty_rune_pickup: GAME_EVENTS.MAP.BOUNTY_RUNE_PICKUP,
  tip: GAME_EVENTS.MAP.TIP
};

/** Gold gained in one tick that cannot be explained by passive income; above it a vanished item was sold. */
const SOLD_GOLD_MIN = 10;

/**
 * Turns consecutive GSI frames into game events.
 *
 * Dota only includes a `previously` block when something changed. Heartbeat frames and the first
 * frame after a pause carry none, so the detector keeps the last frame it saw and diffs against
 * that whenever `previously` is missing. Only the very first frame is a cold start.
 */
export class GameEventDetector {
  private eventDispatcher: EventDispatcher;
  private lastFrame: Dota2GameState | null = null;
  private endedMatchId: string | null = null;
  private buybackPending = false;
  private seenMapEvents = new Set<string>();

  constructor(eventDispatcher: EventDispatcher) {
    this.eventDispatcher = eventDispatcher;
  }

  /** Forget everything; the next frame is treated as a cold start again. */
  reset(): void {
    this.lastFrame = null;
    this.endedMatchId = null;
    this.buybackPending = false;
    this.seenMapEvents.clear();
  }

  private buildCommonEventData(current: Dota2GameState, additionalData: Partial<EventData> = {}): EventData {
    return {
      hero_name: current.hero?.name,
      hero_id: current.hero?.id,
      hero_level: current.hero?.level,
      player_name: current.player?.name,
      steam_id: current.player?.steamid,
      account_id: current.player?.accountid,
      team: current.player?.team_name,
      match_id: current.map?.matchid,
      game_time: getNumber(current.map?.game_time),
      clock_time: getNumber(current.map?.clock_time),
      game_state: current.map?.game_state,
      timestamp: Date.now(),
      server_time: new Date().toISOString(),
      ...additionalData
    };
  }

  private healthPercent(hero: Hero | undefined): number {
    if (!hero || !hero.max_health) {
      return 100;
    }
    return (hero.health / hero.max_health) * 100;
  }

  async processGSIData(rawData: Dota2GameState): Promise<void> {
    try {
      const previous = rawData.previously ?? this.lastFrame;
      const matchChanged = previous?.map?.matchid !== undefined && rawData.map?.matchid !== undefined
        && previous.map.matchid !== rawData.map.matchid;
      if (!previous || matchChanged) {
        // First frame ever, or a new match: diffing against the old one would report every
        // item as sold and every counter as reset, so start fresh instead.
        this.buybackPending = false;
        await this.handleColdStart(rawData);
        return;
      }
      const current = rawData;
      await Promise.all([
        this.detectAbilityUsage(current, previous).catch(err =>
          this.handleDetectorError('detectAbilityUsage', err, current)
        ),
        this.detectItemChanges(current, previous).catch(err =>
          this.handleDetectorError('detectItemChanges', err, current)
        ),
        this.detectCombatEvents(current, previous).catch(err =>
          this.handleDetectorError('detectCombatEvents', err, current)
        ),
        this.detectLevelChanges(current, previous).catch(err =>
          this.handleDetectorError('detectLevelChanges', err, current)
        ),
        this.detectGoldChanges(current, previous).catch(err =>
          this.handleDetectorError('detectGoldChanges', err, current)
        ),
        this.detectHealthManaChanges(current, previous).catch(err =>
          this.handleDetectorError('detectHealthManaChanges', err, current)
        ),
        this.detectStatusChanges(current, previous).catch(err =>
          this.handleDetectorError('detectStatusChanges', err, current)
        ),
        this.detectMapEvents(current).catch(err =>
          this.handleDetectorError('detectMapEvents', err, current)
        ),
        this.detectGameStateChanges(current, previous).catch(err =>
          this.handleDetectorError('detectGameStateChanges', err, current)
        )
      ]);
    } catch (error) {
      await this.eventDispatcher.emit(GAME_EVENTS.GSI.ERROR, {
        error: String(error),
        context: 'processGSIData',
        hero_name: rawData.hero?.name,
        game_time: getNumber(rawData.map?.game_time)
      });
    } finally {
      this.lastFrame = rawData;
    }
  }

  /** First frame this detector has ever seen: synthesise the state the lights should be in. */
  private async handleColdStart(frame: Dota2GameState): Promise<void> {
    console.log(`[detector] cold start: state=${frame.map?.game_state ?? 'none'} match=${frame.map?.matchid ?? 'none'} alive=${frame.hero?.alive ?? '?'} respawn=${frame.hero?.respawn_seconds ?? '?'}`);
    if (frame.map?.game_state !== GAME_STATES.GAME_IN_PROGRESS) {
      return;
    }
    await this.eventDispatcher.emit(
      GAME_EVENTS.GAME.STARTED,
      this.buildCommonEventData(frame, {
        cold_start: true,
        health_percent: this.healthPercent(frame.hero)
      }),
      getNumber(frame.map?.game_time)
    );
    if (frame.hero?.alive === false) {
      await this.emitDeath(frame, frame.hero.health ?? 0, true);
    }
  }

  private handleDetectorError(method: string, error: unknown, gameState: Dota2GameState): void {
    // Emit error event asynchronously (don't await to avoid blocking)
    this.eventDispatcher.emit(GAME_EVENTS.GSI.ERROR, {
      error: String(error),
      context: method,
      hero_name: gameState.hero?.name,
      game_time: getNumber(gameState.map?.game_time),
      timestamp: Date.now()
    }).catch(err => {
      // Last resort: console error if even error emission fails
      console.error(`Failed to emit error event from ${method}:`, err);
    });
  }

  private async detectAbilityUsage(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (!current.abilities) {return;}
    if (!previous.abilities) {return;}
    for (const slotKey in previous.abilities) {
      const prevAbility = previous.abilities[slotKey];
      const currAbility = current.abilities[slotKey];
      if (!prevAbility || !currAbility?.name) {continue;}
      if ('cooldown' in prevAbility && 'cooldown' in currAbility &&
          prevAbility.cooldown !== undefined && currAbility.cooldown !== undefined) {
        if (prevAbility.cooldown === 0 && currAbility.cooldown > 0) {
          const event = this.buildCommonEventData(current, {
            ability_name: currAbility.name,
            slot: slotKey,
            cooldown: currAbility.cooldown
          });
          if (previous.hero?.mana !== undefined && current.hero?.mana !== undefined) {
            const manaDrop = previous.hero.mana - current.hero.mana;
            if (manaDrop > 0) {
              event['mana_cost'] = manaDrop;
            }
          }
          if (currAbility.ultimate && currAbility.cooldown > THRESHOLDS.ULTIMATE_COOLDOWN_MIN) {
            event['ultimate'] = true;
          }
          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ABILITIES.USED, event, getNumber(current.map?.game_time));
          await this.emitHeroSpecificAbility(currAbility.name, event, current.hero?.name);
        }
      }
      if ('charges' in prevAbility && 'charges' in currAbility &&
          prevAbility.charges !== undefined && currAbility.charges !== undefined) {
        if (prevAbility.charges > currAbility.charges) {
          const event = this.buildCommonEventData(current, {
            ability_name: currAbility.name,
            slot: slotKey,
            charges_remaining: currAbility.charges,
            charges_used: prevAbility.charges - currAbility.charges
          });
          if (previous.hero?.mana !== undefined && current.hero?.mana !== undefined) {
            const manaDrop = previous.hero.mana - current.hero.mana;
            if (manaDrop > 0) {
              event['mana_cost'] = manaDrop;
            }
          }
          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ABILITIES.USED, event, getNumber(current.map?.game_time));
          await this.emitHeroSpecificAbility(currAbility.name, event, current.hero?.name);
        }
      }
      if ('level' in prevAbility && 'level' in currAbility &&
          prevAbility.level !== undefined && currAbility.level !== undefined) {
        if (currAbility.level > prevAbility.level) {
          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ABILITIES.UPGRADED,
            this.buildCommonEventData(current, {
              ability_name: currAbility.name,
              level: currAbility.level,
              previous_level: prevAbility.level
            }),
            getNumber(current.map?.game_time)
          );
        }
      }
    }
  }

  /**
   * Item usage comes from cooldown and charge drops per slot. Purchases and drops are diffed by
   * item name across every changed slot, so moving an item between slots cancels out and a recipe
   * combine (components vanish, result appears) is one purchase and no drops.
   */
  private async detectItemChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (!current.items) {return;}
    if (!previous.items) {return;}
    const gameTime = getNumber(current.map?.game_time);
    const removed = new Map<string, string>();
    const added = new Map<string, string>();
    for (const slotKey in previous.items) {
      const prevItem = previous.items[slotKey];
      const currItem = current.items[slotKey];
      if (!prevItem || !currItem) {continue;}
      let itemWasUsed = false;
      const usageData: Record<string, unknown> = {
        item: currItem.name,
        item_name: currItem.name,
        slot: slotKey
      };
      if (prevItem.cooldown !== undefined && currItem.cooldown !== undefined) {
        if (prevItem.cooldown === 0 && currItem.cooldown > 0) {
          itemWasUsed = true;
          usageData.cooldown = currItem.cooldown;
        }
      }
      if (prevItem.charges !== undefined && currItem.charges !== undefined) {
        if (prevItem.charges > currItem.charges) {
          itemWasUsed = true;
          usageData.charges_remaining = currItem.charges;
          usageData.charges_used = prevItem.charges - currItem.charges;
        }
      }
      if (itemWasUsed) {
        if (current.player?.gold !== undefined) {
          usageData.gold = current.player.gold;
        }
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ITEMS.USED,
          this.buildCommonEventData(current, usageData),
          gameTime
        );
      }
      if (prevItem.name !== undefined && currItem.name !== undefined && prevItem.name !== currItem.name) {
        if (prevItem.name !== 'empty') {
          removed.set(prevItem.name, slotKey);
        }
        if (currItem.name !== 'empty') {
          added.set(currItem.name, slotKey);
        }
      }
    }
    for (const name of added.keys()) {
      if (removed.has(name)) {
        removed.delete(name);
        added.delete(name);
      }
    }
    const goldDelta = previous.player?.gold !== undefined && current.player?.gold !== undefined
      ? current.player.gold - previous.player.gold
      : 0;
    for (const [name, slot] of added) {
      const event = this.buildCommonEventData(current, { item_name: name, slot });
      if (goldDelta < 0) {
        event['gold_spent'] = -goldDelta;
      }
      if (removed.size > 0 && added.size === 1) {
        event['combined_from'] = [...removed.keys()];
      }
      await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ITEMS.PURCHASED, event, gameTime);
    }
    if (added.size > 0) {
      return;
    }
    for (const [name, slot] of removed) {
      const event = this.buildCommonEventData(current, { item_name: name, slot });
      if (goldDelta > SOLD_GOLD_MIN) {
        event['sold'] = true;
        event['gold_gained'] = goldDelta;
      }
      await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ITEMS.DROPPED, event, gameTime);
    }
  }

  private async emitDeath(current: Dota2GameState, previousHealth: number, coldStart = false): Promise<void> {
    let respawnTime = current.hero?.respawn_seconds;
    let respawnSource = 'GSI';
    if (respawnTime === undefined || respawnTime === null || respawnTime === 0) {
      const heroLevel = getNumber(current.hero?.level, 1);
      respawnTime = Math.min(
        RESPAWN_FORMULA.BASE + (heroLevel - 1) * RESPAWN_FORMULA.PER_LEVEL,
        RESPAWN_FORMULA.MAX
      );
      respawnSource = 'CALCULATED';
    }
    await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.DEATH,
      this.buildCommonEventData(current, {
        previous_health: previousHealth,
        respawn_seconds: respawnTime,
        respawn_source: respawnSource,
        cold_start: coldStart,
        kills: getNumber(current.player?.kills),
        deaths: getNumber(current.player?.deaths),
        assists: getNumber(current.player?.assists),
        total_deaths: getNumber(current.player?.deaths)
      }),
      getNumber(current.map?.game_time)
    );
  }

  /**
   * Death and respawn follow `hero.alive`. Buyback is the only thing that raises
   * `hero.buyback_cooldown`, so a rise is a buyback; the respawn that follows is flagged.
   */
  private async detectCombatEvents(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    const gameTime = getNumber(current.map?.game_time);
    if (current.hero && previous.hero) {
      if (previous.hero.alive === true && current.hero.alive === false) {
        this.buybackPending = false;
        await this.emitDeath(current, getNumber(previous.hero.health));
      }
      if (previous.hero.buyback_cooldown !== undefined && current.hero.buyback_cooldown !== undefined &&
          current.hero.buyback_cooldown > previous.hero.buyback_cooldown) {
        this.buybackPending = true;
        const buybackData = this.buildCommonEventData(current, {
          respawn_seconds_remaining: getNumber(current.hero.respawn_seconds),
          buyback_cooldown: current.hero.buyback_cooldown,
          buyback_cost: getNumber(previous.hero.buyback_cost ?? current.hero.buyback_cost)
        });
        if (previous.player?.gold !== undefined && current.player?.gold !== undefined) {
          const goldDelta = current.player.gold - previous.player.gold;
          if (goldDelta < 0) {
            buybackData.gold_cost = -goldDelta;
          }
        }
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.BUYBACK, buybackData, gameTime);
      }
      if (previous.hero.alive === false && current.hero.alive === true) {
        const buyback = this.buybackPending;
        this.buybackPending = false;
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN,
          this.buildCommonEventData(current, {
            health: current.hero.health,
            max_health: current.hero.max_health,
            buyback
          }),
          gameTime
        );
      }
    }
    if (previous.player) {
      if (previous.player.kills !== undefined && current.player?.kills) {
        if (current.player.kills > previous.player.kills) {
          const killCount = current.player.kills - previous.player.kills;
          const killStreak = getNumber(current.player?.kill_streak);
          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.KILL,
            this.buildCommonEventData(current, {
              kills: current.player.kills,
              deaths: getNumber(current.player.deaths),
              assists: getNumber(current.player.assists),
              kill_streak: killStreak,
              kill_count: killCount,
              kill_list: current.player.kill_list
            }),
            gameTime
          );
        }
      }
      if (previous.player.assists !== undefined && current.player?.assists) {
        if (current.player.assists > previous.player.assists) {
          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.ASSIST,
            this.buildCommonEventData(current, {
              assists: current.player.assists,
              assist_count: current.player.assists - previous.player.assists,
              kills: getNumber(current.player.kills),
              deaths: getNumber(current.player.deaths)
            }),
            gameTime
          );
        }
      }
    }
  }

  private async detectLevelChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (previous.hero?.level !== undefined && current.hero?.level) {
      if (current.hero.level > previous.hero.level) {
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.RESOURCES.LEVEL_UP,
          this.buildCommonEventData(current, {
            level: current.hero.level,
            previous_level: previous.hero.level
          }),
          getNumber(current.map?.game_time)
        );
      }
    }
  }

  private async detectGoldChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (previous.player?.gold !== undefined && current.player?.gold !== undefined) {
      const goldDelta = current.player.gold - previous.player.gold;
      if (Math.abs(goldDelta) > THRESHOLDS.GOLD_CHANGE_MIN) {
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.RESOURCES.GOLD_CHANGED,
          this.buildCommonEventData(current, {
            gold: current.player.gold,
            change: goldDelta,
            gold_change: goldDelta,
            reliable: getNumber(current.player.gold_reliable),
            unreliable: getNumber(current.player.gold_unreliable)
          }),
          getNumber(current.map?.game_time)
        );
      }
    }
  }

  private async detectHealthManaChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (previous.hero?.health !== undefined && current.hero) {
      const healthChange = current.hero.health - previous.hero.health;
      if (Math.abs(healthChange) > THRESHOLDS.HEALTH_CHANGE_MIN) {
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED,
          this.buildCommonEventData(current, {
            health: current.hero.health,
            max_health: current.hero.max_health,
            health_change: healthChange,
            health_percent: current.hero.max_health > 0 ? this.healthPercent(current.hero) : 0
          }),
          getNumber(current.map?.game_time)
        );
      }
    }
    if (previous.hero?.mana !== undefined && current.hero) {
      const manaChange = current.hero.mana - previous.hero.mana;
      if (Math.abs(manaChange) > THRESHOLDS.MANA_CHANGE_MIN) {
        const manaPercent = current.hero.max_mana > 0
          ? (current.hero.mana / current.hero.max_mana) * 100
          : 0;
        const manaChangePercent = current.hero.max_mana > 0
          ? (manaChange / current.hero.max_mana) * 100
          : 0;
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.RESOURCES.MANA_CHANGED,
          this.buildCommonEventData(current, {
            mana: current.hero.mana,
            max_mana: current.hero.max_mana,
            mana_change: manaChange,
            mana_change_percent: manaChangePercent,
            mana_percent: manaPercent
          }),
          getNumber(current.map?.game_time)
        );
      }
    }
  }

  private async detectStatusChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (!current.hero || !previous.hero) {return;}
    const prevHero = previous.hero as unknown as Record<string, unknown>;
    const currHero = current.hero as unknown as Record<string, unknown>;
    for (const [flag, eventType] of Object.entries(STATUS_FLAGS)) {
      const before = prevHero[flag];
      const after = currHero[flag];
      if (typeof before === 'boolean' && typeof after === 'boolean' && before !== after) {
        await this.eventDispatcher.emit(eventType,
          this.buildCommonEventData(current, { status: flag, active: after }),
          getNumber(current.map?.game_time)
        );
      }
    }
  }

  /** The `events[]` node repeats recent entries on every frame; each distinct entry is emitted once. */
  private async detectMapEvents(current: Dota2GameState) {
    if (!Array.isArray(current.events) || current.events.length === 0) {return;}
    const matchId = current.map?.matchid ?? '';
    for (const mapEvent of current.events as MapEvent[]) {
      const key = `${matchId}|${JSON.stringify(mapEvent)}`;
      if (this.seenMapEvents.has(key)) {continue;}
      this.seenMapEvents.add(key);
      const eventType = MAP_EVENT_MAP[mapEvent.event_type];
      if (!eventType) {continue;}
      const ownTeam = current.player?.team_name;
      await this.eventDispatcher.emit(eventType,
        this.buildCommonEventData(current, {
          ...mapEvent,
          own_team: ownTeam !== undefined && (mapEvent.team === ownTeam || mapEvent.killer_team === ownTeam)
        }),
        getNumber(mapEvent.game_time ?? current.map?.game_time)
      );
    }
  }

  private async detectGameStateChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    const gameTime = getNumber(current.map?.game_time);
    const matchId = current.map?.matchid ?? '';
    if (previous.map?.game_state !== undefined && current.map?.game_state) {
      const prevState = previous.map.game_state;
      const currState = current.map.game_state;
      if (prevState !== currState) {
        if (prevState === GAME_STATES.DISCONNECT) {
          await this.eventDispatcher.emit(GAME_EVENTS.GAME.RECONNECTED,
            this.buildCommonEventData(current, { health_percent: this.healthPercent(current.hero) }),
            gameTime
          );
        }
        if (currState === GAME_STATES.GAME_IN_PROGRESS) {
          await this.eventDispatcher.emit(GAME_EVENTS.GAME.STARTED,
            this.buildCommonEventData(current, { health_percent: this.healthPercent(current.hero) }),
            gameTime
          );
        }
        if (currState === GAME_STATES.POST_GAME) {
          await this.emitGameEnded(current, matchId, gameTime);
        }
      }
    }
    // Dota sometimes stops posting before POST_GAME; the winner is set a frame or two earlier.
    const prevWinner = previous.map?.win_team;
    const currWinner = current.map?.win_team;
    if (prevWinner !== undefined && currWinner !== undefined && prevWinner === 'none' && currWinner !== 'none') {
      await this.emitGameEnded(current, matchId, gameTime);
    }
    if (previous.map?.paused !== undefined && current.map?.paused !== undefined) {
      if (!previous.map.paused && current.map.paused) {
        await this.eventDispatcher.emit(GAME_EVENTS.GAME.PAUSED,
          this.buildCommonEventData(current, {}),
          gameTime
        );
      } else if (previous.map.paused && !current.map.paused) {
        await this.eventDispatcher.emit(GAME_EVENTS.GAME.UNPAUSED,
          this.buildCommonEventData(current, {}),
          gameTime
        );
      }
    }
  }

  private async emitGameEnded(current: Dota2GameState, matchId: string, gameTime: number): Promise<void> {
    if (this.endedMatchId === matchId) {
      return;
    }
    this.endedMatchId = matchId;
    const won = current.player?.team_name === current.map?.win_team;
    await this.eventDispatcher.emit(GAME_EVENTS.GAME.ENDED,
      this.buildCommonEventData(current, {
        victory: won,
        winner: current.map?.win_team,
        player_team: current.player?.team_name,
        radiant_score: getNumber(current.map?.radiant_score),
        dire_score: getNumber(current.map?.dire_score)
      }),
      gameTime
    );
  }

  private async emitHeroSpecificAbility(abilityName: string, eventData: EventData, heroName?: string) {
    if (!heroName) {return;}
    const gameTime = typeof eventData.game_time === 'number' ? eventData.game_time : 0;
    const eventType = HERO_ABILITY_MAP[heroName]?.[abilityName];
    if (eventType) {
      // Special case: enchantress_impetus needs additional data
      if (abilityName === 'enchantress_impetus') {
        await this.eventDispatcher.emit(eventType, { ...eventData, trigger: 'cast' }, gameTime);
      } else {
        await this.eventDispatcher.emit(eventType, eventData, gameTime);
      }
    }
  }
}
