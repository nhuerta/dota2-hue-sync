import * as dotenv from 'dotenv';
import {EventDispatcher, GAME_EVENTS} from './src/game/events';
import {createGSIRoutes, stopConnectionWatchdog} from './src/server/routes';
import {createResponse} from './src/server/utils';
import type {DotaEffectManager} from './src/game/dota-effect-manager';

dotenv.config();

const eventDispatcher = new EventDispatcher();

// Log GSI errors
eventDispatcher.on(GAME_EVENTS.GSI.ERROR, (event) => {
  console.error('GSI Error:', event.data.error);
});
let dotaEffectManager: DotaEffectManager | null = null;

process.on('SIGINT', () => {
  stopConnectionWatchdog();
  if (dotaEffectManager) {
    dotaEffectManager.shutdown();
  }
  process.exit(0);
});

async function initializeLightEffects() {
  try {
    const { DotaEffectManager } = await import('./src/game/dota-effect-manager.ts');
    dotaEffectManager = new DotaEffectManager(eventDispatcher);

    const started = await dotaEffectManager.initialize();

    if (!started) {
      console.log('DotaEffectManager initialization failed');
    } else {
      console.log('DotaEffectManager initialized successfully');
    }
  } catch (error) {
    console.log('Error during initialization:', error);
  }
}

initializeLightEffects();

const gsiRouter = createGSIRoutes(eventDispatcher);

// Dota resolves "localhost" to ::1 first on Windows, so the listener must answer on
// IPv6 as well as IPv4. Binding "::" gives a dual-stack socket; fall back to IPv4 only.
const gsiServer = {
  port: 3003,
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return createResponse(null, { status: 204 });
    }

    const response = await gsiRouter.handle(request, url);
    if (response) {
      return response;
    }

    return createResponse('Not Found', { status: 404 });
  }
};
try {
  Bun.serve({ ...gsiServer, hostname: '::' });
} catch (error) {
  console.log('Dual-stack listener unavailable, falling back to IPv4 only:', error);
  Bun.serve({ ...gsiServer, hostname: '0.0.0.0' });
}