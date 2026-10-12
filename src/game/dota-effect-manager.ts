import {EventDispatcher, GAME_EVENTS, type GameEvent, type GameEventType} from './events';
import {type Color, COLORS, Hue} from '@nhuerta/node-hue-edk';
import {getNumber} from '../server/utils';
import {type EffectConfig, EffectConfigLoader, type EffectsConfiguration} from './effect-config-loader';
import {EffectRegistry} from './effect-registry';
import {APP_CONFIG} from '../config/app-config';
import {GAME_STATES} from './constants';

export class DotaEffectManager {
    private hue: Hue;
    private readonly INIT_ATTEMPTS = 6;
    private readonly INIT_RETRY_MS = 3000;
    private eventDispatcher: EventDispatcher;
    private effectsConfig: EffectsConfiguration | null = null;
    private currentHealth: number = 100;
    private isBreathingActive: boolean = false;
    private isAlive: boolean = true;
    private isInGame: boolean = false;
    private readonly IDLE_COLOR: Color = { r: 0, g: 100, b: 200 };
    private currentEffectTimer: ReturnType<typeof setTimeout> | null = null;
    private deathCountdownTimer: ReturnType<typeof setTimeout> | null = null;
    private deathEffectTimer: ReturnType<typeof setTimeout> | null = null;
    private healthDisplayInterval: ReturnType<typeof setInterval> | null = null;

    constructor(eventDispatcher: EventDispatcher) {
        this.eventDispatcher = eventDispatcher;
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

        this.healthDisplayInterval = setInterval(() => {
            if (!this.currentEffectTimer && this.isAlive) {
                this.updateHealthDisplay();
            }
        }, 1000);

        this.updateHealthDisplay();

        return true;
    }

    private registerStateHandlers(): void {
        this.eventDispatcher.on(
            GAME_EVENTS.PLAYER.RESOURCES.HEALTH_CHANGED,
            (_event: GameEvent) => {
                this.currentHealth = getNumber(_event.data.health_percent);
                if (this.isAlive && !this.currentEffectTimer) {
                    this.updateHealthDisplay();
                }
            }
        );

        this.eventDispatcher.on(
            GAME_EVENTS.PLAYER.COMBAT.DEATH,
            (_event: GameEvent) => {
                const respawnSeconds = getNumber(_event.data.respawn_seconds, 30);
                this.onDeath(respawnSeconds);
            }
        );

        this.eventDispatcher.on(
            GAME_EVENTS.PLAYER.COMBAT.RESPAWN,
            (_event: GameEvent) => {
                this.onRespawn();
            }
        );


        this.eventDispatcher.on(
            GAME_EVENTS.GAME.STARTED,
            (_event: GameEvent) => {
                this.isInGame = true;

                const healthPercent = _event.data.health_percent;
                if (typeof healthPercent === 'number') {
                    this.currentHealth = healthPercent;
                } else {
                    this.currentHealth = 100;
                }
            }
        );

        this.eventDispatcher.on(
            GAME_EVENTS.GAME.ENDED,
            (_event: GameEvent) => {
                this.leaveGame();
            }
        );

        this.eventDispatcher.on(
            GAME_EVENTS.GSI.CONNECTED,
            (_event: GameEvent) => {
                const state = _event.data.current_state as Record<string, unknown>;
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
                    return;
                }
                // Dota stops posting during a pause; when frames resume the hero may still be
                // dead. Only start a death sequence if we did not already know about it.
                if (heroState?.alive === false && heroState?.respawn_seconds && heroState.respawn_seconds > 0) {
                    if (this.isAlive) {
                        this.onDeath(heroState.respawn_seconds);
                    }
                } else if (!this.isAlive) {
                    this.onRespawn();
                }
            }
        );

        // Dota stops posting on pause, on leaving the match, and often before POST_GAME.
        // The lights drop to idle until frames return.
        this.eventDispatcher.on(
            GAME_EVENTS.GSI.DISCONNECTED,
            (_event: GameEvent) => {
                if (!this.isInGame) {
                    return;
                }
                console.log('[effect] GSI disconnected, going idle');
                this.leaveGame();
            }
        );
    }

    private leaveGame(): void {
        this.isInGame = false;
        this.isAlive = true;
        this.clearDeathTimers();
        if (this.currentEffectTimer) {
            clearTimeout(this.currentEffectTimer);
            this.currentEffectTimer = null;
        }
        this.updateHealthDisplay();
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

            this.eventDispatcher.on(eventKey as GameEventType, () => {
                this.playEffect(() => {
                    EffectRegistry.execute(this.hue, effectConfig.type, effectConfig.params);
                }, duration);
            });
        }
    }

    private getEffectDuration(effectConfig: EffectConfig): number {
        const params = effectConfig.params as Record<string, unknown>;
        if (typeof params.runTime === 'number') {
            return params.runTime;
        }
        if (typeof params.duration === 'number') {
            return params.duration;
        }
        return 2000;
    }

    private playEffect(execute: () => void, duration: number): void {
        if (!this.isAlive) {
            return;
        }

        if (this.currentEffectTimer) {
            clearTimeout(this.currentEffectTimer);
            this.currentEffectTimer = null;
        }

        execute();

        this.currentEffectTimer = setTimeout(() => {
            this.currentEffectTimer = null;
            if (this.isAlive) {
                this.updateHealthDisplay();
                setTimeout(() => {
                    if (this.isAlive && !this.currentEffectTimer) {
                        this.updateHealthDisplay();
                    }
                }, 10);
            }
        }, duration);
    }

    private updateHealthDisplay(): void {
        if (!this.isAlive || this.currentEffectTimer) {
            return;
        }

        if (!this.isInGame) {
            if (this.isBreathingActive) {
                this.hue.stopCurrentEffect();
                this.isBreathingActive = false;
            }
            this.hue.setSolidColor(this.IDLE_COLOR);
            return;
        }

        const isCritical = this.currentHealth > 0 && this.currentHealth <= 20;

        if (isCritical) {
            if (!this.isBreathingActive) {
                console.log(`[effect] breathingGradient (critical health ${this.currentHealth}%)`);
                this.hue.breathingGradient(COLORS.red, COLORS.black, 1500);
                this.isBreathingActive = true;
            }
        } else {
            if (this.isBreathingActive) {
                this.isBreathingActive = false;
                this.hue.stopCurrentEffect();
                console.log(`[effect] percentageBar (recovered to ${this.currentHealth}%)`);
                this.hue.percentageBar(this.currentHealth);
            } else {
                this.hue.percentageBar(this.currentHealth);
            }
        }
    }

    private onDeath(respawnSeconds: number): void {
        this.isAlive = false;
        this.isBreathingActive = false;

        if (this.currentEffectTimer) {
            clearTimeout(this.currentEffectTimer);
            this.currentEffectTimer = null;
        }

        this.clearDeathTimers();


        console.log(`[effect] death sequence (respawn in ${respawnSeconds}s)`);
        this.hue.rippleGradient(COLORS.darkRed, 2000, 1000);

        this.deathEffectTimer = setTimeout(() => {
            this.deathEffectTimer = null;

            if (respawnSeconds > 3) {
                const remainingSeconds = respawnSeconds - 3;
                console.log(`[effect] countdownPulse ${remainingSeconds}s`);
                this.hue.countdownPulse(remainingSeconds);

                this.deathCountdownTimer = setTimeout(() => {
                    this.deathCountdownTimer = null;
                }, remainingSeconds * 1000);
            }
        }, 3000);
    }

    private onRespawn(): void {
        this.clearDeathTimers();

        console.log('[effect] respawn gradientWave');
        this.hue.gradientWave(COLORS.brightGreen, COLORS.white, 1000, 1500);

        this.isAlive = true;
        this.currentHealth = 100;
        this.isBreathingActive = false;
        this.updateHealthDisplay();
    }

    private clearDeathTimers(): void {
        if (this.deathEffectTimer) {
            clearTimeout(this.deathEffectTimer);
            this.deathEffectTimer = null;
        }

        if (this.deathCountdownTimer) {
            clearTimeout(this.deathCountdownTimer);
            this.deathCountdownTimer = null;
        }
    }

    public async shutdown(): Promise<void> {
        if (this.currentEffectTimer) {
            clearTimeout(this.currentEffectTimer);
            this.currentEffectTimer = null;
        }

        if (this.healthDisplayInterval) {
            clearInterval(this.healthDisplayInterval);
            this.healthDisplayInterval = null;
        }

        this.clearDeathTimers();
        this.hue.shutdown();
    }
}