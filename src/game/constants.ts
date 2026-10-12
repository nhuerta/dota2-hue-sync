// Detection thresholds
export const THRESHOLDS = {
  HEALTH_CHANGE_MIN: 10,      // Minimum health change to trigger event
  MANA_CHANGE_MIN: 10,        // Minimum mana change to trigger event
  GOLD_CHANGE_MIN: 50,        // Minimum gold change to trigger event
  ULTIMATE_COOLDOWN_MIN: 60,  // Minimum cooldown to consider ultimate
} as const;

// Timing constants
export const TIMING = {
  GSI_DISCONNECT_TIMEOUT: 10000,  // 10 seconds
  WATCHDOG_INTERVAL: 5000,        // 5 seconds
} as const;

// Multikill and killing spree rules (Dota's own announcer thresholds)
export const KILL_STREAK = {
  MULTIKILL_WINDOW_S: 18,   // seconds between kills for a multikill
  MULTIKILL_NAMES: { 2: 'double_kill', 3: 'triple_kill', 4: 'ultra_kill', 5: 'rampage' } as Record<number, string>,
  SPREE_NAMES: {
    3: 'killing_spree', 4: 'dominating', 5: 'mega_kill', 6: 'unstoppable', 7: 'wicked_sick',
    8: 'monster_kill', 9: 'godlike', 10: 'beyond_godlike'
  } as Record<number, string>,
} as const;

// Respawn time formula constants
export const RESPAWN_FORMULA = {
  BASE: 10,           // Base respawn time in seconds
  PER_LEVEL: 2.5,     // Additional seconds per hero level
  MAX: 100,           // Maximum respawn time cap
} as const;
// Every value Dota 2 puts in map.game_state (same order as the DOTA_GameState enum)
export const GAME_STATES = {
  INIT: 'DOTA_GAMERULES_STATE_INIT',
  WAIT_FOR_PLAYERS_TO_LOAD: 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD',
  HERO_SELECTION: 'DOTA_GAMERULES_STATE_HERO_SELECTION',
  STRATEGY_TIME: 'DOTA_GAMERULES_STATE_STRATEGY_TIME',
  PRE_GAME: 'DOTA_GAMERULES_STATE_PRE_GAME',
  GAME_IN_PROGRESS: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  POST_GAME: 'DOTA_GAMERULES_STATE_POST_GAME',
  DISCONNECT: 'DOTA_GAMERULES_STATE_DISCONNECT',
  TEAM_SHOWCASE: 'DOTA_GAMERULES_STATE_TEAM_SHOWCASE',
  CUSTOM_GAME_SETUP: 'DOTA_GAMERULES_STATE_CUSTOM_GAME_SETUP',
  WAIT_FOR_MAP_TO_LOAD: 'DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD',
  SCENARIO_SETUP: 'DOTA_GAMERULES_STATE_SCENARIO_SETUP',
  PLAYER_DRAFT: 'DOTA_GAMERULES_STATE_PLAYER_DRAFT'
} as const;
export type DotaGameState = typeof GAME_STATES[keyof typeof GAME_STATES];
