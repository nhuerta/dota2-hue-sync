import { EventDispatcher, GAME_EVENTS, type GameEvent } from './events';
import { type Color, COLORS, type Hue } from '@nhuerta/node-hue-edk';
import { getNumber } from '../util/number';
import type { EffectBinding } from './effect-config-loader';
import { runEffect } from './effect-catalog';
import { EffectScheduler, Priority } from './effect-scheduler';
import { GAME_STATES } from './constants';

const DEATH_RIPPLE_MS = 3000;
const RESPAWN_EFFECT_MS = 1500;
/** Countdown is re-synced to the game's respawn timer when it drifts by more than this. */
const COUNTDOWN_DRIFT_MS = 1500;
const CRITICAL_HEALTH_PERCENT = 20;
const AMBIENT_REFRESH_MS = 1000;
const IDLE_COLOR: Color = { r: 0, g: 100, b: 200 };

/** Priority an event's effect gets unless the config says otherwise. */
export function defaultPriority(eventKey: string): Priority {
  switch (eventKey) {
    case GAME_EVENTS.PLAYER.COMBAT.KILL:
    case GAME_EVENTS.PLAYER.COMBAT.BUYBACK:
    case GAME_EVENTS.MAP.ROSHAN_KILLED:
    case GAME_EVENTS.MAP.AEGIS_PICKED_UP:
    case GAME_EVENTS.MAP.AEGIS_DENIED:
      return Priority.HIGH;
    case GAME_EVENTS.PLAYER.COMBAT.ASSIST:
    case GAME_EVENTS.PLAYER.RESOURCES.LEVEL_UP:
    case GAME_EVENTS.MAP.COURIER_KILLED:
      return Priority.NORMAL;
    default:
      return eventKey.startsWith('game:') ? Priority.CRITICAL : Priority.LOW;
  }
}

/**
 * Turns game events into light output. Owns the hero state the lights depend on (in game,
 * alive, health), paints the ambient layer, runs the death sequence against the game's own
 * respawn timer, and hands configured effects to the scheduler. It is given a connected Hue
 * and the validated bindings; it never connects or loads anything itself.
 */
export class DotaEffectManager {
  private readonly hue: Hue;
  private readonly bindings: readonly EffectBinding[];
  private readonly scheduler: EffectScheduler;
  private readonly eventDispatcher: EventDispatcher;
  private currentHealth = 100;
  private isBreathingActive = false;
  private isAlive = true;
  private isInGame = false;
  /** Scheduler-clock time at which the hero is expected back, while dead. */
  private respawnDeadline: number | null = null;
  private countdownStarted = false;
  private deathRippleTimer: unknown = null;
  private ambientInterval: ReturnType<typeof setInterval> | null = null;

  constructor(eventDispatcher: EventDispatcher, hue: Hue, bindings: readonly EffectBinding[], scheduler: EffectScheduler = new EffectScheduler()) {
    this.eventDispatcher = eventDispatcher;
    this.hue = hue;
    this.bindings = bindings;
    this.scheduler = scheduler;
    this.scheduler.onTrace = line => console.log(`[scheduler] ${line}`);
    this.registerStateHandlers();
    this.registerEffectHandlers();
  }

  /** Paints the ambient layer and starts repainting it periodically (percentageBar is a static frame). */
  start(): void {
    this.scheduler.setAmbient(() => this.paintAmbient());
    this.ambientInterval = setInterval(() => this.scheduler.refreshAmbient(), AMBIENT_REFRESH_MS);
  }

  shutdown(): void {
    if (this.ambientInterval) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
    this.clearDeathTimers();
    this.scheduler.setAmbient(null);
    this.scheduler.clear('shutdown');
    this.hue.shutdown();
  }

  private registerStateHandlers(): void {
    this.eventDispatcher.on(GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED, (event: GameEvent) => {
      this.currentHealth = getNumber(event.data.health_percent, this.currentHealth);
      this.scheduler.refreshAmbient();
    });
    this.eventDispatcher.on(GAME_EVENTS.PLAYER.COMBAT.DEATH, (event: GameEvent) => {
      this.onDeath(getNumber(event.data.respawn_seconds, 30));
    });
    this.eventDispatcher.on(GAME_EVENTS.PLAYER.COMBAT.RESPAWN_TICK, (event: GameEvent) => {
      this.onRespawnTick(getNumber(event.data.respawn_seconds));
    });
    // A buyback is followed by a respawn frame; that one drives the lights.
    this.eventDispatcher.on(GAME_EVENTS.PLAYER.COMBAT.RESPAWN, () => this.onRespawn());
    this.eventDispatcher.on(GAME_EVENTS.GAME.STARTED, (event: GameEvent) => {
      this.isInGame = true;
      this.currentHealth = getNumber(event.data.health_percent, 100);
      this.scheduler.refreshAmbient();
    });
    this.eventDispatcher.on(GAME_EVENTS.GAME.ENDED, () => this.leaveGame('match ended'));
    this.eventDispatcher.on(GAME_EVENTS.GSI.CONNECTED, (event: GameEvent) => this.onConnected(event));
    // Dota stops posting on pause, on leaving the match, and often before POST_GAME.
    this.eventDispatcher.on(GAME_EVENTS.GSI.DISCONNECTED, () => {
      if (this.isInGame) {
        this.leaveGame('GSI disconnected');
      }
    });
  }

  private registerEffectHandlers(): void {
    for (const binding of this.bindings) {
      const priority = binding.priority ?? defaultPriority(binding.event);
      this.eventDispatcher.on(binding.event, (event: GameEvent) => {
        if (!this.isAlive && priority < Priority.CRITICAL) {
          return;
        }
        // A reconnect synthesises the current state (game:started, death); that is not a moment to celebrate.
        if (event.data.cold_start === true) {
          return;
        }
        this.scheduler.request({
          name: binding.event,
          priority,
          duration: binding.lengthMs,
          run: () => {
            this.isBreathingActive = false;
            console.log(`[effect] ${binding.type} for ${binding.event}`);
            runEffect(this.hue, binding.type, binding.params);
          }
        });
      });
    }
  }

  /** Frames resumed after a start-up, pause or reconnect: adopt the state Dota reports. */
  private onConnected(event: GameEvent): void {
    const state = event.data.current_state as Record<string, unknown> | undefined;
    if (!state || typeof state !== 'object') {
      return;
    }
    const mapState = state.map as { game_state?: string } | undefined;
    const heroState = state.hero as { alive?: boolean; respawn_seconds?: number; health_percent?: number } | undefined;
    this.isInGame = mapState?.game_state === GAME_STATES.GAME_IN_PROGRESS;
    if (typeof heroState?.health_percent === 'number') {
      this.currentHealth = heroState.health_percent;
    }
    if (!this.isInGame) {
      this.scheduler.refreshAmbient();
      return;
    }
    // The hero may still be dead from before the gap. Only start a death sequence if we did not
    // already know about it; otherwise just re-sync the countdown.
    if (heroState?.alive === false && heroState?.respawn_seconds && heroState.respawn_seconds > 0) {
      if (this.isAlive) {
        this.onDeath(heroState.respawn_seconds);
      } else {
        this.onRespawnTick(heroState.respawn_seconds);
      }
    } else if (!this.isAlive) {
      this.onRespawn();
    } else {
      this.scheduler.refreshAmbient();
    }
  }

  /** Background layer: what the strip shows when no effect is playing. */
  private paintAmbient(): void {
    if (!this.isInGame) {
      this.stopBreathing();
      this.hue.setSolidColor(IDLE_COLOR);
      return;
    }
    if (!this.isAlive) {
      // The death sequence owns the strip until the respawn effect runs.
      return;
    }
    const isCritical = this.currentHealth > 0 && this.currentHealth <= CRITICAL_HEALTH_PERCENT;
    if (isCritical) {
      if (!this.isBreathingActive) {
        console.log(`[effect] breathingGradient (critical health ${Math.round(this.currentHealth)}%)`);
        this.hue.breathingGradient(COLORS.red, COLORS.black, 1500);
        this.isBreathingActive = true;
      }
      return;
    }
    if (this.isBreathingActive) {
      this.stopBreathing();
      console.log(`[effect] percentageBar (recovered to ${Math.round(this.currentHealth)}%)`);
    }
    this.hue.percentageBar(this.currentHealth);
  }

  private stopBreathing(): void {
    if (this.isBreathingActive) {
      this.hue.stopCurrentEffect();
      this.isBreathingActive = false;
    }
  }

  private onDeath(respawnSeconds: number): void {
    if (!this.isAlive) {
      // Already running the death sequence (a reconnect reports the death again): keep it, re-sync the clock.
      this.onRespawnTick(respawnSeconds);
      return;
    }
    this.isAlive = false;
    this.isBreathingActive = false;
    this.clearDeathTimers();
    this.respawnDeadline = this.scheduler.clock.now() + respawnSeconds * 1000;

    console.log(`[effect] death sequence (respawn in ${respawnSeconds}s)`);
    this.scheduler.request({
      name: 'death',
      priority: Priority.CRITICAL,
      duration: Math.max(DEATH_RIPPLE_MS, respawnSeconds * 1000),
      run: () => {
        this.hue.rippleGradient(COLORS.darkRed, 2000, 1000);
        this.deathRippleTimer = this.scheduler.clock.setTimeout(() => {
          this.deathRippleTimer = null;
          this.startCountdown();
        }, DEATH_RIPPLE_MS);
      }
    });
  }

  private startCountdown(): void {
    if (this.isAlive || this.respawnDeadline === null) {
      return;
    }
    const remainingSeconds = (this.respawnDeadline - this.scheduler.clock.now()) / 1000;
    this.countdownStarted = true;
    if (remainingSeconds > 1) {
      console.log(`[effect] countdownPulse ${Math.round(remainingSeconds)}s`);
      this.hue.countdownPulse(remainingSeconds);
    }
  }

  /** The game's respawn timer is authoritative; it stops during pauses while our clock does not. */
  private onRespawnTick(respawnSeconds: number): void {
    if (this.isAlive || this.respawnDeadline === null) {
      return;
    }
    const now = this.scheduler.clock.now();
    const deadline = now + respawnSeconds * 1000;
    if (Math.abs(deadline - this.respawnDeadline) <= COUNTDOWN_DRIFT_MS) {
      return;
    }
    console.log(`[effect] countdown resynced: ${Math.round((this.respawnDeadline - now) / 1000)}s -> ${respawnSeconds}s`);
    this.respawnDeadline = deadline;
    if (this.countdownStarted) {
      this.startCountdown();
    }
  }

  private onRespawn(): void {
    this.clearDeathTimers();
    this.respawnDeadline = null;
    this.isAlive = true;
    this.currentHealth = 100;
    this.isBreathingActive = false;

    console.log('[effect] respawn gradientWave');
    this.scheduler.request({
      name: 'respawn',
      priority: Priority.CRITICAL,
      duration: RESPAWN_EFFECT_MS,
      run: () => this.hue.gradientWave(COLORS.brightGreen, COLORS.white, 1000, RESPAWN_EFFECT_MS)
    });
  }

  private leaveGame(reason: string): void {
    console.log(`[effect] ${reason}, going idle`);
    this.isInGame = false;
    this.isAlive = true;
    this.respawnDeadline = null;
    this.clearDeathTimers();
    this.scheduler.clear(reason);
  }

  private clearDeathTimers(): void {
    if (this.deathRippleTimer !== null) {
      this.scheduler.clock.clearTimeout(this.deathRippleTimer);
      this.deathRippleTimer = null;
    }
    this.countdownStarted = false;
  }
}
