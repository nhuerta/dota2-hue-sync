import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseEffectsConfig } from '../src/game/effect-config-loader';
import { EFFECT_CATALOG, EFFECT_NAMES, effectLengthMs, resolveParams } from '../src/game/effect-catalog';
import { Priority } from '../src/game/effect-scheduler';

const CONFIG_PATH = fileURLToPath(new URL('../config/effects-config.json', import.meta.url));

function config(effects: Record<string, unknown>) {
  return { version: '1.0', effects };
}

describe('effects config', () => {
  test('the shipped config is valid and every entry is enabled', () => {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as { effects: Record<string, unknown> };
    const bindings = parseEffectsConfig(raw);
    expect(bindings.length).toBe(Object.keys(raw.effects).length);
    expect(bindings.every(b => b.lengthMs > 0 && Number.isFinite(b.lengthMs))).toBe(true);
  });

  test('rejects dot-separated and unknown event keys', () => {
    expect(() => parseEffectsConfig(config({ 'player.combat.kill': { enabled: true, type: 'flashColor', params: { color: 'red' } } })))
      .toThrow(/not a known event/);
  });

  test('rejects unknown effect types, parameters, colours and priorities', () => {
    expect(() => parseEffectsConfig(config({ 'player:combat:kill': { enabled: true, type: 'disco', params: {} } })))
      .toThrow(/Unknown effect type "disco"/);
    expect(() => parseEffectsConfig(config({ 'player:combat:kill': { enabled: true, type: 'flashColor', params: { color: 'red', speed: 1 } } })))
      .toThrow(/no parameter "speed"/);
    expect(() => parseEffectsConfig(config({ 'player:combat:kill': { enabled: true, type: 'flashColor', params: { color: 'reddish' } } })))
      .toThrow(/must be a colour name/);
    expect(() => parseEffectsConfig(config({ 'player:combat:kill': { enabled: true, type: 'flashColor', params: { color: 'red' }, priority: 'urgent' } })))
      .toThrow(/unknown priority/);
  });

  test('a required colour without a default is reported even when the entry is disabled', () => {
    expect(() => parseEffectsConfig(config({ 'player:combat:kill': { enabled: false, type: 'flashColor', params: {} } })))
      .toThrow(/missing required parameter "color"/);
  });

  test('resolves defaults, priorities and lengths', () => {
    const [kill] = parseEffectsConfig(config({
      'player:combat:kill': { enabled: true, type: 'gradientWave', params: { color1: 'red', color2: 'white', runTime: 2500 }, priority: 'high' }
    }));
    expect(kill?.priority).toBe(Priority.HIGH);
    expect(kill?.lengthMs).toBe(2500);
    expect(kill?.params.duration).toBe(2000);
  });
});

describe('effect catalog', () => {
  test('every effect resolves with its defaults when the required colours are given', () => {
    for (const name of EFFECT_NAMES) {
      const raw: Record<string, unknown> = {};
      for (const [key, spec] of Object.entries(EFFECT_CATALOG[name]!.params)) {
        if (spec.default === undefined) {
          raw[key] = spec.kind === 'colors' ? ['red'] : spec.kind === 'color' ? 'red' : 1;
        }
      }
      const params = resolveParams(name, raw);
      expect(effectLengthMs(name, params)).toBeGreaterThan(0);
    }
  });

  test('length follows runTime when set, duration otherwise, seconds for countdowns', () => {
    expect(effectLengthMs('rippleGradient', resolveParams('rippleGradient', { color: 'red', duration: 1000, runTime: 1500 }))).toBe(1500);
    expect(effectLengthMs('rippleGradient', resolveParams('rippleGradient', { color: 'red', duration: 1000 }))).toBe(1000);
    expect(effectLengthMs('countdownPulse', resolveParams('countdownPulse', { totalSeconds: 7 }))).toBe(7000);
    expect(effectLengthMs('fadeToBlack', resolveParams('fadeToBlack', {}))).toBe(2000);
  });
});
