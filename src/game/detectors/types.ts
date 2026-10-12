import type { EventData, GameEventType } from '../events';
import type { Dota2GameState } from '../dota2-types';

/** A frame paired with what it is being compared against. */
export interface Frame {
  current: Dota2GameState;
  /** Dota's `previously` block when present, otherwise the full frame before this one. */
  previous: Partial<Dota2GameState>;
  gameTime: number;
}

export interface DetectedEvent {
  type: GameEventType;
  data: EventData;
  gameTime: number;
}

/** Collects events from a detector. `gameTime` defaults to the frame's. */
export type Emit = (type: GameEventType, data?: EventData, gameTime?: number) => void;

/**
 * A detector compares one frame against the previous one and emits the events it finds.
 * Detectors are synchronous, do no I/O, and keep state only when the game requires it
 * (multikill windows, buyback pending, map events already seen).
 */
export interface Detector {
  readonly name: string;
  detect(frame: Frame, emit: Emit): void;
  /** Forget per-match state; called on a cold start or a new match. */
  reset?(): void;
}
