#!/usr/bin/env bun

import * as dotenv from 'dotenv';
import { Hue, COLORS, type Color } from '@nhuerta/node-hue-edk';
import { EFFECT_REGISTRY } from './effect-registry.ts';
import { APP_CONFIG } from '../src/config/app-config';
import * as readline from 'readline';

dotenv.config();

type ParamType = 'color' | 'number' | 'boolean';

interface EffectParam {
    name: string;
    type: ParamType;
    default: string | number | boolean;
}

interface CustomEffect {
    method: string;
    params: EffectParam[];
}

class EffectShowcase {
    private hue: Hue;
    private rl: readline.Interface;
    private isConnected: boolean = false;
    private readonly IDLE_COLOR: Color = { r: 0, g: 100, b: 200 }; // Soft blue

    private readonly CUSTOM_EFFECTS: Record<string, CustomEffect> = {
        // Basic Effects
        'setSolidColor': {
            method: 'setSolidColor',
            params: [
                { name: 'color', type: 'color', default: 'white' }
            ]
        },
        'percentageBar': {
            method: 'percentageBar',
            params: [
                { name: 'percentage', type: 'number', default: 50 }
            ]
        },
        'flashColor': {
            method: 'flashColor',
            params: [
                { name: 'color', type: 'color', default: 'white' },
                { name: 'duration', type: 'number', default: 500 }
            ]
        },
        'fadeToBlack': {
            method: 'fadeToBlack',
            params: []
        },
        'acceleratingPulse': {
            method: 'acceleratingPulse',
            params: [
                { name: 'color', type: 'color', default: 'electricBlue' },
                { name: 'pulseCount', type: 'number', default: 5 },
                { name: 'startSpeed', type: 'number', default: 800 },
                { name: 'endSpeed', type: 'number', default: 100 }
            ]
        },
        'strobeLight': {
            method: 'strobeLight',
            params: [
                { name: 'color', type: 'color', default: 'white' },
                { name: 'duration', type: 'number', default: 1000 },
                { name: 'strobeSpeed', type: 'number', default: 50 }
            ]
        },
        'randomColorSequence': {
            method: 'randomColorSequence',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },

        // Gradient Effects
        'gradientWave': {
            method: 'gradientWave',
            params: [
                { name: 'color1', type: 'color', default: 'blue' },
                { name: 'color2', type: 'color', default: 'green' },
                { name: 'duration', type: 'number', default: 2000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'rippleGradient': {
            method: 'rippleGradient',
            params: [
                { name: 'color', type: 'color', default: 'cyan' },
                { name: 'duration', type: 'number', default: 1000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'breathingGradient': {
            method: 'breathingGradient',
            params: [
                { name: 'color1', type: 'color', default: 'red' },
                { name: 'color2', type: 'color', default: 'orange' },
                { name: 'period', type: 'number', default: 3000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'chaseGradient': {
            method: 'chaseGradient',
            params: [
                { name: 'color', type: 'color', default: 'purple' },
                { name: 'speed', type: 'number', default: 500 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },

        // Wave Effects
        'rainbowWave': {
            method: 'rainbowWave',
            params: [
                { name: 'speed', type: 'number', default: 2000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'pulseWave': {
            method: 'pulseWave',
            params: [
                { name: 'color1', type: 'color', default: 'magenta' },
                { name: 'color2', type: 'color', default: 'violet' },
                { name: 'speed', type: 'number', default: 1000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },

        // Bouncing Effects
        'bouncingWave': {
            method: 'bouncingWave',
            params: [
                { name: 'color1', type: 'color', default: 'yellow' },
                { name: 'color2', type: 'color', default: 'orange' },
                { name: 'speed', type: 'number', default: 2000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'pulsingBounce': {
            method: 'pulsingBounce',
            params: [
                { name: 'color1', type: 'color', default: 'orange' },
                { name: 'color2', type: 'color', default: 'blue' },
                { name: 'bounceSpeed', type: 'number', default: 2000 },
                { name: 'pulseSpeed', type: 'number', default: 500 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'fadeBounce': {
            method: 'fadeBounce',
            params: [
                { name: 'color1', type: 'color', default: 'sapphire' },
                { name: 'color2', type: 'color', default: 'crimson' },
                { name: 'speed', type: 'number', default: 2000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },
        'doubleBounce': {
            method: 'doubleBounce',
            params: [
                { name: 'color1', type: 'color', default: 'amber' },
                { name: 'color2', type: 'color', default: 'darkOrange' },
                { name: 'speed', type: 'number', default: 2000 },
                { name: 'runTime', type: 'number', default: 0 }
            ]
        },

        // Flash Effects
        'flashingColorSequence': {
            method: 'flashingColorSequence',
            params: [
                { name: 'colorSequence', type: 'color', default: 'red,white,blue,white' },
                { name: 'flashCount', type: 'number', default: 6 },
                { name: 'flashSpeed', type: 'number', default: 150 }
            ]
        },
        'policeFlash': {
            method: 'policeFlash',
            params: [
                { name: 'flashCount', type: 'number', default: 6 },
                { name: 'flashSpeed', type: 'number', default: 150 }
            ]
        },
        'mexicanFlag': {
            method: 'mexicanFlag',
            params: [
                { name: 'flashCount', type: 'number', default: 6 },
                { name: 'flashSpeed', type: 'number', default: 150 }
            ]
        },
        'policeFlashPro': {
            method: 'policeFlashPro',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },

        // Explosion Effects
        'explosionFlash': {
            method: 'explosionFlash',
            params: [
                { name: 'baseColor', type: 'color', default: 'orange' },
                { name: 'flashColor', type: 'color', default: 'white' },
                { name: 'duration', type: 'number', default: 1500 }
            ]
        },
        'explosionFlashRipple': {
            method: 'explosionFlashRipple',
            params: [
                { name: 'baseColor', type: 'color', default: 'orange' },
                { name: 'flashColor', type: 'color', default: 'white' },
                { name: 'duration', type: 'number', default: 2000 }
            ]
        },

        // Advanced Effects
        'meteorShower': {
            method: 'meteorShower',
            params: [
                { name: 'color1', type: 'color', default: 'white' },
                { name: 'color2', type: 'color', default: 'skyBlue' },
                { name: 'duration', type: 'number', default: 2500 }
            ]
        },
        'doubleStrike': {
            method: 'doubleStrike',
            params: [
                { name: 'color', type: 'color', default: 'orange' },
                { name: 'duration', type: 'number', default: 500 }
            ]
        },
        'timeRewind': {
            method: 'timeRewind',
            params: [
                { name: 'color1', type: 'color', default: 'violet' },
                { name: 'color2', type: 'color', default: 'indigo' },
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },
        'shockwave': {
            method: 'shockwave',
            params: [
                { name: 'color', type: 'color', default: 'cyan' },
                { name: 'duration', type: 'number', default: 1500 }
            ]
        },
        'energyBurst': {
            method: 'energyBurst',
            params: [
                { name: 'color', type: 'color', default: 'gold' },
                { name: 'duration', type: 'number', default: 800 }
            ]
        },
        'spiralVortex': {
            method: 'spiralVortex',
            params: [
                { name: 'color1', type: 'color', default: 'purple' },
                { name: 'color2', type: 'color', default: 'violet' },
                { name: 'duration', type: 'number', default: 2000 }
            ]
        },
        'lightningStrike': {
            method: 'lightningStrike',
            params: [
                { name: 'duration', type: 'number', default: 1000 }
            ]
        },
        'poisonDrip': {
            method: 'poisonDrip',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },
        'iceShatter': {
            method: 'iceShatter',
            params: [
                { name: 'duration', type: 'number', default: 1500 }
            ]
        },

        // Temperature Effects
        'sunriseEffect': {
            method: 'sunriseEffect',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },
        'candlelightFlicker': {
            method: 'candlelightFlicker',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },
        'dayNightCycle': {
            method: 'dayNightCycle',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },

        // Color Space Effects
        'xyPrecisionRainbow': {
            method: 'xyPrecisionRainbow',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },
        'multiLayerAlphaBlend': {
            method: 'multiLayerAlphaBlend',
            params: [
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },
        'brightnessWave': {
            method: 'brightnessWave',
            params: [
                { name: 'baseColor', type: 'color', default: 'purple' },
                { name: 'duration', type: 'number', default: 3000 }
            ]
        },

        // Utility Effects
        'countdownPulse': {
            method: 'countdownPulse',
            params: [
                { name: 'totalSeconds', type: 'number', default: 10 }
            ]
        },
        'countdownPulseWithColors': {
            method: 'countdownPulseWithColors',
            params: [
                { name: 'totalSeconds', type: 'number', default: 10 },
                { name: 'startColor', type: 'color', default: 'darkRed' },
                { name: 'endColor', type: 'color', default: 'brightGreen' }
            ]
        },
        'segmentedCountdownPulse': {
            method: 'segmentedCountdownPulse',
            params: [
                { name: 'totalSeconds', type: 'number', default: 10 }
            ]
        },
        'segmentedCountdownPulseWithColors': {
            method: 'segmentedCountdownPulseWithColors',
            params: [
                { name: 'totalSeconds', type: 'number', default: 10 },
                { name: 'seg0StartColor', type: 'color', default: 'red' },
                { name: 'seg0EndColor', type: 'color', default: 'green' },
                { name: 'seg1StartColor', type: 'color', default: 'purple' },
                { name: 'seg1EndColor', type: 'color', default: 'cyan' },
                { name: 'seg2StartColor', type: 'color', default: 'blue' },
                { name: 'seg2EndColor', type: 'color', default: 'yellow' }
            ]
        },
        'clearAllLights': {
            method: 'clearAllLights',
            params: []
        }
    };

    constructor() {
        this.hue = new Hue(APP_CONFIG);
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async initialize(): Promise<boolean> {
        console.log('\n🎨 Hue Effects Showcase');
        console.log('======================\n');
        console.log('Connecting to Hue bridge...');

        this.isConnected = await this.hue.initialize();

        if (!this.isConnected) {
            console.log('Failed to connect to Hue bridge');
            return false;
        }

        console.log('Connected to Hue bridge\n');

        // Set idle color
        this.setIdleColor();

        return true;
    }

    private displayEffects(): void {
        console.log('\n📋 Available Effects:\n');
        EFFECT_REGISTRY.forEach((effect, index) => {
            console.log(`  ${(index + 1).toString().padStart(2)}. ${effect.name.padEnd(30)} - ${effect.description}`);
        });
        console.log('\n 26. 🎛️  Custom Parameters Mode     - Test any effect with custom parameters');
        console.log('\n  0. Exit');
    }

    private async getUserInput(prompt: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(prompt, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    private setIdleColor(): void {
        // Set all segments to idle color
        this.hue.setSolidColor(this.IDLE_COLOR);
    }

    private async selectEffect(): Promise<number> {
        // Set idle color while waiting for input
        this.setIdleColor();
        this.displayEffects();

        while (true) {
            const input = await this.getUserInput('\n🎯 Select effect (0-26): ');
            const selection = parseInt(input);

            if (!isNaN(selection) && selection >= 0 && selection <= 26) {
                return selection;
            }

            console.log('Invalid selection. Please enter a number between 0 and 26');
        }
    }

    private async getDuration(): Promise<number> {
        const input = await this.getUserInput('⏱️  Duration in milliseconds (press Enter for 3000ms): ');

        if (input === '') {
            return 3000;
        }

        const duration = parseInt(input);

        if (isNaN(duration) || duration <= 0) {
            console.log('Invalid duration, using default 3000ms');
            return 3000;
        }

        return duration;
    }

    private logEffectDetails(effectName: string, duration: number): void {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        switch(effectName) {
            case 'Explosion Flash (RGBA Blending)':
                console.log('DESCRIPTION: Bright gold explosion that transitions to white with alpha layering for depth');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorRGBA(r, g, b, alpha)');
                console.log('Colors: gold (255, 215, 0) → white (255, 255, 255)');
                console.log('Alpha: Used for blending layers (0.0-1.0 range)');
                console.log('Brightness: Via RGB values');
                console.log('Pattern: Instant bright flash followed by gradual fade');
                break;

            case 'Sunrise (Color Temperature)':
                console.log('DESCRIPTION: Warm candlelight gradually brightening to daylight, simulating dawn');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorCT(ct, brightness)');
                console.log('Color Temperature: 500 mireds (2000K warm) → 153 mireds (6500K daylight)');
                console.log('Brightness: 0.1 → 1.0 (controlled via CT parameter)');
                console.log('Pattern: Smooth transition from dim warm to bright cool white');
                break;

            case 'Candlelight Flicker (CT + Brightness)':
                console.log('DESCRIPTION: Flickering candle flame effect using color temperature variations');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorCT(ct, brightness)');
                console.log('Color Temperature: 450-500 mireds (2000-2200K very warm)');
                console.log('Brightness: 0.4-0.8 with random flickering');
                console.log('Pattern: Random flicker simulating candle flame');
                break;

            case 'XY Precision Rainbow (CIE Color Space)':
                console.log('DESCRIPTION: Smooth rainbow using CIE XY color space for accurate color reproduction');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorXY(x, y, brightness)');
                console.log('XY Values: Rotating through color wheel (0.0-0.8 range)');
                console.log('Brightness: Fixed at 1.0');
                console.log('Pattern: Smooth color wheel rotation using precise XY coordinates');
                break;

            case 'Multi-Layer Alpha Blend':
                console.log('DESCRIPTION: Multiple color layers blending with different alpha transparencies');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorRGBA(r, g, b, alpha)');
                console.log('Layers: 3 colors with different alpha values');
                console.log('Alpha: 0.3-0.7 for layer blending effects');
                console.log('Brightness: Via RGB values');
                console.log('Pattern: Overlapping waves with transparency');
                break;

            case 'Brightness Wave':
                console.log('DESCRIPTION: Purple wave that pulses brightness from dim to bright');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setBrightness(brightness) OR RGB scaling');
                console.log('Color: purple (128, 0, 128)');
                console.log('Brightness: 0.2 → 1.0 in wave pattern');
                console.log('Pattern: Sinusoidal brightness modulation');
                break;

            case 'Day-Night Cycle (Color Temperature)':
                console.log('DESCRIPTION: Full day cycle from morning through noon to evening and night');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorCT(ct, brightness)');
                console.log('Morning: 400→250 mireds, brightness 0.3→1.0');
                console.log('Noon: 250→153 mireds, brightness 1.0');
                console.log('Evening: 153→370 mireds, brightness 1.0→0.5');
                console.log('Night: 370→450 mireds, brightness 0.5→0.2');
                console.log('Pattern: 4-phase cycle simulating natural daylight');
                break;

            case 'Explosion Ripple (RGBA)':
                console.log('DESCRIPTION: Emerald explosion with rippling white shockwave using alpha blending');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setColorRGBA(r, g, b, alpha) + setLightColor(id, r, g, b)');
                console.log('Colors: emerald (80, 200, 120) core, white (255, 255, 255) ripple');
                console.log('Alpha: Used for explosion blending');
                console.log('Pattern: Central explosion with outward ripple across segments');
                break;

            case 'Meteor Shower':
                console.log('DESCRIPTION: Cascading lights falling like shooting stars, alternating colors');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setLightColor(segmentId, r, g, b)');
                console.log('Colors: white (255, 255, 255), skyBlue (137, 207, 240)');
                console.log('Cycle time: 500ms per meteor');
                console.log('Segments: Cascading with 0.3 phase offset');
                console.log('Pattern: Downward motion across segments, alternating colors');
                break;

            case 'Double Strike':
                console.log('DESCRIPTION: Two quick impact flashes with slight color variation');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setAllLights(r, g, b)');
                console.log('Color: orange (255, 165, 0)');
                console.log(`Strike timing: Two strikes at 0ms and ${duration/2}ms`);
                console.log('Second strike: 20% redder, 10% dimmer green/blue');
                console.log('Pattern: Flash-fade, Flash-fade');
                break;

            case 'Time Rewind':
                console.log('DESCRIPTION: Reverse color progression with temporal distortion flickering');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setLightColor(segmentId, r, g, b)');
                console.log('Colors: violet (238, 130, 238) ← indigo (75, 0, 130) (reversed)');
                console.log('Distortion: Sine wave time warping with 20% flicker');
                console.log('Segments: Individual control with phase offsets');
                console.log('Pattern: Colors flow backwards with glitchy flickers');
                break;

            case 'Shockwave':
                console.log('DESCRIPTION: Expanding ring that radiates outward from center');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setLightColor(segmentId, r, g, b)');
                console.log('Color: cyan (0, 255, 255)');
                console.log(`Wave speed: Crosses all segments in ${duration}ms`);
                console.log('Intensity: Fades as wave expands');
                console.log('Pattern: Bright ring moving outward, diminishing intensity');
                break;

            case 'Energy Burst':
                console.log('DESCRIPTION: Instant bright flash that rapidly fades to black');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setAllLights(r, g, b)');
                console.log('Color: gold (255, 215, 0)');
                console.log(`Burst phase: 0-${Math.round(duration * 0.1)}ms instant flash at 130% brightness`);
                console.log(`Hold phase: ${Math.round(duration * 0.1)}-${Math.round(duration * 0.3)}ms at 90% brightness`);
                console.log(`Fade phase: ${Math.round(duration * 0.3)}-${duration}ms rapid decay to black`);
                console.log('Pattern: BANG-hold-fadeout');
                break;

            case 'Spiral Vortex':
                console.log('DESCRIPTION: Rotating spiral creating a swirling vortex effect');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setLightColor(segmentId, r, g, b)');
                console.log('Colors: purple (128, 0, 128) → violet (238, 130, 238)');
                console.log(`Rotation speed: 3 full rotations over ${duration}ms`);
                console.log('Depth effect: 30% brightness variation');
                console.log('Pattern: Spinning color gradient with depth pulsing');
                break;

            case 'Lightning Strike':
                console.log('DESCRIPTION: Sharp white flash followed by electric blue afterglow');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setAllLights(r, g, b)');
                console.log(`Flash: white (255, 255, 255) at 0-${Math.round(duration * 0.05)}ms`);
                console.log(`Secondary: 70% white at ${Math.round(duration * 0.05)}-${Math.round(duration * 0.15)}ms`);
                console.log('Afterglow: electricBlue (125, 249, 255) with decay');
                console.log('Flicker: Random 20% brightness spikes');
                console.log('Pattern: FLASH-flash-electricGlow with flickers');
                break;

            case 'Poison Drip':
                console.log('DESCRIPTION: Toxic green slowly dripping/fading to black');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setLightColor(segmentId, r, g, b)');
                console.log('Color: emerald/toxic green (80, 200, 120) → black');
                console.log('Red channel: 30% intensity for toxic look');
                console.log('Blue channel: 10% intensity');
                console.log('Segments: Staggered fade with 15% delay between');
                console.log('Pattern: Dripping fade with bubbling effect');
                break;

            case 'Ice Shatter':
                console.log('DESCRIPTION: Bright ice blue freezes then shatters into darker fragments');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setLightColor(segmentId, r, g, b) + setAllLights');
                console.log(`Freeze phase (0-${Math.round(duration * 0.3)}ms): iceBlue (176, 224, 230) brightening`);
                console.log(`Shatter phase (${Math.round(duration * 0.3)}-${duration}ms): Fragments to deepBlue (0, 100, 139)`);
                console.log('Segments: Random shatter timing per segment');
                console.log('Pattern: Freeze solid → crack → shatter to pieces');
                break;

            case 'Police Flash':
                console.log('DESCRIPTION: Emergency vehicle lights - red, white, blue flashing sequence');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: Calls flashingColorSequence → hueWrapper.setAllLights(r, g, b)');
                console.log('Colors: red (255, 0, 0) → white → blue (0, 0, 255) → white');
                console.log('Flash speed: 150ms per color');
                console.log(`Flash count: ${Math.floor(duration / (4 * 150))} complete cycles`);
                console.log('Pattern: Rapid alternating emergency light sequence');
                console.log('Note: Uses existing policeFlash() implementation');
                break;

            case 'Police Flash Pro (HSB+CT)':
                console.log('DESCRIPTION: Pro emergency lights using native Hue HSB and CT parameters');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: Mixed - hueWrapper.setColorCT() for whites, setColorRGB() for colors');
                console.log('Sequence:');
                console.log('  1. Red: HSB(0°, 100%, 100%) → RGB via hsvToRgb');
                console.log('  2. White: CT 366 mireds (~2732K warm white) at 100% brightness');
                console.log('  3. Blue: HSB(257°, 100%, 100%) [Hue value: 46920/65535]');
                console.log('  4. White: CT 366 mireds (~2732K warm white) at 100% brightness');
                console.log('Flash speed: 150ms per color');
                console.log('Pattern: Uses exact parameters from external project');
                console.log('Note: Mixes color temperature (CT) for whites with HSB for colors');
                break;

            case 'Mexican Flag':
                console.log('DESCRIPTION: Mexican flag colors - red, white, green flashing sequence');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: Calls flashingColorSequence → hueWrapper.setAllLights(r, g, b)');
                console.log('Colors: red (255, 0, 0) → white → emerald green (80, 200, 120) → white');
                console.log('Flash speed: 150ms per color');
                console.log(`Flash count: ${Math.floor(duration / (4 * 150))} complete cycles`);
                console.log('Pattern: Alternating Mexican flag colors');
                console.log('Note: Identical to policeFlash but with green instead of blue');
                break;

            case 'Countdown Pulse (Custom Colors)':
                console.log('DESCRIPTION: Countdown timer that transitions between custom colors with accelerating pulse');
                console.log(`Duration: ${duration}ms`);
                console.log('PRIMITIVES: hueWrapper.setAllSegments(r, g, b) with sendToDevice()');
                console.log('Default colors: purple (128, 0, 255) → yellow (255, 200, 0) → cyan (0, 255, 255)');
                console.log(`Timer: ${duration / 1000} seconds countdown`);
                console.log('Pulse speed: Starts at 2000ms, accelerates to 200ms as time runs out');
                console.log('Brightness: 20-100% using sine wave pulsing');
                console.log('Phases:');
                console.log(`  1. 100-66% time: Purple (steady color)`);
                console.log(`  2. 66-33% time: Purple → Yellow transition`);
                console.log(`  3. 33-0% time: Yellow → Cyan transition`);
                console.log('End sequence: White flash → Cyan (success indicator)');
                console.log('Pattern: Accelerating pulse with color transitions');
                break;

            case 'Accelerating Pulse':
                console.log('DESCRIPTION: Pulses between color and black (off) with exponentially accelerating speed');
                console.log(`Duration: Effect runs for its natural duration (not ${duration}ms)`);
                console.log('PRIMITIVES: hueWrapper.setAllSegments(r, g, b) and clearAllSegments()');
                console.log('Default color: electricBlue (125, 249, 255)');
                console.log('Pulse count: 6 pulses');
                console.log('Speed progression: 800ms → 100ms (exponential)');
                console.log('Each pulse timing:');
                console.log('  Pulse 1: 800ms on, 800ms off');
                console.log('  Pulse 2: ~550ms on, 550ms off');
                console.log('  Pulse 3: ~380ms on, 380ms off');
                console.log('  Pulse 4: ~260ms on, 260ms off');
                console.log('  Pulse 5: ~180ms on, 180ms off');
                console.log('  Pulse 6: 100ms on, 100ms off');
                console.log('Pattern: On/off toggling with exponential speed increase');
                console.log('Total duration: ~4.5 seconds for 6 pulses');
                break;

            case 'Strobe Light':
                console.log('DESCRIPTION: Fast strobe light effect with configurable speed and duration');
                console.log('Duration: Default 1000ms (configurable)');
                console.log('PRIMITIVES: hueWrapper.setAllSegments(r, g, b) and clearAllSegments()');
                console.log('Default color: white (255, 255, 255)');
                console.log('Default strobe speed: 50ms per cycle (25ms on, 25ms off)');
                console.log('Default frequency: 20Hz (20 flashes per second)');
                console.log('Parameters:');
                console.log('  - color: Any color from the palette');
                console.log('  - duration: Total effect duration in ms (default 1000)');
                console.log('  - strobeSpeed: Ms per on/off cycle (default 50)');
                console.log('Pattern: Consistent rapid on/off toggling');
                console.log('End state: OFF (lights cleared)');
                console.log('Use case: Party effects, alerts, disorientation');
                break;

            default:
                console.log(`DESCRIPTION: ${effectName}`);
                console.log(`Duration: ${duration}ms`);
                break;
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    async runShowcase(): Promise<void> {
        if (!this.isConnected) {
            const connected = await this.initialize();
            if (!connected) {
                this.cleanup();
                return;
            }
        }

        while (true) {
            const selection = await this.selectEffect();

            if (selection === 0) {
                console.log('\n👋 Exiting showcase...');
                break;
            }

            if (selection === 26) {
                // Custom Parameters Mode
                await this.runCustomEffect();
                continue;
            }

            const effect = EFFECT_REGISTRY[selection - 1]!;
            const duration = await this.getDuration();

            console.log(`\n▶️  Playing: ${effect.name}`);
            console.log(`   Duration: ${duration}ms`);
            console.log('   Press Ctrl+C to stop early\n');

            // Log detailed effect information
            this.logEffectDetails(effect.name, duration);

            effect.run(this.hue, duration);

            // Wait for effect to complete
            await new Promise(resolve => setTimeout(resolve, duration));

            // Return to idle color after effect
            this.setIdleColor();

            const again = await this.getUserInput('\n🔄 Run another effect? (y/n): ');

            if (again.toLowerCase() !== 'y') {
                console.log('\n👋 Thanks for using the showcase!');
                break;
            }
        }

        this.cleanup();
    }

    private async selectColorFromList(promptText: string = 'Select a color'): Promise<Color> {
        console.log(`\n🎨 ${promptText}:\n`);

        const colorNames = Object.keys(COLORS) as (keyof typeof COLORS)[];
        colorNames.forEach((name, index) => {
            const color = COLORS[name];
            console.log(`  ${(index + 1).toString().padStart(2)}. ${name.padEnd(15)} (R:${color.r.toString().padStart(3)} G:${color.g.toString().padStart(3)} B:${color.b.toString().padStart(3)})`);
        });

        while (true) {
            const input = await this.getUserInput(`\nEnter color number (1-${colorNames.length}) or press Enter for default: `);

            if (input === '') {
                return null as unknown as Color; // Will use default
            }

            const selection = parseInt(input);
            if (!isNaN(selection) && selection >= 1 && selection <= colorNames.length) {
                const colorName = colorNames[selection - 1]!;
                return COLORS[colorName];
            }

            console.log('Invalid selection. Please try again.');
        }
    }

    private async getParameterInput(param: EffectParam): Promise<Color | Color[] | number | boolean> {
        if (param.type === 'color') {
            if (param.name === 'colorSequence') {
                // Special case for color sequence
                console.log(`\n🎨 Parameter: ${param.name} (comma-separated colors)`);
                console.log(`   Default: ${param.default}`);
                const input = await this.getUserInput('Enter color names separated by commas or press Enter for default: ');

                if (input === '') {
                    const colorNames = (param.default as string).split(',');
                    return colorNames.map(name => COLORS[name as keyof typeof COLORS] || COLORS.white);
                }

                const colorNames = input.split(',').map(s => s.trim());
                return colorNames.map(name => COLORS[name as keyof typeof COLORS] || COLORS.white);
            } else {
                const color = await this.selectColorFromList(`Parameter: ${param.name}`);
                if (color === null) {
                    // Use default color
                    const defaultName = param.default as string;
                    return COLORS[defaultName as keyof typeof COLORS] || COLORS.white;
                }
                return color;
            }
        } else if (param.type === 'number') {
            console.log(`\n🔢 Parameter: ${param.name}`);
            console.log(`   Default: ${param.default}`);
            console.log(`   Type: number`);

            const input = await this.getUserInput('Enter value or press Enter for default: ');

            if (input === '') {
                return param.default as number;
            }

            const value = parseFloat(input);
            if (isNaN(value)) {
                console.log('Invalid number, using default');
                return param.default as number;
            }

            return value;
        }

        return param.default as (number | boolean);
    }

    private displayCustomEffects(): void {
        console.log('\n🎛️  Custom Parameters Mode - Available Effects:\n');

        const categories = {
            'Basic': ['setSolidColor', 'percentageBar', 'flashColor', 'fadeToBlack', 'acceleratingPulse', 'strobeLight', 'randomColorSequence'],
            'Gradient': ['gradientWave', 'rippleGradient', 'breathingGradient', 'chaseGradient'],
            'Wave': ['rainbowWave', 'pulseWave'],
            'Bouncing': ['bouncingWave', 'pulsingBounce', 'fadeBounce', 'doubleBounce'],
            'Flash': ['flashingColorSequence', 'policeFlash', 'mexicanFlag', 'policeFlashPro'],
            'Explosion': ['explosionFlash', 'explosionFlashRipple'],
            'Advanced': ['meteorShower', 'doubleStrike', 'timeRewind', 'shockwave', 'energyBurst', 'spiralVortex', 'lightningStrike', 'poisonDrip', 'iceShatter'],
            'Temperature': ['sunriseEffect', 'candlelightFlicker', 'dayNightCycle'],
            'Color Space': ['xyPrecisionRainbow', 'multiLayerAlphaBlend', 'brightnessWave'],
            'Utility': ['countdownPulse', 'countdownPulseWithColors', 'segmentedCountdownPulse', 'segmentedCountdownPulseWithColors', 'clearAllLights']
        };

        let index = 1;
        for (const [category, effects] of Object.entries(categories)) {
            console.log(`\n  ${category}:`);
            for (const effectName of effects) {
                console.log(`    ${index.toString().padStart(2)}. ${effectName}`);
                index++;
            }
        }

        console.log('\n   0. Back to main menu');
    }

    private async runCustomEffect(): Promise<void> {
        this.displayCustomEffects();

        const effectNames = Object.keys(this.CUSTOM_EFFECTS);

        while (true) {
            const input = await this.getUserInput(`\n🎯 Select effect (1-${effectNames.length}) or 0 to go back: `);
            const selection = parseInt(input);

            if (selection === 0) {
                return;
            }

            if (!isNaN(selection) && selection >= 1 && selection <= effectNames.length) {
                const effectName = effectNames[selection - 1]!;
                const effect = this.CUSTOM_EFFECTS[effectName];

                if (!effect) {
                    console.log(`Effect ${effectName} not found`);
                    continue;
                }

                console.log(`\n▶️  Configuring: ${effectName}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

                // Collect parameters
                const params: (Color | Color[] | number | boolean)[] = [];
                for (const param of effect.params) {
                    const value = await this.getParameterInput(param);
                    params.push(value);
                }

                // Smart duration detection
                const durationParamIndex = effect.params.findIndex(p => p.name === 'duration');
                const runTimeParamIndex = effect.params.findIndex(p => p.name === 'runTime');
                let displayDuration: number;

                if (durationParamIndex !== -1) {
                    // Use the duration parameter value
                    displayDuration = params[durationParamIndex] as number;
                    console.log(`\n▶️  Playing: ${effectName}`);
                    console.log(`   Using effect duration parameter: ${displayDuration}ms`);
                } else if (runTimeParamIndex !== -1 && params[runTimeParamIndex] as number > 0) {
                    // Use runTime if provided and > 0
                    displayDuration = params[runTimeParamIndex] as number;
                    console.log(`\n▶️  Playing: ${effectName}`);
                    console.log(`   Using runTime parameter: ${displayDuration}ms`);
                } else {
                    // Only ask for display duration if no timing parameter exists
                    const duration = await this.getUserInput('\n⏱️  Display duration in milliseconds (press Enter for 3000ms): ');
                    displayDuration = duration === '' ? 3000 : parseInt(duration) || 3000;
                    console.log(`\n▶️  Playing: ${effectName}`);
                    console.log(`   Display duration: ${displayDuration}ms`);
                }

                console.log('   Press Ctrl+C to stop early\n');

                // Track start time for effective duration logging
                const startTime = Date.now();

                // Execute the effect
                try {
                    const method = (this.hue as unknown as Record<string, unknown>)[effect.method];
                    if (typeof method === 'function') {
                        method.apply(this.hue, params);
                    } else {
                        console.log(`Method ${effect.method} not found`);
                    }
                } catch (error) {
                    console.log(`Error executing effect: ${error}`);
                }

                // Wait for effect to complete
                await new Promise(resolve => setTimeout(resolve, displayDuration));

                // Log effective duration
                const effectiveDuration = Date.now() - startTime;
                console.log(`\nEffect completed. Effective duration: ${effectiveDuration}ms`);

                // Return to idle color
                this.setIdleColor();

                const again = await this.getUserInput('\n🔄 Try another custom effect? (y/n): ');

                if (again.toLowerCase() !== 'y') {
                    break;
                }

                this.displayCustomEffects();
            } else {
                console.log('Invalid selection. Please try again.');
            }
        }
    }

    private cleanup(): void {
        this.rl.close();
        this.hue.shutdown();
        process.exit(0);
    }
}

// Main execution
async function main() {
    const showcase = new EffectShowcase();

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        console.log('\n\nInterrupted! Cleaning up...');
        showcase['cleanup']();
    });

    await showcase.runShowcase();
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});