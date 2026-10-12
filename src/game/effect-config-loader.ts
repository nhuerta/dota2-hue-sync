import type { EffectParams } from './effect-registry';
import { COLORS } from '@nhuerta/node-hue-edk';
import { isGameEventType } from './events';

export interface EffectConfig {
  enabled: boolean;
  type: string;
  params: EffectParams;
}

export interface EffectsConfiguration {
  version: string;
  effects: Record<string, EffectConfig>;
}

export class EffectConfigLoader {
  private static readonly CONFIG_PATH = './config/effects-config.json';

  public static async load(): Promise<EffectsConfiguration> {
    const file = Bun.file(this.CONFIG_PATH);
    const exists = await file.exists();

    if (!exists) {
      throw new Error(`Effects configuration file not found at ${this.CONFIG_PATH}`);
    }

    const config = await file.json();
    this.validate(config);

    const enabledCount = Object.values(config.effects).filter(e => e.enabled).length;
    const totalCount = Object.keys(config.effects).length;
    console.log(`Loaded effects configuration: ${enabledCount}/${totalCount} effects enabled`);

    return config;
  }

  private static validate(config: unknown): asserts config is EffectsConfiguration {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Effects configuration must be an object');
    }

    const cfg = config as Record<string, unknown>;

    if (typeof cfg.version !== 'string') {
      throw new Error('Effects configuration missing required "version" field (string)');
    }

    if (typeof cfg.effects !== 'object' || cfg.effects === null) {
      throw new Error('Effects configuration missing required "effects" field (object)');
    }

    const effects = cfg.effects as Record<string, unknown>;

    for (const [eventKey, effectConfig] of Object.entries(effects)) {
      if (typeof effectConfig !== 'object' || effectConfig === null) {
        throw new Error(`Effect "${eventKey}" must be an object`);
      }

      if (!isGameEventType(eventKey)) {
        throw new Error(`Effect "${eventKey}" is not a known event; event keys use colons, e.g. player:combat:kill`);
      }

      const effect = effectConfig as Record<string, unknown>;

      if (typeof effect.enabled !== 'boolean') {
        throw new Error(`Effect "${eventKey}" missing required "enabled" field (boolean)`);
      }

      if (typeof effect.type !== 'string') {
        throw new Error(`Effect "${eventKey}" missing required "type" field (string)`);
      }

      if (typeof effect.params !== 'object' || effect.params === null) {
        throw new Error(`Effect "${eventKey}" missing required "params" field (object)`);
      }

      this.validateColors(eventKey, effect.params as Record<string, unknown>);
    }
  }

  private static validateColors(eventKey: string, params: Record<string, unknown>): void {
    const validColors = Object.keys(COLORS);

    for (const [paramName, paramValue] of Object.entries(params)) {
      if (typeof paramValue === 'string' && (paramName.includes('color') || paramName.includes('Color'))) {
        if (!validColors.includes(paramValue)) {
          throw new Error(
            `Effect "${eventKey}" has invalid color "${paramValue}" in parameter "${paramName}". ` +
            `Valid colors: ${validColors.join(', ')}`
          );
        }
      }

      if (Array.isArray(paramValue) && paramName === 'colorSequence') {
        for (let i = 0; i < paramValue.length; i++) {
          const colorName = paramValue[i];
          if (typeof colorName === 'string' && !validColors.includes(colorName)) {
            throw new Error(
              `Effect "${eventKey}" has invalid color "${colorName}" at index ${i} in colorSequence. ` +
              `Valid colors: ${validColors.join(', ')}`
            );
          }
        }
      }
    }
  }
}
