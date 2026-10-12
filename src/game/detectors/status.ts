import { GAME_EVENTS, type GameEventType } from '../events';
import type { Detector } from './types';

/** Hero status flags turned into `player:status:*` events on both edges. */
const STATUS_FLAGS: Readonly<Record<string, GameEventType>> = {
  silenced: GAME_EVENTS.PLAYER.STATUS.SILENCED,
  stunned: GAME_EVENTS.PLAYER.STATUS.STUNNED,
  disarmed: GAME_EVENTS.PLAYER.STATUS.DISARMED,
  magicimmune: GAME_EVENTS.PLAYER.STATUS.MAGIC_IMMUNE,
  hexed: GAME_EVENTS.PLAYER.STATUS.HEXED,
  muted: GAME_EVENTS.PLAYER.STATUS.MUTED,
  break: GAME_EVENTS.PLAYER.STATUS.BREAK,
  smoked: GAME_EVENTS.PLAYER.STATUS.SMOKED
};

export const statusDetector: Detector = {
  name: 'status',
  detect({ current, previous }, emit) {
    if (!current.hero || !previous.hero) {
      return;
    }
    const before = previous.hero as unknown as Record<string, unknown>;
    const after = current.hero as unknown as Record<string, unknown>;
    for (const [flag, eventType] of Object.entries(STATUS_FLAGS)) {
      const was = before[flag];
      const is = after[flag];
      if (typeof was === 'boolean' && typeof is === 'boolean' && was !== is) {
        emit(eventType, { status: flag, active: is });
      }
    }
  }
};
