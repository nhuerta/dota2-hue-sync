import { EventDispatcher } from '../game/events';
import { GAME_EVENTS } from '../game/events';
import { GameEventDetector } from '../game/detector';
import type { Dota2GameState } from '../game/dota2-types';
import { TIMING } from '../game/constants';

interface GSIState {
  eventDispatcher: EventDispatcher;
  gameEventDetector: GameEventDetector;
  isConnected: boolean;
  lastDataReceived: number;
}

let watchdogInterval: ReturnType<typeof setInterval> | null = null;

export function createGSIRoutes(eventDispatcher: EventDispatcher) {
  const state: GSIState = {
    eventDispatcher: eventDispatcher,
    gameEventDetector: new GameEventDetector(eventDispatcher),
    isConnected: false,
    lastDataReceived: Date.now()
  };
  startConnectionWatchdog(state);
  return {
    async handle(request: Request, url: URL): Promise<Response | null> {
      const { method } = request;
      const { pathname } = url;
      if (method === 'POST' && pathname === '/') {
        return handleGSIData(request, state);
      }
      return null;
    }
  };
}

export function stopConnectionWatchdog(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
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
    if (!state.isConnected) {
      state.isConnected = true;
      await state.eventDispatcher.emit(GAME_EVENTS.GSI.CONNECTED, {
        provider: gsiData.provider,
        timestamp: Date.now(),
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
    state.lastDataReceived = Date.now();
    await state.gameEventDetector.processGSIData(gsiData);
    await state.eventDispatcher.emit(GAME_EVENTS.GSI.DATA, { ...gsiData });
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
  watchdogInterval = setInterval(async () => {
    if (state.isConnected && Date.now() - state.lastDataReceived > TIMING.GSI_DISCONNECT_TIMEOUT) {
      state.isConnected = false;
      await state.eventDispatcher.emit(GAME_EVENTS.GSI.DISCONNECTED, { timestamp: Date.now() });
    }
  }, TIMING.WATCHDOG_INTERVAL);
}