import { type Color, COLORS, type Hue } from '@nhuerta/node-hue-edk';

/**
 * The single source of truth for light effects: name, parameters with defaults, how long the
 * effect owns the strip, and the wrapper call that starts it. The config loader validates
 * against it, the manager runs from it, and the showcase lists it.
 */

export type ParamSpec =
  | { kind: 'color'; default?: ColorName }
  | { kind: 'colors'; default?: ColorName[] }
  | { kind: 'number'; default?: number; unit?: 'ms' | 's' | 'count' };

export type ColorName = keyof typeof COLORS;

export interface EffectSpec {
  description: string;
  /** Declaration order is the prompt order in the showcase. */
  params: Record<string, ParamSpec>;
  /** Which parameter sets the effect length. `runTime` 0 means "until stopped" and falls back to DEFAULT_LENGTH_MS. */
  length?: 'duration' | 'runTime' | 'totalSeconds';
  run: (hue: Hue, p: ResolvedParams) => void;
}

export type ResolvedParams = Record<string, Color | Color[] | number>;

export const DEFAULT_LENGTH_MS = 2000;

const color = (def?: ColorName): ParamSpec => ({ kind: 'color', default: def });
const colors = (def: ColorName[]): ParamSpec => ({ kind: 'colors', default: def });
const ms = (def?: number): ParamSpec => ({ kind: 'number', default: def, unit: 'ms' });
const count = (def: number): ParamSpec => ({ kind: 'number', default: def, unit: 'count' });

const c = (p: ResolvedParams, k: string) => p[k] as Color;
const n = (p: ResolvedParams, k: string) => p[k] as number;

export const EFFECT_CATALOG: Readonly<Record<string, EffectSpec>> = {
  // One colour
  flashColor: { description: 'Quick flash', params: { color: color(), duration: ms(500) }, length: 'duration',
    run: (h, p) => h.flashColor(c(p, 'color'), n(p, 'duration')) },
  rippleGradient: { description: 'Centre-out ripple', params: { color: color(), duration: ms(1000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.rippleGradient(c(p, 'color'), n(p, 'duration'), n(p, 'runTime')) },
  chaseGradient: { description: 'Chasing band', params: { color: color(), speed: ms(500), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.chaseGradient(c(p, 'color'), n(p, 'speed'), n(p, 'runTime')) },
  shockwave: { description: 'Expanding shockwave', params: { color: color(), duration: ms(1500) }, length: 'duration',
    run: (h, p) => h.shockwave(c(p, 'color'), n(p, 'duration')) },
  energyBurst: { description: 'Burst that decays', params: { color: color(), duration: ms(800) }, length: 'duration',
    run: (h, p) => h.energyBurst(c(p, 'color'), n(p, 'duration')) },
  doubleStrike: { description: 'Two hits', params: { color: color(), duration: ms(500) }, length: 'duration',
    run: (h, p) => h.doubleStrike(c(p, 'color'), n(p, 'duration')) },
  brightnessWave: { description: 'Brightness wave over a base colour', params: { baseColor: color('purple'), duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.brightnessWave(c(p, 'baseColor'), n(p, 'duration')) },
  acceleratingPulse: { description: 'Pulses that speed up', params: { color: color(), pulseCount: count(5), startSpeed: ms(800), endSpeed: ms(100) },
    run: (h, p) => h.acceleratingPulse(c(p, 'color'), n(p, 'pulseCount'), n(p, 'startSpeed'), n(p, 'endSpeed')) },
  strobeLight: { description: 'Strobe', params: { color: color(), duration: ms(1000), strobeSpeed: ms(50) }, length: 'duration',
    run: (h, p) => h.strobeLight(c(p, 'color'), n(p, 'duration'), n(p, 'strobeSpeed')) },

  // Two colours
  gradientWave: { description: 'Smooth wave between two colours', params: { color1: color(), color2: color(), duration: ms(2000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.gradientWave(c(p, 'color1'), c(p, 'color2'), n(p, 'duration'), n(p, 'runTime')) },
  breathingGradient: { description: 'Breathing between two colours', params: { color1: color(), color2: color(), period: ms(3000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.breathingGradient(c(p, 'color1'), c(p, 'color2'), n(p, 'period'), n(p, 'runTime')) },
  pulseWave: { description: 'Pulsing wave', params: { color1: color(), color2: color(), speed: ms(1000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.pulseWave(c(p, 'color1'), c(p, 'color2'), n(p, 'speed'), n(p, 'runTime')) },
  bouncingWave: { description: 'Wave bouncing end to end', params: { color1: color(), color2: color(), speed: ms(2000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.bouncingWave(c(p, 'color1'), c(p, 'color2'), n(p, 'speed'), n(p, 'runTime')) },
  pulsingBounce: { description: 'Bounce with a pulse', params: { color1: color(), color2: color(), bounceSpeed: ms(2000), pulseSpeed: ms(500), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.pulsingBounce(c(p, 'color1'), c(p, 'color2'), n(p, 'bounceSpeed'), n(p, 'pulseSpeed'), n(p, 'runTime')) },
  fadeBounce: { description: 'Bounce that fades', params: { color1: color(), color2: color(), speed: ms(2000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.fadeBounce(c(p, 'color1'), c(p, 'color2'), n(p, 'speed'), n(p, 'runTime')) },
  doubleBounce: { description: 'Two bands bouncing', params: { color1: color(), color2: color(), speed: ms(2000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.doubleBounce(c(p, 'color1'), c(p, 'color2'), n(p, 'speed'), n(p, 'runTime')) },
  meteorShower: { description: 'Streaks falling across the strip', params: { color1: color(), color2: color(), duration: ms(2500) }, length: 'duration',
    run: (h, p) => h.meteorShower(c(p, 'color1'), c(p, 'color2'), n(p, 'duration')) },
  timeRewind: { description: 'Reverse sweep', params: { color1: color(), color2: color(), duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.timeRewind(c(p, 'color1'), c(p, 'color2'), n(p, 'duration')) },
  spiralVortex: { description: 'Spiral', params: { color1: color(), color2: color(), duration: ms(2000) }, length: 'duration',
    run: (h, p) => h.spiralVortex(c(p, 'color1'), c(p, 'color2'), n(p, 'duration')) },
  explosionFlash: { description: 'Explosion with alpha layering', params: { baseColor: color('orange'), flashColor: color('white'), duration: ms(1500) }, length: 'duration',
    run: (h, p) => h.explosionFlash(c(p, 'baseColor'), c(p, 'flashColor'), n(p, 'duration')) },
  explosionFlashRipple: { description: 'Explosion followed by a ripple', params: { baseColor: color('orange'), flashColor: color('white'), duration: ms(2000) }, length: 'duration',
    run: (h, p) => h.explosionFlashRipple(c(p, 'baseColor'), c(p, 'flashColor'), n(p, 'duration')) },

  // Sequences
  flashingColorSequence: { description: 'Flash through a list of colours', params: { colorSequence: colors(['red', 'white', 'blue', 'white']), flashCount: count(6), flashSpeed: ms(150) },
    run: (h, p) => h.flashingColorSequence(p.colorSequence as Color[], n(p, 'flashCount'), n(p, 'flashSpeed')) },
  policeFlash: { description: 'Red, white, blue', params: { flashCount: count(6), flashSpeed: ms(150) },
    run: (h, p) => h.policeFlash(n(p, 'flashCount'), n(p, 'flashSpeed')) },
  mexicanFlag: { description: 'Green, white, red', params: { flashCount: count(6), flashSpeed: ms(150) },
    run: (h, p) => h.mexicanFlag(n(p, 'flashCount'), n(p, 'flashSpeed')) },
  policeFlashPro: { description: 'Police strobe', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.policeFlashPro(n(p, 'duration')) },
  randomColorSequence: { description: 'Random colours', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.randomColorSequence(n(p, 'duration')) },
  rainbowWave: { description: 'Rainbow sweep', params: { speed: ms(2000), runTime: ms(0) }, length: 'runTime',
    run: (h, p) => h.rainbowWave(n(p, 'speed'), n(p, 'runTime')) },
  xyPrecisionRainbow: { description: 'Rainbow in xy colour space', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.xyPrecisionRainbow(n(p, 'duration')) },

  // Countdown
  countdownPulse: { description: 'Pulse that speeds up towards zero', params: { totalSeconds: { kind: 'number', default: 10, unit: 's' } }, length: 'totalSeconds',
    run: (h, p) => h.countdownPulse(n(p, 'totalSeconds')) },
  countdownPulseWithColors: { description: 'Countdown with custom colours', params: { totalSeconds: { kind: 'number', default: 10, unit: 's' }, startColor: color('darkRed'), endColor: color('brightGreen') }, length: 'totalSeconds',
    run: (h, p) => h.countdownPulseWithColors(n(p, 'totalSeconds'), c(p, 'startColor'), c(p, 'endColor')) },
  segmentedCountdownPulse: { description: 'Countdown per segment', params: { totalSeconds: { kind: 'number', default: 10, unit: 's' } }, length: 'totalSeconds',
    run: (h, p) => h.segmentedCountdownPulse(n(p, 'totalSeconds')) },

  // Environment and specials
  sunriseEffect: { description: 'Candlelight to daylight', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.sunriseEffect(n(p, 'duration')) },
  candlelightFlicker: { description: 'Candle flicker', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.candlelightFlicker(n(p, 'duration')) },
  dayNightCycle: { description: 'Day to night', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.dayNightCycle(n(p, 'duration')) },
  fadeToBlack: { description: 'Fade out', params: {},
    run: (h) => h.fadeToBlack() },
  multiLayerAlphaBlend: { description: 'Layered alpha blend', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.multiLayerAlphaBlend(n(p, 'duration')) },
  lightningStrike: { description: 'Lightning', params: { duration: ms(1000) }, length: 'duration',
    run: (h, p) => h.lightningStrike(n(p, 'duration')) },
  poisonDrip: { description: 'Green drip', params: { duration: ms(3000) }, length: 'duration',
    run: (h, p) => h.poisonDrip(n(p, 'duration')) },
  iceShatter: { description: 'Ice shatter', params: { duration: ms(1500) }, length: 'duration',
    run: (h, p) => h.iceShatter(n(p, 'duration')) }
};

export const EFFECT_NAMES: readonly string[] = Object.keys(EFFECT_CATALOG);

export function isColorName(value: unknown): value is ColorName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(COLORS, value);
}

/**
 * Validates raw config params against the spec and resolves colour names to colours.
 * Throws with the offending parameter so a config error is one line to fix.
 */
export function resolveParams(effectType: string, raw: Record<string, unknown>): ResolvedParams {
  const spec = EFFECT_CATALOG[effectType];
  if (!spec) {
    throw new Error(`Unknown effect type "${effectType}". Known: ${EFFECT_NAMES.join(', ')}`);
  }
  for (const key of Object.keys(raw)) {
    if (!(key in spec.params)) {
      throw new Error(`Effect "${effectType}" has no parameter "${key}"; it takes ${Object.keys(spec.params).join(', ') || 'none'}`);
    }
  }
  const resolved: ResolvedParams = {};
  for (const [key, param] of Object.entries(spec.params)) {
    const value = raw[key] ?? param.default;
    if (value === undefined) {
      throw new Error(`Effect "${effectType}" is missing required parameter "${key}"`);
    }
    switch (param.kind) {
      case 'color':
        if (!isColorName(value)) {
          throw new Error(`Effect "${effectType}" parameter "${key}" must be a colour name, got ${JSON.stringify(value)}. Valid: ${Object.keys(COLORS).join(', ')}`);
        }
        resolved[key] = COLORS[value];
        break;
      case 'colors':
        if (!Array.isArray(value) || value.length === 0 || !value.every(isColorName)) {
          throw new Error(`Effect "${effectType}" parameter "${key}" must be a non-empty list of colour names, got ${JSON.stringify(value)}`);
        }
        resolved[key] = (value as ColorName[]).map(name => COLORS[name]);
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new Error(`Effect "${effectType}" parameter "${key}" must be a non-negative number, got ${JSON.stringify(value)}`);
        }
        resolved[key] = value;
        break;
    }
  }
  return resolved;
}

/** How long the effect owns the strip, in ms, from its resolved params. Always finite and positive. */
export function effectLengthMs(effectType: string, params: ResolvedParams): number {
  const spec = EFFECT_CATALOG[effectType];
  if (!spec || !spec.length) {
    return DEFAULT_LENGTH_MS;
  }
  const value = params[spec.length];
  if (typeof value !== 'number' || value <= 0) {
    // runTime 0 means "until stopped"; the duration param then sets one cycle
    const duration = params.duration;
    return typeof duration === 'number' && duration > 0 ? duration : DEFAULT_LENGTH_MS;
  }
  return spec.length === 'totalSeconds' ? value * 1000 : value;
}

export function runEffect(hue: Hue, effectType: string, params: ResolvedParams): void {
  const spec = EFFECT_CATALOG[effectType];
  if (!spec) {
    throw new Error(`Unknown effect type "${effectType}"`);
  }
  spec.run(hue, params);
}
