import { EventDispatcher } from '../game/events';
import { GAME_EVENTS } from '../game/events';
import { GameEventDetector } from '../game/detector';
import type { Dota2GameState } from '../game/dota2-types';
import { TIMING } from '../game/constants';
import { createRecorderFromEnv, type FrameRecorder } from './recorder';

export interface GSIState {
  eventDispatcher: EventDispatcher;
  gameEventDetector: GameEventDetector;
  recorder: FrameRecorder | null;
  /** When set, frames whose auth.token differs are rejected (GSI_AUTH_TOKEN). */
  authToken: string | null;
  isConnected: boolean;
  lastDataReceived: number;
}

let watchdogInterval: ReturnType<typeof setInterval> | null = null;

export function createGSIState(eventDispatcher: EventDispatcher, recorder: FrameRecorder | null = null, authToken: string | null = null): GSIState {
  return {
    eventDispatcher,
    gameEventDetector: new GameEventDetector(eventDispatcher),
    recorder,
    authToken,
    isConnected: false,
    lastDataReceived: Date.now()
  };
}

export function createGSIRoutes(eventDispatcher: EventDispatcher) {
  const state = createGSIState(eventDispatcher, createRecorderFromEnv(), process.env.GSI_AUTH_TOKEN || null);
  if (state.authToken) {
    console.log('GSI auth token required on every frame');
  }
  startConnectionWatchdog(state);
  return {
    state,
    async handle(request: Request, url: URL): Promise<Response | null> {
      const { method } = request;
      const { pathname } = url;
      if (method === 'POST' && pathname === '/') {
        return handleGSIData(request, state);
      }
      return null;
    },
    close(): void {
      stopConnectionWatchdog();
      state.recorder?.close();
    }
  };
}

export function stopConnectionWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

/** One-line description of a raw frame, logged whenever the pipeline changes connection state. */
export function describeFrame(frame: Dota2GameState): string {
  return [
    `state=${frame.map?.game_state ?? 'none'}`,
    `match=${frame.map?.matchid ?? 'none'}`,
    `t=${frame.map?.game_time ?? '?'}`,
    `previously=${frame.previously ? 'yes' : 'no'}`,
    `hero=${frame.hero?.name ?? 'none'}`,
    `alive=${frame.hero?.alive ?? '?'}`,
    `respawn=${frame.hero?.respawn_seconds ?? '?'}`,
    `paused=${frame.map?.paused ?? '?'}`
  ].join(' ');
}

/**
 * Runs one frame through the full pipeline: connection tracking, detection, and the raw-data event.
 * Shared by the HTTP handler and the replay harness so tests exercise the same code path as a match.
 * `now` is wall-clock in the server and the capture time during replay.
 */
export async function ingestGSIData(gsiData: Dota2GameState, state: GSIState, now: number = Date.now()): Promise<void> {
  state.recorder?.record(gsiData);
  if (!state.isConnected) {
    state.isConnected = true;
    console.log(`[gsi] connected on frame: ${describeFrame(gsiData)}`);
    await state.eventDispatcher.emit(GAME_EVENTS.GSI.CONNECTED, {
      provider: gsiData.provider,
      timestamp: now,
      current_state: {
        hero: {
          alive: gsiData.hero?.alive,
          respawn_seconds: gsiData.hero?.respawn_seconds,
          health_percent: gsiData.hero?.health && gsiData.hero?.max_health
            ? (gsiData.hero.health / gsiData.hero.max_health) * 100
            : 100
        },
        map: {
          game_state: gsiData.map?.game_state
        }
      }
    });
  }
  state.lastDataReceived = now;
  await state.gameEventDetector.processGSIData(gsiData);
}

/** Marks the connection lost if no frame arrived within the disconnect timeout. */
export async function checkConnectionTimeout(state: GSIState, now: number = Date.now()): Promise<void> {
  if (state.isConnected && now - state.lastDataReceived > TIMING.GSI_DISCONNECT_TIMEOUT) {
    state.isConnected = false;
    await state.eventDispatcher.emit(GAME_EVENTS.GSI.DISCONNECTED, { timestamp: now });
  }
}

async function handleGSIData(request: Request, state: GSIState): Promise<Response> {
  try {
    const rawData = await request.json() as unknown;
    if (typeof rawData !== 'object' || rawData === null) {
      await state.eventDispatcher.emit(GAME_EVENTS.GSI.ERROR, { error: 'Invalid GSI data format' });
      return new Response('Invalid data format', { status: 400 });
    }
    const gsiData = rawData as Dota2GameState;
    if (state.authToken && gsiData.auth?.token !== state.authToken) {
      return new Response('Bad auth token', { status: 401 });
    }
    await ingestGSIData(gsiData, state);
    return new Response('', { status: 200 });
  } catch (error) {
    await state.eventDispatcher.emit(GAME_EVENTS.GSI.ERROR, { error: String(error) });
    return new Response('Error processing data', { status: 500 });
  }
}

function startConnectionWatchdog(state: GSIState): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
  }
  watchdogInterval = setInterval(() => {
    checkConnectionTimeout(state).catch(error => console.error('Watchdog error:', error));
  }, TIMING.WATCHDOG_INTERVAL);
}
