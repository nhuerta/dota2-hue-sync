import { Hue, COLORS } from '@nhuerta/node-hue-edk';

export interface EffectDefinition {
    name: string;
    description: string;
    run: (hue: Hue, duration: number) => void;
}

export const EFFECT_REGISTRY: readonly EffectDefinition[] = [
    {
        name: 'Explosion Flash (RGBA Blending)',
        description: 'Bright gold explosion with alpha layering',
        run: (hue: Hue, duration: number) => hue.explosionFlash(COLORS.gold, COLORS.white, duration)
    },
    {
        name: 'Sunrise (Color Temperature)',
        description: 'Warm candlelight to daylight transition',
        run: (hue: Hue, duration: number) => hue.sunriseEffect(duration)
    },
    {
        name: 'Candlelight Flicker (CT + Brightness)',
        description: 'Flickering candle flame effect',
        run: (hue: Hue, duration: number) => hue.candlelightFlicker(duration)
    },
    {
        name: 'XY Precision Rainbow (CIE Color Space)',
        description: 'Smooth rainbow using CIE color space',
        run: (hue: Hue, duration: number) => hue.xyPrecisionRainbow(duration)
    },
    {
        name: 'Multi-Layer Alpha Blend',
        description: 'Multiple color layers with transparency',
        run: (hue: Hue, duration: number) => hue.multiLayerAlphaBlend(duration)
    },
    {
        name: 'Brightness Wave',
        description: 'Purple wave pulsing brightness',
        run: (hue: Hue, duration: number) => hue.brightnessWave(COLORS.purple, duration)
    },
    {
        name: 'Day-Night Cycle (Color Temperature)',
        description: 'Full day cycle using color temperature',
        run: (hue: Hue, duration: number) => hue.dayNightCycle(duration)
    },
    {
        name: 'Explosion Ripple (RGBA)',
        description: 'Emerald explosion with white shockwave',
        run: (hue: Hue, duration: number) => hue.explosionFlashRipple(COLORS.emerald, COLORS.white, duration)
    },
    {
        name: 'Meteor Shower',
        description: 'Cascading lights like shooting stars',
        run: (hue: Hue, duration: number) => hue.meteorShower(COLORS.white, COLORS.skyBlue, duration)
    },
    {
        name: 'Double Strike',
        description: 'Two quick impact flashes',
        run: (hue: Hue, duration: number) => hue.doubleStrike(COLORS.orange, duration)
    },
    {
        name: 'Time Rewind',
        description: 'Reverse color progression with distortion',
        run: (hue: Hue, duration: number) => hue.timeRewind(COLORS.violet, COLORS.indigo, duration)
    },
    {
        name: 'Shockwave',
        description: 'Expanding ring radiating outward',
        run: (hue: Hue, duration: number) => hue.shockwave(COLORS.cyan, duration)
    },
    {
        name: 'Energy Burst',
        description: 'Instant bright flash with rapid fade',
        run: (hue: Hue, duration: number) => hue.energyBurst(COLORS.gold, duration)
    },
    {
        name: 'Spiral Vortex',
        description: 'Rotating spiral creating swirl effect',
        run: (hue: Hue, duration: number) => hue.spiralVortex(COLORS.purple, COLORS.violet, duration)
    },
    {
        name: 'Lightning Strike',
        description: 'White flash with electric blue afterglow',
        run: (hue: Hue, duration: number) => hue.lightningStrike(duration)
    },
    {
        name: 'Poison Drip',
        description: 'Toxic green slowly fading to black',
        run: (hue: Hue, duration: number) => hue.poisonDrip(duration)
    },
    {
        name: 'Ice Shatter',
        description: 'Ice blue freezes then shatters',
        run: (hue: Hue, duration: number) => hue.iceShatter(duration)
    },
    {
        name: 'Police Flash',
        description: 'Emergency lights - red, white, blue',
        run: (hue: Hue, duration: number) => {
            const flashSpeed = 150;
            const flashCount = Math.floor(duration / (4 * flashSpeed));
            hue.policeFlash(flashCount, flashSpeed);
        }
    },
    {
        name: 'Police Flash Pro (HSB+CT)',
        description: 'Pro emergency lights with color temperature',
        run: (hue: Hue, duration: number) => hue.policeFlashPro(duration)
    },
    {
        name: 'Mexican Flag',
        description: 'Mexican flag colors - red, white, green',
        run: (hue: Hue, duration: number) => {
            const flashSpeed = 150;
            const flashCount = Math.floor(duration / (4 * flashSpeed));
            hue.mexicanFlag(flashCount, flashSpeed);
        }
    },
    {
        name: 'Countdown Pulse (Custom Colors)',
        description: 'Countdown timer with custom start and end colors',
        run: (hue: Hue, duration: number) => {
            // Use purple to cyan for a cool effect
            hue.countdownPulseWithColors(duration / 1000, COLORS.purple, COLORS.cyan);
        }
    },
    {
        name: 'Accelerating Pulse',
        description: 'Pulses on/off starting slow then speeding up',
        run: (hue: Hue, _duration: number) => {
            // 6 pulses: from 800ms to 100ms speed, using electric blue
            hue.acceleratingPulse(COLORS.electricBlue, 6, 800, 100);
        }
    },
    {
        name: 'Strobe Light',
        description: 'Fast N-seconds strobe at 20Hz',
        run: (hue: Hue, duration: number) => {
            hue.strobeLight(COLORS.white, duration, 50);
        }
    },
    {
        name: 'Random Color Sequence',
        description: 'Randomly picks 4-6 colors and flashes through them',
        run: (hue: Hue, duration: number) => {
            hue.randomColorSequence(duration);
        }
    },
    {
        name: 'Segmented Countdown Pulse',
        description: 'Individual countdown timers per segment with custom colors',
        run: (hue: Hue, duration: number) => {
            hue.segmentedCountdownPulse(duration / 1000);
        }
    }
] as const;