import {EventDispatcher, GAME_EVENTS, type GameEvent, type GameEventType} from './events';
import {type Color, COLORS, Hue} from '@nhuerta/node-hue-edk';
import {getNumber} from '../server/utils';
import {type EffectConfig, EffectConfigLoader, type EffectsConfiguration} from './effect-config-loader';
import {EffectRegistry} from './effect-registry';
import {EffectScheduler, PRIORITY_NAMES, Priority} from './effect-scheduler';
import {APP_CONFIG} from '../config/app-config';
import {GAME_STATES} from './constants';

const DEATH_RIPPLE_MS = 3000;
const RESPAWN_EFFECT_MS = 1500;
/** Countdown is re-synced to the game's respawn timer when it drifts by more than this. */
const COUNTDOWN_DRIFT_MS = 1500;
const CRITICAL_HEALTH_PERCENT = 20;

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
 * Maps game events to light effects. The scheduler decides what plays when; this class decides
 * what the ambient layer looks like (idle, health bar, critical breathing) and runs the death
 * sequence, which follows the game's own respawn timer rather than the wall clock.
 */
export class DotaEffectManager {
    private hue: Hue;
    private readonly INIT_ATTEMPTS = 6;
    private readonly INIT_RETRY_MS = 3000;
    private eventDispatcher: EventDispatcher;
    private effectsConfig: EffectsConfiguration | null = null;
    private readonly scheduler: EffectScheduler;
    private currentHealth: number = 100;
    private isBreathingActive: boolean = false;
    private isAlive: boolean = true;
    private isInGame: boolean = false;
    private readonly IDLE_COLOR: Color = { r: 0, g: 100, b: 200 };
    /** Wall-clock time at which the hero is expected back, while dead. */
    private respawnDeadline: number | null = null;
    private countdownStarted = false;
    private deathRippleTimer: ReturnType<typeof setTimeout> | null = null;
    private ambientInterval: ReturnType<typeof setInterval> | null = null;

    constructor(eventDispatcher: EventDispatcher, scheduler: EffectScheduler = new EffectScheduler()) {
        this.eventDispatcher = eventDispatcher;
        this.scheduler = scheduler;
        this.scheduler.onTrace = line => console.log(`[scheduler] ${line}`);
        this.hue = new Hue(APP_CONFIG);
    }

    public async initialize(): Promise<boolean> {
        // The bridge keeps a previous instance's stream registered for ~10 s after it dies,
        // and the EDK then reports "streaming failed". Retry instead of giving up.
        let initialized = false;
        for (let attempt = 1; attempt <= this.INIT_ATTEMPTS && !initialized; attempt++) {
            if (attempt > 1) {
                console.log(`Hue initialization attempt ${attempt}/${this.INIT_ATTEMPTS} in ${this.INIT_RETRY_MS / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, this.INIT_RETRY_MS));
                this.hue = new Hue(APP_CONFIG);
            }
            initialized = await this.hue.initialize();
        }
        if (!initialized) {
            return false;
        }

        this.effectsConfig = await EffectConfigLoader.load();

        this.registerStateHandlers();
        this.registerEffectHandlers();

        this.scheduler.setAmbient(() => this.paintAmbient());
        // percentageBar is a static frame; repaint it periodically so a dropped packet cannot stick.
        this.ambientInterval = setInterval(() => this.scheduler.refreshAmbient(), 1000);

        return true;
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
        this.eventDispatcher.on(GAME_EVENTS.PLAYER.COMBAT.RESPAWN, () => {
            this.onRespawn();
        });

        this.eventDispatcher.on(GAME_EVENTS.GAME.STARTED, (event: GameEvent) => {
            this.isInGame = true;
            this.currentHealth = getNumber(event.data.health_percent, 100);
            this.scheduler.refreshAmbient();
        });

        this.eventDispatcher.on(GAME_EVENTS.GAME.ENDED, () => {
            this.leaveGame('match ended');
        });

        this.eventDispatcher.on(GAME_EVENTS.GSI.CONNECTED, (event: GameEvent) => {
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
            // Dota stops posting during a pause; when frames resume the hero may still be dead.
            // Only start a death sequence if we did not already know about it.
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
        });

        // Dota stops posting on pause, on leaving the match, and often before POST_GAME.
        // The lights drop to idle until frames return.
        this.eventDispatcher.on(GAME_EVENTS.GSI.DISCONNECTED, () => {
            if (this.isInGame) {
                this.leaveGame('GSI disconnected');
            }
        });
    }

    private registerEffectHandlers(): void {
        if (!this.effectsConfig) {
            return;
        }
        for (const [eventKey, effectConfig] of Object.entries(this.effectsConfig.effects)) {
            if (!effectConfig.enabled) {
                continue;
            }
            const duration = this.getEffectDuration(effectConfig);
            const configured = effectConfig.priority ? PRIORITY_NAMES[effectConfig.priority] : undefined;
            const priority = configured ?? defaultPriority(eventKey);
            this.eventDispatcher.on(eventKey as GameEventType, () => {
                if (!this.isAlive && priority < Priority.CRITICAL) {
                    return;
                }
                this.scheduler.request({
                    name: eventKey,
                    priority,
                    duration,
                    run: () => {
                        this.isBreathingActive = false;
                        EffectRegistry.execute(this.hue, effectConfig.type, effectConfig.params);
                    }
                });
            });
        }
    }

    private getEffectDuration(effectConfig: EffectConfig): number {
        const params = effectConfig.params as Record<string, unknown>;
        if (typeof params.runTime === 'number' && params.runTime > 0) {
            return params.runTime;
        }
        if (typeof params.duration === 'number' && params.duration > 0) {
            return params.duration;
        }
        return 2000;
    }

    /** Background layer: what the strip shows when no effect is playing. */
    private paintAmbient(): void {
        if (!this.isInGame) {
            this.stopBreathing();
            this.hue.setSolidColor(this.IDLE_COLOR);
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
        this.isAlive = false;
        this.isBreathingActive = false;
        this.clearDeathTimers();
        this.respawnDeadline = Date.now() + respawnSeconds * 1000;
        this.countdownStarted = false;

        console.log(`[effect] death sequence (respawn in ${respawnSeconds}s)`);
        this.scheduler.request({
            name: 'death',
            priority: Priority.CRITICAL,
            preempt: 'all',
            duration: Math.max(DEATH_RIPPLE_MS, respawnSeconds * 1000),
            run: () => {
                this.hue.rippleGradient(COLORS.darkRed, 2000, 1000);
                this.deathRippleTimer = setTimeout(() => {
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
        const remainingSeconds = (this.respawnDeadline - Date.now()) / 1000;
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
        const deadline = Date.now() + respawnSeconds * 1000;
        if (Math.abs(deadline - this.respawnDeadline) <= COUNTDOWN_DRIFT_MS) {
            return;
        }
        console.log(`[effect] countdown resynced: ${Math.round((this.respawnDeadline - Date.now()) / 1000)}s -> ${respawnSeconds}s`);
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
            preempt: 'all',
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
        if (this.deathRippleTimer) {
            clearTimeout(this.deathRippleTimer);
            this.deathRippleTimer = null;
        }
        this.countdownStarted = false;
    }

    public async shutdown(): Promise<void> {
        if (this.ambientInterval) {
            clearInterval(this.ambientInterval);
            this.ambientInterval = null;
        }
        this.clearDeathTimers();
        this.scheduler.setAmbient(null);
        this.scheduler.clear('shutdown');
        this.hue.shutdown();
    }
}
