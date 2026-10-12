import type { DotaGameState } from './constants';

export interface Provider {
  name: string;
  appid: number;
  version: number;
  timestamp: number;
}
export interface GameMap {
  name: string;
  matchid: string;
  game_time: number;
  clock_time: number;
  daytime: boolean;
  nightstalker_night: boolean;
  radiant_score: number;
  dire_score: number;
  game_state: DotaGameState;
  paused: boolean;
  win_team: string;
  customgamename: string;
  ward_purchase_cooldown: number;
}
export interface Player {
  steamid: string;
  accountid: string;
  name: string;
  activity: string;
  kills: number;
  deaths: number;
  assists: number;
  last_hits: number;
  denies: number;
  kill_streak: number;
  commands_issued: number;
  kill_list?: Record<string, number>;
  team_name: string;
  player_slot: number;
  team_slot: number;
  gold: number;
  gold_reliable: number;
  gold_unreliable: number;
  gold_from_hero_kills: number;
  gold_from_creep_kills: number;
  gold_from_income: number;
  gold_from_shared: number;
  gpm: number;
  xpm: number;
}
export interface Hero {
  facet: number;
  xpos: number;
  ypos: number;
  id: number;
  name: string;
  level: number;
  xp: number;
  alive: boolean;
  respawn_seconds: number;
  buyback_cost: number;
  buyback_cooldown: number;
  health: number;
  max_health: number;
  health_percent: number;
  mana: number;
  max_mana: number;
  mana_percent: number;
  silenced: boolean;
  stunned: boolean;
  disarmed: boolean;
  magicimmune: boolean;
  hexed: boolean;
  muted: boolean;
  break: boolean;
  aghanims_scepter: boolean;
  aghanims_shard: boolean;
  smoked: boolean;
  has_debuff: boolean;
  talent_1: boolean;
  talent_2: boolean;
  talent_3: boolean;
  talent_4: boolean;
  talent_5: boolean;
  talent_6: boolean;
  talent_7: boolean;
  talent_8: boolean;
  attributes_level: number;
}
export interface Ability {
  name: string;
  level: number;
  can_cast: boolean;
  passive: boolean;
  ability_active: boolean;
  cooldown: number;
  ultimate: boolean;
  charges?: number;
  max_charges?: number;
  charge_cooldown?: number;
}
export interface Item {
  name: string;
  purchaser?: number;
  item_level?: number;
  can_cast?: boolean;
  cooldown?: number;
  passive?: boolean;
  item_charges?: number;
  charges?: number;
}
export interface Building {
  health: number;
  max_health: number;
}
export interface Buildings {
  radiant?: Record<string, Building>;
  dire?: Record<string, Building>;
}
export type MapEventType =
  | 'courier_killed' | 'roshan_killed' | 'aegis_picked_up' | 'aegis_denied' | 'bounty_rune_pickup' | 'tip';
/** One entry of the `events[]` node. Dota repeats recent entries on every frame. */
export interface GameEvent {
  game_time: number;
  event_type: MapEventType | string;
  player_id?: number;
  team?: string;
  bounty_value?: number;
  team_gold?: number;
  killer?: number;
  killer_team?: string;
  victim?: number;
  victim_team?: string;
  [key: string]: unknown;
}
export interface MinimapObject {
  xpos: number;
  ypos: number;
  image: string;
  team: number;
  yaw: number;
  unitname: string;
  visionrange: number;
}
export interface Draft {
  activeteam: number;
  pick: boolean;
  activeteam_time_remaining: number;
  radiant_bonus_time: number;
  dire_bonus_time: number;
  allpicklockintime: number;
  team0?: DraftTeam;
  team1?: DraftTeam;
  team2?: DraftTeam;
  team3?: DraftTeam;
  team4?: DraftTeam;
  team5?: DraftTeam;
  team6?: DraftTeam;
  team7?: DraftTeam;
  team8?: DraftTeam;
  team9?: DraftTeam;
}
export interface DraftTeam {
  pick0_id?: number;
  pick0_class?: string;
  pick1_id?: number;
  pick1_class?: string;
  pick2_id?: number;
  pick2_class?: string;
  pick3_id?: number;
  pick3_class?: string;
  pick4_id?: number;
  pick4_class?: string;
  ban0_id?: number;
  ban0_class?: string;
  ban1_id?: number;
  ban1_class?: string;
  ban2_id?: number;
  ban2_class?: string;
  ban3_id?: number;
  ban3_class?: string;
  ban4_id?: number;
  ban4_class?: string;
  ban5_id?: number;
  ban5_class?: string;
  ban6_id?: number;
  ban6_class?: string;
}
export interface League {
  league_id: number;
  league_node_id: number;
  series_id: number;
  series_type: number;
  series_game: number;
  selection_priority?: SelectionPriority;
  radiant_series_wins: number;
  dire_series_wins: number;
  radiant_team_id: number;
  radiant_team_name: string;
  radiant_team_tag: string;
  radiant_team_logo: string;
  dire_team_id: number;
  dire_team_name: string;
  dire_team_tag: string;
  dire_team_logo: string;
}
export interface SelectionPriority {
  used_coin_toss: boolean;
  current_priority: number;
  radiant_choice: string;
  dire_choice: string;
}
export interface Wearables {
  [key: string]: number;
}
export interface Roshan {
  alive: boolean;
  spawn_phase: number;
  phase_time_remaining: number;
  location: string;
  rotation: number;
  drops?: {
    items: number[];
  };
}
export interface Courier {
  courier0?: CourierState;
  courier1?: CourierState;
  [key: string]: CourierState | undefined;
}
export interface CourierState {
  health: number;
  max_health: number;
  alive: boolean;
  remaining_respawn_time: number;
  xpos: number;
  ypos: number;
  rotation: number;
  owner: number;
}
export interface NeutralItems {
  tier0?: NeutralItemTier;
  tier1?: NeutralItemTier;
  tier2?: NeutralItemTier;
  tier3?: NeutralItemTier;
  tier4?: NeutralItemTier;
  team2?: TeamNeutralItems;
  team3?: TeamNeutralItems;
}
export interface NeutralItemTier {
  tier: number;
  max_count: number;
  drop_after_time: number;
}
export interface TeamNeutralItems {
  items_found: number;
  [key: string]: unknown;
}
export interface Dota2GameState {
  provider?: Provider;
  map?: GameMap;
  player?: Player;
  hero?: Hero;
  abilities?: Record<string, Ability>;
  items?: Record<string, Item>;
  events?: GameEvent[];
  buildings?: Buildings;
  league?: League;
  draft?: Draft;
  wearables?: Wearables;
  minimap?: Record<string, MinimapObject>;
  roshan?: Roshan;
  couriers?: Courier;
  neutralitems?: NeutralItems;
  previously?: Partial<Dota2GameState>;
}