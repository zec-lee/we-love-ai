import { ComparisonMode, MapLayerType } from '../types/microclimate';

export interface LayerScaleSpec {
  id: MapLayerType;
  label: string;
  shortLabel: string;
  unit: string;
  absMin: number;
  absMax: number;
  deltaMaxAbs: number;
  stressThreshold?: number;
  stressLabel?: string;
  description: string;
  stopsLabel: string[];
  deltaStopsLabel: string[];
}

export const LAYER_SCALE_SPECS: Record<MapLayerType, LayerScaleSpec> = {
  utci: {
    id: 'utci',
    label: 'UTCI Thermal Comfort',
    shortLabel: 'UTCI',
    unit: '°C',
    absMin: 26.0,
    absMax: 42.0,
    deltaMaxAbs: 5.0,
    stressThreshold: 32.0,
    stressLabel: '> 32°C Strong Heat Stress',
    description:
      'Universal Thermal Climate Index combining air temp, SOLWEIG MRT, URock pedestrian wind, and humidity.',
    stopsLabel: ['26°C', '30°C', '34°C', '38°C', '42°C'],
    deltaStopsLabel: ['-5.0°C (Cooler)', '-2.5°C', '0.0°C', '+2.5°C', '+5.0°C (Warmer)'],
  },
  pet: {
    id: 'pet',
    label: 'PET Physiological Temp',
    shortLabel: 'PET',
    unit: '°C',
    absMin: 26.0,
    absMax: 44.0,
    deltaMaxAbs: 6.0,
    stressThreshold: 35.0,
    stressLabel: '> 35°C Warm Stress',
    description:
      'Physiological Equivalent Temperature derived from the human energy balance (MEMI) at z = 1.5m.',
    stopsLabel: ['26°C', '30.5°C', '35°C', '39.5°C', '44°C'],
    deltaStopsLabel: ['-6.0°C (Cooler)', '-3.0°C', '0.0°C', '+3.0°C', '+6.0°C (Warmer)'],
  },
  mrt: {
    id: 'mrt',
    label: 'Mean Radiant Temp (SOLWEIG)',
    shortLabel: 'MRT',
    unit: '°C',
    absMin: 28.0,
    absMax: 62.0,
    deltaMaxAbs: 18.0,
    stressThreshold: 45.0,
    stressLabel: '> 45°C High Radiant Load',
    description:
      'SOLWEIG shortwave + longwave radiant exposure from direct sun, sky view factor, ground, and walls.',
    stopsLabel: ['28°C', '36.5°C', '45°C', '53.5°C', '62°C'],
    deltaStopsLabel: ['-18°C (Shaded)', '-9°C', '0°C', '+9°C', '+18°C (Exposed)'],
  },
  wind: {
    id: 'wind',
    label: 'Pedestrian Wind (URock)',
    shortLabel: 'Wind',
    unit: 'm/s',
    absMin: 0.0,
    absMax: 4.5,
    deltaMaxAbs: 1.8,
    description:
      'URock semi-empirical airflow at z = 1.5m resolving street-canyon channelling, leeward wakes, and void-deck throughflow.',
    stopsLabel: ['0.0 m/s', '1.1 m/s', '2.2 m/s', '3.4 m/s', '4.5 m/s'],
    deltaStopsLabel: ['-1.8 m/s (Stagnant)', '-0.9 m/s', '0.0', '+0.9 m/s', '+1.8 m/s (Breezier)'],
  },
  shade: {
    id: 'shade',
    label: 'Direct Solar Shade Factor',
    shortLabel: 'Shade',
    unit: '%',
    absMin: 0,
    absMax: 100,
    deltaMaxAbs: 100,
    description:
      'Percentage of direct beam solar radiation blocked by buildings, canopies, and tree crowns at z = 1.5m.',
    stopsLabel: ['0% (Sunlit)', '25%', '50%', '75%', '100% (Shaded)'],
    deltaStopsLabel: ['-100% (Lost Shade)', '-50%', '0%', '+50%', '+100% (New Shade)'],
  },
};

function lerpRGB(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * clamped),
    Math.round(c1[1] + (c2[1] - c1[1]) * clamped),
    Math.round(c1[2] + (c2[2] - c1[2]) * clamped),
  ];
}

function multiStopInterpolate(
  stops: Array<[number, number, number]>,
  t: number
): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  return lerpRGB(stops[idx], stops[idx + 1], frac);
}

// Thermal ramp (UTCI, PET, MRT): Cool Cyan-Blue -> Emerald -> Amber -> Coral -> Deep Crimson
const THERMAL_RAMP: Array<[number, number, number]> = [
  [30, 136, 229], // 26°C Cool comfort
  [38, 198, 218], // 29°C Slight warm
  [102, 187, 106], // 31.5°C Moderate
  [253, 216, 53], // 34°C Warm
  [251, 140, 0], // 37°C Strong heat stress
  [229, 57, 53], // 39.5°C Very strong stress
  [142, 14, 58], // 42°C+ Extreme hotspot
];

// Wind ramp (0 to 4.5 m/s): Deep Indigo (stagnant wake) -> Teal -> Cyan -> Bright Mint
const WIND_RAMP: Array<[number, number, number]> = [
  [26, 35, 78], // Stagnant wake
  [21, 101, 192],
  [0, 172, 193],
  [38, 218, 180],
  [167, 255, 235], // High Venturi / corridor breeze
];

// Shade ramp (0% sunlit to 100% shaded): Warm Sunlit Gold -> Slate -> Cool Canopy Teal
const SHADE_RAMP: Array<[number, number, number]> = [
  [245, 158, 11], // 0% Direct sun
  [217, 119, 6],
  [100, 116, 139],
  [20, 184, 166],
  [13, 148, 136], // 100% Deep shade
];

// Diverging Delta ramp (Thermal: negative = cooler = emerald/cyan, 0 = neutral slate, positive = warmer = rose/red)
const THERMAL_DELTA_RAMP: Array<[number, number, number]> = [
  [6, 182, 212], // Strong cooling (-max)
  [16, 185, 129], // Moderate cooling
  [51, 65, 85], // 0.0 No change
  [245, 158, 11], // Moderate warming
  [239, 68, 68], // Strong warming (+max)
];

// Diverging Delta ramp (Wind/Shade: negative = loss = coral/amber, 0 = neutral slate, positive = gain = cyan/emerald)
const BENEFICIAL_POSITIVE_DELTA_RAMP: Array<[number, number, number]> = [
  [239, 68, 68], // Strong reduction (-max)
  [245, 158, 11],
  [51, 65, 85], // 0.0 No change
  [16, 185, 129],
  [6, 182, 212], // Strong increase (+max)
];

export function sampleLayerRGB(
  layer: MapLayerType,
  mode: ComparisonMode,
  value: number
): [number, number, number] {
  const spec = LAYER_SCALE_SPECS[layer];

  if (mode === 'delta') {
    const t = (value + spec.deltaMaxAbs) / (2 * spec.deltaMaxAbs);
    if (layer === 'wind' || layer === 'shade') {
      return multiStopInterpolate(BENEFICIAL_POSITIVE_DELTA_RAMP, t);
    }
    return multiStopInterpolate(THERMAL_DELTA_RAMP, t);
  }

  // Absolute scale (identical for Baseline and Proposal!)
  const t = (value - spec.absMin) / Math.max(0.0001, spec.absMax - spec.absMin);
  if (layer === 'wind') {
    return multiStopInterpolate(WIND_RAMP, t);
  }
  if (layer === 'shade') {
    return multiStopInterpolate(SHADE_RAMP, t);
  }
  return multiStopInterpolate(THERMAL_RAMP, t);
}

export function getLegendGradientCSS(
  layer: MapLayerType,
  mode: ComparisonMode
): string {
  const stops =
    mode === 'delta'
      ? layer === 'wind' || layer === 'shade'
        ? BENEFICIAL_POSITIVE_DELTA_RAMP
        : THERMAL_DELTA_RAMP
      : layer === 'wind'
        ? WIND_RAMP
        : layer === 'shade'
          ? SHADE_RAMP
          : THERMAL_RAMP;

  const cssStops = stops
    .map((rgb, i) => {
      const pct = Math.round((i / (stops.length - 1)) * 100);
      return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]}) ${pct}%`;
    })
    .join(', ');

  return `linear-gradient(90deg, ${cssStops})`;
}

export function classifyUtciThermalStress(utci: number): {
  category: string;
  toneClass: string;
} {
  if (utci > 38) {
    return { category: 'Very Strong Heat Stress', toneClass: 'text-rose-400' };
  }
  if (utci > 32) {
    return { category: 'Strong Heat Stress', toneClass: 'text-amber-400' };
  }
  if (utci > 26) {
    return { category: 'Moderate Heat Stress', toneClass: 'text-emerald-400' };
  }
  return { category: 'No Thermal Stress', toneClass: 'text-cyan-400' };
}
