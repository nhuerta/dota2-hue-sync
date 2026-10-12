import { describe, expect, test, beforeAll } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { loadFixture, replayFrames, type FixtureFrame, type ReplayResult } from '../src/testing/replay';

const FIXTURE = fileURLToPath(new URL('../fixtures/match_8200614096.jsonl.gz', import.meta.url));

let frames: FixtureFrame[];
let result: ReplayResult;

beforeAll(async () => {
  frames = loadFixture(FIXTURE);
  result = await replayFrames(frames);
});

describe('fixture match 8200614096 (Mirana)', () => {
  test('loads every unique frame including heartbeats', () => {
    expect(frames.length).toBe(1924);
    expect(frames.filter(f => !f.payload.previously).length).toBe(18);
  });

  test('heartbeat frames during a running game do not restart the game', () => {
    // 17 of the 18 frames without `previously` arrive mid-game; only the real start may fire.
    expect(result.dispatcher.ofType('game:started').length).toBeLessThanOrEqual(1);
  });

  test('detects the three deaths and three respawns', () => {
    expect(result.dispatcher.ofType('player:combat:death').length).toBe(3);
    expect(result.dispatcher.ofType('player:combat:respawn').length).toBe(3);
  });

  test('no buyback is reported in a match without one', () => {
    expect(result.dispatcher.ofType('player:combat:buyback').length).toBe(0);
  });

  test('emits no detector errors', () => {
    expect(result.dispatcher.ofType('gsi:error')).toEqual([]);
  });
});
