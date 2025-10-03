import { EventDispatcher, type EventData, type GameEventType } from './events';
import { GAME_EVENTS } from './events';
import type { Dota2GameState } from './dota2-types';
import { getNumber } from '../server/utils';
import { THRESHOLDS, RESPAWN_FORMULA } from './constants';

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
export class GameEventDetector {
  private eventDispatcher: EventDispatcher;
  constructor(eventDispatcher: EventDispatcher) {
    this.eventDispatcher = eventDispatcher;
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
  async processGSIData(rawData: Dota2GameState): Promise<void> {
    try {
      if (!rawData.previously) {
        // Cold start - emit synthetic events for current state
        if (rawData.map?.game_state === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') {
          // Game is already in progress on cold start
          await this.eventDispatcher.emit(
            GAME_EVENTS.GAME.STARTED,
            this.buildCommonEventData(rawData, {
              cold_start: true,
              health_percent: rawData.hero?.health && rawData.hero?.max_health
                ? (rawData.hero.health / rawData.hero.max_health) * 100
                : 100
            }),
            getNumber(rawData.map?.game_time)
          );
        }
        return;
      }
      const current = rawData;
      const previous = rawData.previously;
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
  private async detectItemChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (!current.items) {return;}
    if (!previous.items) {return;}
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
      if ('cooldown' in prevItem && 'cooldown' in currItem &&
          prevItem.cooldown !== undefined && currItem.cooldown !== undefined) {
        if (prevItem.cooldown === 0 && currItem.cooldown > 0) {
          itemWasUsed = true;
          usageData.cooldown = currItem.cooldown;
        }
      }
      if ('charges' in prevItem && 'charges' in currItem &&
          prevItem.charges !== undefined && currItem.charges !== undefined) {
        if (prevItem.charges > currItem.charges) {
          itemWasUsed = true;
          usageData.charges_remaining = currItem.charges;
          usageData.charges_used = prevItem.charges - currItem.charges;
        }
      }
      if (itemWasUsed) {
        if (current.player?.gold !== undefined) {
          usageData.gold = current.player.gold;
          usageData.goldValidated = current.player.gold;
        }
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ITEMS.USED,
          this.buildCommonEventData(current, usageData),
          getNumber(current.map?.game_time)
        );
      }
      if ('name' in prevItem && 'name' in currItem &&
          prevItem.name !== undefined && currItem.name !== undefined) {
        if (prevItem.name !== currItem.name) {
          if (prevItem.name === 'empty' && currItem.name !== 'empty') {
            const event = this.buildCommonEventData(current, {
              item_name: currItem.name,
              slot: slotKey
            });
            if (previous.player?.gold !== undefined && current.player?.gold !== undefined) {
              const goldDrop = previous.player.gold - current.player.gold;
              if (goldDrop > 0) {
                event['gold_spent'] = goldDrop;
                  }
            }
            await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ITEMS.PURCHASED, event, getNumber(current.map?.game_time));
          } else if (prevItem.name !== 'empty' && currItem.name === 'empty') {
            const event = this.buildCommonEventData(current, {
              item_name: prevItem.name,
              slot: slotKey
            });
            if (previous.player?.gold !== undefined && current.player?.gold !== undefined) {
              const goldGain = current.player.gold - previous.player.gold;
              if (goldGain > 0) {
                event['sold'] = true;
                event['gold_gained'] = goldGain;
              }
            }
            await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.ITEMS.DROPPED, event, getNumber(current.map?.game_time));
            }
        }
      }
    }
  }
  private async detectCombatEvents(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (previous.hero?.health !== undefined && current.hero) {
      const prevHealth = previous.hero.health;
      const currHealth = current.hero.health;
      if (prevHealth > 0 && currHealth === 0) {
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
            previous_health: prevHealth,
            respawn_seconds: respawnTime,
            respawn_source: respawnSource,
            kills: getNumber(current.player?.kills),
            deaths: getNumber(current.player?.deaths),
            assists: getNumber(current.player?.assists),
            total_deaths: getNumber(current.player?.deaths)
          }),
          getNumber(current.map?.game_time)
        );
      }
      if (prevHealth === 0 && currHealth > 0) {
        // Check if this is a buyback (respawning while death timer is still active)
        if (current.hero?.respawn_seconds && current.hero.respawn_seconds > 0) {
          // This is a buyback - player respawned before timer expired
          const buybackData = this.buildCommonEventData(current, {
            respawn_seconds_remaining: current.hero.respawn_seconds
          });

          // Add gold cost if we can calculate it
          if (previous.player?.gold !== undefined && current.player?.gold !== undefined) {
            const goldDelta = current.player.gold - previous.player.gold;
            if (goldDelta < 0) {
              buybackData.gold_cost = Math.abs(goldDelta);
            }
          }

          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.BUYBACK,
            buybackData,
            getNumber(current.map?.game_time)
          );
        }

        // Always emit respawn event (for both natural respawn and buyback)
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.RESPAWN,
          this.buildCommonEventData(current, {
            health: currHealth,
            max_health: current.hero.max_health,
            buyback: current.hero?.respawn_seconds && current.hero.respawn_seconds > 0
          }),
          getNumber(current.map?.game_time)
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
            getNumber(current.map?.game_time)
          );
        }
      }
      if (previous.player.assists !== undefined && current.player?.assists) {
        if (current.player.assists > previous.player.assists) {
          await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.COMBAT.ASSIST,
            this.buildCommonEventData(current, {
              assists: current.player.assists,
              kills: getNumber(current.player.kills),
              deaths: getNumber(current.player.deaths)
            }),
            getNumber(current.map?.game_time)
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
        const healthPercent = current.hero.max_health > 0
          ? (current.hero.health / current.hero.max_health) * 100
          : 0;
        await this.eventDispatcher.emit(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED,
          this.buildCommonEventData(current, {
            health: current.hero.health,
            max_health: current.hero.max_health,
            health_change: healthChange,
            health_percent: healthPercent
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
  private async detectGameStateChanges(current: Dota2GameState, previous: Partial<Dota2GameState>) {
    if (previous.map?.game_state !== undefined && current.map?.game_state) {
      const prevState = previous.map.game_state;
      const currState = current.map.game_state;
      if (prevState !== currState) {
        if (currState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
            prevState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') {
          await this.eventDispatcher.emit(GAME_EVENTS.GAME.STARTED,
            this.buildCommonEventData(current, {}),
            getNumber(current.map?.game_time)
          );
        }
        if (currState === 'DOTA_GAMERULES_STATE_POST_GAME') {
          const won = current.player?.team_name === current.map?.win_team;
          await this.eventDispatcher.emit(GAME_EVENTS.GAME.ENDED,
            this.buildCommonEventData(current, {
              victory: won,
              winner: current.map?.win_team,
              player_team: current.player?.team_name,
              radiant_score: getNumber(current.map?.radiant_score),
              dire_score: getNumber(current.map?.dire_score)
            }),
            getNumber(current.map?.game_time)
          );
        }
      }
    }
    if (previous.map?.paused !== undefined && current.map?.paused !== undefined) {
      if (!previous.map.paused && current.map.paused) {
        await this.eventDispatcher.emit(GAME_EVENTS.GAME.PAUSED,
          this.buildCommonEventData(current, {}),
          getNumber(current.map?.game_time)
        );
      } else if (previous.map.paused && !current.map.paused) {
        await this.eventDispatcher.emit(GAME_EVENTS.GAME.UNPAUSED,
          this.buildCommonEventData(current, {}),
          getNumber(current.map?.game_time)
        );
      }
    }
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