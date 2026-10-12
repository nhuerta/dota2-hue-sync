import { GAME_EVENTS, type GameEventType } from '../events';
import { THRESHOLDS } from '../constants';
import type { Detector } from './types';

/** Hero-specific ability names mapped to their own event, on top of player:abilities:used. */
export const HERO_ABILITY_MAP: Readonly<Record<string, Readonly<Record<string, GameEventType>>>> = {
  npc_dota_hero_mirana: {
    mirana_arrow: GAME_EVENTS.HEROES.MIRANA.ARROW_CAST,
    mirana_starfall: GAME_EVENTS.HEROES.MIRANA.STARFALL,
    mirana_leap: GAME_EVENTS.HEROES.MIRANA.LEAP,
    mirana_invis: GAME_EVENTS.HEROES.MIRANA.MOONLIGHT,
    mirana_moonlight: GAME_EVENTS.HEROES.MIRANA.MOONLIGHT,
    mirana_celestial_quiver: GAME_EVENTS.HEROES.MIRANA.CELESTIAL_QUIVER
  },
  npc_dota_hero_weaver: {
    weaver_the_swarm: GAME_EVENTS.HEROES.WEAVER.THE_SWARM,
    weaver_shukuchi: GAME_EVENTS.HEROES.WEAVER.SHUKUCHI,
    weaver_geminate_attack: GAME_EVENTS.HEROES.WEAVER.GERMINATE_ATTACK,
    weaver_time_lapse: GAME_EVENTS.HEROES.WEAVER.TIME_LAPSE
  },
  npc_dota_hero_dark_seer: {
    dark_seer_vacuum: GAME_EVENTS.HEROES.DARK_SEER.VACUUM,
    dark_seer_ion_shell: GAME_EVENTS.HEROES.DARK_SEER.ION_SHELL,
    dark_seer_surge: GAME_EVENTS.HEROES.DARK_SEER.SURGE,
    dark_seer_wall_of_replica: GAME_EVENTS.HEROES.DARK_SEER.WALL_OF_REPLICA
  },
  npc_dota_hero_enchantress: {
    enchantress_untouchable: GAME_EVENTS.HEROES.ENCHANTRESS.UNTOUCHABLE,
    enchantress_enchant: GAME_EVENTS.HEROES.ENCHANTRESS.ENCHANT,
    enchantress_natures_attendants: GAME_EVENTS.HEROES.ENCHANTRESS.NATURES_ATTENDANTS,
    enchantress_impetus: GAME_EVENTS.HEROES.ENCHANTRESS.IMPETUS
  },
  npc_dota_hero_spectre: {
    spectre_spectral_dagger: GAME_EVENTS.HEROES.SPECTRE.SPECTRAL_DAGGER,
    spectre_desolate: GAME_EVENTS.HEROES.SPECTRE.DESOLATE,
    spectre_dispersion: GAME_EVENTS.HEROES.SPECTRE.DISPERSION,
    spectre_haunt: GAME_EVENTS.HEROES.SPECTRE.HAUNT,
    spectre_reality: GAME_EVENTS.HEROES.SPECTRE.HAUNT
  }
};

/** A cast is a cooldown leaving zero or a charge being spent. */
export const abilityDetector: Detector = {
  name: 'abilities',
  detect({ current, previous }, emit) {
    if (!current.abilities || !previous.abilities) {
      return;
    }
    const manaDrop = previous.hero?.mana !== undefined && current.hero?.mana !== undefined
      ? previous.hero.mana - current.hero.mana
      : 0;
    const heroEvents = current.hero?.name ? HERO_ABILITY_MAP[current.hero.name] : undefined;
    for (const slot in previous.abilities) {
      const before = previous.abilities[slot];
      const after = current.abilities[slot];
      if (!before || !after?.name) {
        continue;
      }
      let cast: Record<string, unknown> | null = null;
      if (before.cooldown === 0 && after.cooldown !== undefined && after.cooldown > 0) {
        cast = { cooldown: after.cooldown };
        if (after.ultimate && after.cooldown > THRESHOLDS.ULTIMATE_COOLDOWN_MIN) {
          cast.ultimate = true;
        }
      } else if (before.charges !== undefined && after.charges !== undefined && before.charges > after.charges) {
        cast = { charges_remaining: after.charges, charges_used: before.charges - after.charges };
      }
      if (cast) {
        const data = { ability_name: after.name, slot, ...cast, ...(manaDrop > 0 ? { mana_cost: manaDrop } : {}) };
        emit(GAME_EVENTS.PLAYER.ABILITIES.USED, data);
        const heroEvent = heroEvents?.[after.name];
        if (heroEvent) {
          emit(heroEvent, after.name === 'enchantress_impetus' ? { ...data, trigger: 'cast' } : data);
        }
      }
      if (before.level !== undefined && after.level !== undefined && after.level > before.level) {
        emit(GAME_EVENTS.PLAYER.ABILITIES.UPGRADED, { ability_name: after.name, level: after.level, previous_level: before.level });
      }
    }
  }
};
