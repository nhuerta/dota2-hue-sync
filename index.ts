import * as dotenv from 'dotenv';
import {EventDispatcher, GAME_EVENTS} from './src/game/events';
import {createGSIRoutes} from './src/server/routes';
import {createResponse} from './src/server/utils';
import type {DotaEffectManager} from './src/game/dota-effect-manager';

dotenv.config();

const eventDispatcher = new EventDispatcher();

// Log GSI errors
eventDispatcher.on(GAME_EVENTS.GSI.ERROR, (event) => {
  console.error('GSI Error:', event.data.error);
});
let dotaEffectManager: DotaEffectManager | null = null;
const gsiRouter = createGSIRoutes(eventDispatcher);

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

// Dota posts to localhost, which Windows resolves to ::1 first, so the listener answers on
// IPv6 as well as IPv4 ("::" is a dual-stack socket). Anything that is not loopback is
// refused unless GSI_ALLOW_REMOTE=1.
const allowRemote = process.env.GSI_ALLOW_REMOTE === '1';
function isLoopback(address: string): boolean {
  return address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.');
}

const gsiServer = {
  port: 3003,
  async fetch(request: Request, server: { requestIP(request: Request): { address: string } | null }) {
    const remote = server.requestIP(request)?.address;
    if (!allowRemote && remote && !isLoopback(remote)) {
      return createResponse('Forbidden', { status: 403 });
    }
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

let server: ReturnType<typeof Bun.serve>;
try {
  server = Bun.serve({ ...gsiServer, hostname: '::' });
} catch (error) {
  console.log('Dual-stack listener unavailable, falling back to IPv4 only:', error);
  server = Bun.serve({ ...gsiServer, hostname: '0.0.0.0' });
}
console.log(`GSI listener on port ${server.port}${allowRemote ? ' (remote senders allowed)' : ' (loopback only)'}`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  server.stop(true);
  gsiRouter.close();
  if (dotaEffectManager) {
    await dotaEffectManager.shutdown();
  }
  process.exit(0);
}
process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });
