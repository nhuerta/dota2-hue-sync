import { Hue, type HueConfig } from '@nhuerta/node-hue-edk';

export const HUE_INIT_ATTEMPTS = 6;
export const HUE_INIT_RETRY_MS = 3000;

/**
 * Connects to the bridge and starts streaming. The bridge keeps a previous instance's stream
 * registered for about 10 s after it dies and the EDK then reports "streaming failed", so the
 * attempt is repeated a few times before giving up.
 */
export async function connectHue(
  config: HueConfig,
  attempts: number = HUE_INIT_ATTEMPTS,
  retryMs: number = HUE_INIT_RETRY_MS
): Promise<Hue | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      console.log(`Hue initialization attempt ${attempt}/${attempts} in ${retryMs / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, retryMs));
    }
    const hue = new Hue(config);
    if (await hue.initialize()) {
      return hue;
    }
  }
  return null;
}
