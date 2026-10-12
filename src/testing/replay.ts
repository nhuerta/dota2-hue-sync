import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { EventDispatcher, type EventData, type GameEvent, type GameEventType } from '../game/events';
import type { Dota2GameState } from '../game/dota2-types';
import { checkConnectionTimeout, createGSIState, ingestGSIData, type GSIState } from '../server/routes';

export interface FixtureFrame {
  /** Capture time as written by the recorder. */
  t: string;
  payload: Dota2GameState;
}

/** Reads a JSONL (optionally gzipped) fixture written by FrameRecorder or scripts/import-fixtures.py. */
export function loadFixture(path: string): FixtureFrame[] {
  const raw = readFileSync(path);
  const text = path.endsWith('.gz') ? gunzipSync(raw).toString('utf-8') : raw.toString('utf-8');
  return text
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as FixtureFrame);
}

/** Captures every emitted event instead of logging or dispatching it. */
export class RecordingDispatcher extends EventDispatcher {
  readonly events: GameEvent[] = [];

  override async emit(eventType: GameEventType | string, data: EventData, gameTime?: number): Promise<void> {
    this.events.push({ type: eventType, timestamp: Date.now(), gameTime, data });
  }

  ofType(type: string): GameEvent[] {
    return this.events.filter(event => event.type === type);
  }

  /** Event types in emission order, with the 10 Hz resource events removed for readable assertions. */
  sequence(): string[] {
    return this.events
      .map(event => event.type)
      .filter(type => type !== 'player:combat:respawn_tick' && !type.startsWith('player:resources:'));
  }
}

export interface ReplayResult {
  dispatcher: RecordingDispatcher;
  state: GSIState;
  frames: number;
}

/**
 * Feeds frames through the same ingest path the HTTP server uses. The capture timestamp drives the
 * clock, so a gap longer than the disconnect timeout between two frames produces the same
 * `gsi:disconnected` the watchdog would have produced during the live match.
 */
export async function replayFrames(frames: Iterable<FixtureFrame>, dispatcher = new RecordingDispatcher()): Promise<ReplayResult> {
  const state = createGSIState(dispatcher);
  let count = 0;
  for (const frame of frames) {
    const now = frame.t ? Date.parse(frame.t) : state.lastDataReceived + 100;
    await checkConnectionTimeout(state, now);
    await ingestGSIData(frame.payload, state, now);
    count += 1;
  }
  return { dispatcher, state, frames: count };
}

export async function replayFixture(path: string): Promise<ReplayResult> {
  return replayFrames(loadFixture(path));
}
