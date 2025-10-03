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

// Respawn time formula constants
export const RESPAWN_FORMULA = {
  BASE: 10,           // Base respawn time in seconds
  PER_LEVEL: 2.5,     // Additional seconds per hero level
  MAX: 100,           // Maximum respawn time cap
} as const;