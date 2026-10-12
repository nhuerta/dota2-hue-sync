#!/usr/bin/env bun
/**
 * Browse every effect in the catalog on the real lights. Lists effects with their parameters
 * and defaults, prompts for values, runs the effect for its length, then returns to idle.
 */
import * as dotenv from 'dotenv';
import * as readline from 'node:readline/promises';
import { Hue, COLORS } from '@nhuerta/node-hue-edk';
import { APP_CONFIG } from '../src/config/app-config';
import { EFFECT_CATALOG, EFFECT_NAMES, effectLengthMs, resolveParams, runEffect, type ParamSpec } from '../src/game/effect-catalog';

dotenv.config();

const IDLE = { r: 0, g: 100, b: 200 };

function describeParam(name: string, spec: ParamSpec): string {
  const def = spec.default === undefined ? 'required' : Array.isArray(spec.default) ? spec.default.join(',') : String(spec.default);
  const kind = spec.kind === 'number' ? (spec.unit ?? 'number') : spec.kind;
  return `${name} (${kind}, ${def})`;
}

function listEffects(): void {
  console.log('\nEffects:');
  EFFECT_NAMES.forEach((name, i) => {
    const spec = EFFECT_CATALOG[name]!;
    const params = Object.entries(spec.params).map(([k, p]) => describeParam(k, p)).join(', ');
    console.log(`${String(i + 1).padStart(3)}. ${name.padEnd(28)} ${spec.description}${params ? `  [${params}]` : ''}`);
  });
  console.log(`\nColours: ${Object.keys(COLORS).join(', ')}\n`);
}

function parseValue(spec: ParamSpec, text: string): unknown {
  if (text === '') {
    return spec.default;
  }
  if (spec.kind === 'number') {
    return Number(text);
  }
  if (spec.kind === 'colors') {
    return text.split(',').map(s => s.trim());
  }
  return text.trim();
}

async function main(): Promise<void> {
  const hue = new Hue(APP_CONFIG);
  if (!(await hue.initialize())) {
    console.error('Hue initialization failed');
    process.exit(1);
  }
  hue.setSolidColor(IDLE);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const quit = () => {
    rl.close();
    hue.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', quit);

  listEffects();
  for (;;) {
    const answer = (await rl.question('Effect number or name (l to list, q to quit): ')).trim();
    if (answer === 'q') {
      break;
    }
    if (answer === 'l') {
      listEffects();
      continue;
    }
    const name = /^\d+$/.test(answer) ? EFFECT_NAMES[Number(answer) - 1] : answer;
    const spec = name ? EFFECT_CATALOG[name] : undefined;
    if (!name || !spec) {
      console.log('No such effect');
      continue;
    }
    const raw: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(spec.params)) {
      const text = (await rl.question(`  ${describeParam(key, param)}: `)).trim();
      const value = parseValue(param, text);
      if (value !== undefined) {
        raw[key] = value;
      }
    }
    try {
      const params = resolveParams(name, raw);
      const length = effectLengthMs(name, params);
      console.log(`Playing ${name} for ${length} ms`);
      runEffect(hue, name, params);
      await new Promise(resolve => setTimeout(resolve, length));
      hue.stopCurrentEffect();
      hue.setSolidColor(IDLE);
    } catch (error) {
      console.log(error instanceof Error ? error.message : String(error));
    }
  }
  quit();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
