import { type Color, COLORS, type Hue } from '@nhuerta/node-hue-edk';

export interface EffectParams {
  color?: string;
  color1?: string;
  color2?: string;
  baseColor?: string;
  flashColor?: string;
  duration?: number;
  runTime?: number;
  speed?: number;
  period?: number;
  bounceSpeed?: number;
  pulseSpeed?: number;
  colorSequence?: string[];
  flashCount?: number;
  flashSpeed?: number;
  percentage?: number;
  totalSeconds?: number;
  startColor?: string;
  endColor?: string;
  seg0StartColor?: string;
  seg0EndColor?: string;
  seg1StartColor?: string;
  seg1EndColor?: string;
  seg2StartColor?: string;
  seg2EndColor?: string;
  pulseCount?: number;
  startSpeed?: number;
  endSpeed?: number;
  strobeSpeed?: number;
}

export class EffectRegistry {
  private static resolveColor(colorName: string): Color {
    const color = COLORS[colorName as keyof typeof COLORS];
    if (!color) {
      throw new Error(`Unknown color: ${colorName}. Check COLORS in @nhuerta/node-hue-edk`);
    }
    return color;
  }

  private static resolveColorArray(colorNames: string[]): Color[] {
    return colorNames.map(name => this.resolveColor(name));
  }

  public static execute(hue: Hue, effectType: string, params: EffectParams): void {
    try {
      console.log(`[effect] ${effectType} ${JSON.stringify(params)}`);
      switch (effectType) {
        // Single color effects
        case 'flashColor':
          hue.flashColor(this.resolveColor(params.color!), params.duration);
          break;
        case 'rippleGradient':
          hue.rippleGradient(this.resolveColor(params.color!), params.duration, params.runTime);
          break;
        case 'chaseGradient':
          hue.chaseGradient(this.resolveColor(params.color!), params.speed, params.runTime);
          break;
        case 'shockwave':
          hue.shockwave(this.resolveColor(params.color!), params.duration);
          break;
        case 'energyBurst':
          hue.energyBurst(this.resolveColor(params.color!), params.duration);
          break;
        case 'doubleStrike':
          hue.doubleStrike(this.resolveColor(params.color!), params.duration);
          break;
        case 'brightnessWave':
          hue.brightnessWave(this.resolveColor(params.baseColor!), params.duration);
          break;

        // Two color effects
        case 'gradientWave':
          hue.gradientWave(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.duration,
            params.runTime
          );
          break;
        case 'breathingGradient':
          hue.breathingGradient(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.period,
            params.runTime
          );
          break;
        case 'pulseWave':
          hue.pulseWave(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.speed,
            params.runTime
          );
          break;
        case 'bouncingWave':
          hue.bouncingWave(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.speed,
            params.runTime
          );
          break;
        case 'fadeBounce':
          hue.fadeBounce(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.speed,
            params.runTime
          );
          break;
        case 'doubleBounce':
          hue.doubleBounce(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.speed,
            params.runTime
          );
          break;
        case 'pulsingBounce':
          hue.pulsingBounce(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.bounceSpeed,
            params.pulseSpeed,
            params.runTime
          );
          break;
        case 'meteorShower':
          hue.meteorShower(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.duration
          );
          break;
        case 'timeRewind':
          hue.timeRewind(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.duration
          );
          break;
        case 'spiralVortex':
          hue.spiralVortex(
            this.resolveColor(params.color1!),
            this.resolveColor(params.color2!),
            params.duration
          );
          break;

        // Explosion effects
        case 'explosionFlash':
          hue.explosionFlash(
            this.resolveColor(params.baseColor!),
            this.resolveColor(params.flashColor!),
            params.duration
          );
          break;
        case 'explosionFlashRipple':
          hue.explosionFlashRipple(
            this.resolveColor(params.baseColor!),
            this.resolveColor(params.flashColor!),
            params.duration
          );
          break;

        // Sequence effects
        case 'flashingColorSequence':
          hue.flashingColorSequence(
            this.resolveColorArray(params.colorSequence!),
            params.flashCount,
            params.flashSpeed
          );
          break;
        case 'policeFlash':
          hue.policeFlash(params.flashCount, params.flashSpeed);
          break;
        case 'mexicanFlag':
          hue.mexicanFlag(params.flashCount, params.flashSpeed);
          break;
        case 'policeFlashPro':
          hue.policeFlashPro(params.duration);
          break;

        // Rainbow effects
        case 'rainbowWave':
          hue.rainbowWave(params.speed, params.runTime);
          break;
        case 'randomColorSequence':
          hue.randomColorSequence(params.duration);
          break;
        case 'xyPrecisionRainbow':
          hue.xyPrecisionRainbow(params.duration);
          break;

        // Countdown effects
        case 'countdownPulse':
          hue.countdownPulse(params.totalSeconds!);
          break;
        case 'countdownPulseWithColors':
          hue.countdownPulseWithColors(
            params.totalSeconds!,
            this.resolveColor(params.startColor!),
            this.resolveColor(params.endColor!)
          );
          break;
        case 'segmentedCountdownPulse':
          hue.segmentedCountdownPulse(params.totalSeconds!);
          break;
        case 'segmentedCountdownPulseWithColors':
          hue.segmentedCountdownPulseWithColors(
            params.totalSeconds!,
            this.resolveColor(params.seg0StartColor!),
            this.resolveColor(params.seg0EndColor!),
            this.resolveColor(params.seg1StartColor!),
            this.resolveColor(params.seg1EndColor!),
            this.resolveColor(params.seg2StartColor!),
            this.resolveColor(params.seg2EndColor!)
          );
          break;

        // Pulse/strobe effects
        case 'acceleratingPulse':
          hue.acceleratingPulse(
            this.resolveColor(params.color!),
            params.pulseCount,
            params.startSpeed,
            params.endSpeed
          );
          break;
        case 'strobeLight':
          hue.strobeLight(
            this.resolveColor(params.color!),
            params.duration,
            params.strobeSpeed
          );
          break;

        // Environmental effects
        case 'sunriseEffect':
          hue.sunriseEffect(params.duration);
          break;
        case 'candlelightFlicker':
          hue.candlelightFlicker(params.duration);
          break;
        case 'dayNightCycle':
          hue.dayNightCycle(params.duration);
          break;
        case 'fadeToBlack':
          hue.fadeToBlack();
          break;

        // Special effects
        case 'multiLayerAlphaBlend':
          hue.multiLayerAlphaBlend(params.duration);
          break;
        case 'lightningStrike':
          hue.lightningStrike(params.duration);
          break;
        case 'poisonDrip':
          hue.poisonDrip(params.duration);
          break;
        case 'iceShatter':
          hue.iceShatter(params.duration);
          break;

        default:
          throw new Error(`Unknown effect type: ${effectType}`);
      }
    } catch (error) {
      console.error(`Failed to execute effect ${effectType}:`, error);
      throw error;
    }
  }
}
