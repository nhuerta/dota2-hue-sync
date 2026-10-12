import { isGameEventType, type GameEventType } from './events';
import { PRIORITY_NAMES, type Priority } from './effect-scheduler';
import { effectLengthMs, resolveParams, type ResolvedParams } from './effect-catalog';

/** One entry of config/effects-config.json as written. */
export interface EffectConfig {
  enabled: boolean;
  type: string;
  params: Record<string, unknown>;
  /** Scheduling priority; defaults per event (see defaultPriority in dota-effect-manager). */
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

export interface EffectsConfiguration {
  version: string;
  effects: Record<string, EffectConfig>;
}

/** An enabled entry after validation: params resolved, length known, priority a number if set. */
export interface EffectBinding {
  event: GameEventType;
  type: string;
  params: ResolvedParams;
  lengthMs: number;
  priority?: Priority;
}

export const DEFAULT_CONFIG_PATH = './config/effects-config.json';

function fail(eventKey: string, message: string): never {
  throw new Error(`effects-config "${eventKey}": ${message}`);
}

/**
 * Validates a parsed effects config and returns the enabled bindings. Every problem is reported
 * with the event key and parameter so it is one line to fix. Pure, so it is unit tested directly.
 */
export function parseEffectsConfig(config: unknown): EffectBinding[] {
  if (typeof config !== 'object' || config === null) {
    throw new Error('effects-config: must be an object');
  }
  const cfg = config as Record<string, unknown>;
  if (typeof cfg.version !== 'string') {
    throw new Error('effects-config: missing "version" (string)');
  }
  if (typeof cfg.effects !== 'object' || cfg.effects === null) {
    throw new Error('effects-config: missing "effects" (object)');
  }
  const bindings: EffectBinding[] = [];
  for (const [eventKey, raw] of Object.entries(cfg.effects as Record<string, unknown>)) {
    if (!isGameEventType(eventKey)) {
      fail(eventKey, 'not a known event; keys use colons, e.g. player:combat:kill');
    }
    if (typeof raw !== 'object' || raw === null) {
      fail(eventKey, 'must be an object');
    }
    const effect = raw as Record<string, unknown>;
    if (typeof effect.enabled !== 'boolean') {
      fail(eventKey, 'missing "enabled" (boolean)');
    }
    if (typeof effect.type !== 'string') {
      fail(eventKey, 'missing "type" (string)');
    }
    if (typeof effect.params !== 'object' || effect.params === null) {
      fail(eventKey, 'missing "params" (object)');
    }
    let priority: Priority | undefined;
    if (effect.priority !== undefined) {
      if (typeof effect.priority !== 'string' || !(effect.priority in PRIORITY_NAMES)) {
        fail(eventKey, `unknown priority ${JSON.stringify(effect.priority)}; use low, normal, high or critical`);
      }
      priority = PRIORITY_NAMES[effect.priority];
    }
    let params: ResolvedParams;
    try {
      params = resolveParams(effect.type, effect.params as Record<string, unknown>);
    } catch (error) {
      fail(eventKey, error instanceof Error ? error.message : String(error));
    }
    if (!effect.enabled) {
      continue;
    }
    bindings.push({ event: eventKey, type: effect.type, params, lengthMs: effectLengthMs(effect.type, params), priority });
  }
  return bindings;
}

export async function loadEffectsConfig(path: string = DEFAULT_CONFIG_PATH): Promise<EffectBinding[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Effects configuration file not found at ${path}`);
  }
  const bindings = parseEffectsConfig(await file.json());
  console.log(`Loaded effects configuration: ${bindings.length} effects enabled`);
  return bindings;
}
