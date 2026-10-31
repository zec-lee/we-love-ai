export type OrientationAngle = 0 | 15 | 30 | 45;

export type LayoutPresetId =
  | 'baseline-parallel'
  | 'staggered-courtyard'
  | 'wind-corridor'
  | 'void-deck-cluster';

export type GreeneryPresetId =
  | 'none'
  | 'sparse-palms'
  | 'courtyard-raintrees'
  | 'dense-canopy-avenue';

export type WeatherScenarioId =
  | 'peak-tropical'
  | 'monsoon-breeze'
  | 'calm-heatwave';

export type TimeOfDayId = '10:00' | '14:00' | '16:30';

export type MapLayerType = 'utci' | 'pet' | 'mrt' | 'wind' | 'shade';

export type ComparisonMode = 'proposal' | 'baseline' | 'delta';

export interface ShadingConfig {
  walkwayCanopy: boolean;
  playgroundShadeSails: boolean;
  courtyardPergola: boolean;
}

export interface CustomBlockOverride {
  blockId: string;
  offsetX: number; // meters (-15 to +15)
  offsetZ: number; // meters (-15 to +15)
  extraRotationDeg: number; // degrees (-30 to +30)
}

export interface ScenarioConfig {
  orientationDeg: OrientationAngle;
  layoutPreset: LayoutPresetId;
  voidDecksEnabled: boolean;
  shading: ShadingConfig;
  greeneryPreset: GreeneryPresetId;
  weatherScenario: WeatherScenarioId;
  timeOfDay: TimeOfDayId;
  customBlockOverride?: CustomBlockOverride | null;
}

export interface BlockGeometry {
  id: string;
  label: string;
  x: number; // center X in meters (-60 to +60)
  z: number; // center Z in meters (-60 to +60)
  width: number; // meters (X local)
  depth: number; // meters (Z local)
  height: number; // total height in meters
  storeys: number;
  rotationRad: number; // yaw rotation in radians
  hasVoidDeck: boolean;
  voidDeckHeight: number; // meters (0 if closed, 3.6 if open)
  floorAreaM2: number;
}

export interface TreeGeometry {
  id: string;
  species: string;
  x: number;
  z: number;
  trunkHeight: number;
  crownRadius: number;
  totalHeight: number;
  transmissivity: number; // shortwave transmissivity tau (0.12 - 0.45)
  leafAreaIndex: number;
}

export interface ShadeCanopyGeometry {
  id: string;
  label: string;
  type: 'walkway-arch' | 'playground-sails' | 'courtyard-pergola';
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationRad: number;
  transmissivity: number; // tau (0.06 - 0.15)
}

export interface ActivityZoneGeometry {
  id: string;
  label: string;
  type: 'walkway' | 'courtyard' | 'playground' | 'pavilion' | 'void-deck';
  probeX: number;
  probeZ: number;
  width: number;
  depth: number;
  description: string;
}

export interface EstateGeometryModel {
  siteSizeM: number; // 120m x 120m
  gridSize: number; // 48 x 48
  totalFloorAreaM2: number; // Conserved ~42,000 m2
  blocks: BlockGeometry[];
  trees: TreeGeometry[];
  canopies: ShadeCanopyGeometry[];
  zones: ActivityZoneGeometry[];
}

export interface ProbeReading {
  id: string;
  label: string;
  zoneType: ActivityZoneGeometry['type'];
  x: number;
  z: number;
  utci: number;
  pet: number;
  mrt: number;
  windSpeed: number;
  shaded: boolean;
  skyViewFactor: number;
}

export interface GridSummaryStats {
  utciMean: number;
  utciMedianP50: number;
  utciP90: number;
  utciHotspotP95: number;
  utciMax: number;
  utciMin: number;
  petMean: number;
  petP90: number;
  mrtMean: number;
  mrtP90: number;
  windMean: number;
  windMin: number;
  windMax: number;
  shadeCoveragePct: number; // % of pedestrian walkable area shaded
  areaAbove32UtciPct: number; // % Strong Heat Stress (>32°C)
  areaAbove38UtciPct: number; // % Very Strong Heat Stress (>38°C)
  walkableCellsCount: number;
}

export interface SimulationResult {
  scenarioHash: string;
  scenarioLabel: string;
  config: ScenarioConfig;
  gridSize: number; // 48
  siteSizeM: number; // 120
  // Flattened 48x48 arrays (length 2304, row-major z then x)
  utciGrid: number[];
  petGrid: number[];
  mrtGrid: number[];
  windGrid: number[];
  shadeGrid: number[]; // 0 (unshaded) to 1 (fully shaded), -1 inside solid building footprint
  buildingMask: number[]; // 1 if solid ground-floor building footprint, 2 if open void-deck underpass, 0 if outdoor
  stats: GridSummaryStats;
  probes: ProbeReading[];
  weatherMeta: {
    airTempC: number;
    relativeHumidityPct: number;
    refWindSpeedMs: number;
    windDirectionDeg: number; // meteorological (0=N, 45=NE, 90=E)
    solarAltitudeDeg: number;
    solarAzimuthDeg: number;
    directRadiationWm2: number;
    diffuseRadiationWm2: number;
  };
  computeTimeMs: number;
  cached: boolean;
  timestamp: string;
}

export interface PresetScenarioItem {
  id: string;
  title: string;
  badge: string;
  description: string;
  config: ScenarioConfig;
}

export interface AIRecommendationOption {
  title: string;
  rationale: string;
  expectedImpact: string;
  isPrecomputedInCache: boolean;
  suggestedConfigPatch: Partial<ScenarioConfig>;
}

export interface AIAdvisorResponse {
  headlineDiagnosis: string;
  spatialFindings: string[];
  modelScopeNote: string;
  recommendations: AIRecommendationOption[];
  generatedBy: string;
}

export const WEATHER_CATALOG: Record<
  WeatherScenarioId,
  {
    name: string;
    shortLabel: string;
    airTempC: number;
    relativeHumidityPct: number;
    refWindSpeedMs: number;
    windDirectionDeg: number;
    windLabel: string;
    directBeamMaxWm2: number;
    diffuseMaxWm2: number;
  }
> = {
  'peak-tropical': {
    name: 'Equatorial Design Day (NE Trade)',
    shortLabel: '32.0°C · 68% RH · 2.8 m/s NE',
    airTempC: 32.0,
    relativeHumidityPct: 68,
    refWindSpeedMs: 2.8,
    windDirectionDeg: 45, // From NE
    windLabel: 'NE 45° (2.8 m/s)',
    directBeamMaxWm2: 840,
    diffuseMaxWm2: 210,
  },
  'monsoon-breeze': {
    name: 'NE Monsoon Brisk Airflow',
    shortLabel: '30.0°C · 75% RH · 4.2 m/s NE',
    airTempC: 30.0,
    relativeHumidityPct: 75,
    refWindSpeedMs: 4.2,
    windDirectionDeg: 35, // From NNE
    windLabel: 'NNE 35° (4.2 m/s)',
    directBeamMaxWm2: 760,
    diffuseMaxWm2: 230,
  },
  'calm-heatwave': {
    name: 'Inter-Monsoon Calm Heat Stress',
    shortLabel: '34.0°C · 62% RH · 1.2 m/s E',
    airTempC: 34.0,
    relativeHumidityPct: 62,
    refWindSpeedMs: 1.2,
    windDirectionDeg: 80, // From E
    windLabel: 'E 80° (1.2 m/s)',
    directBeamMaxWm2: 910,
    diffuseMaxWm2: 195,
  },
};

export const SOLAR_TIME_CATALOG: Record<
  TimeOfDayId,
  {
    label: string;
    altitudeDeg: number;
    azimuthDeg: number; // 0=N, 90=E, 180=S, 270=W
    tempOffsetC: number;
    radiationFactor: number;
  }
> = {
  '10:00': {
    label: '10:00 Morning Sun',
    altitudeDeg: 52,
    azimuthDeg: 102, // ESE
    tempOffsetC: -1.4,
    radiationFactor: 0.84,
  },
  '14:00': {
    label: '14:00 Peak Solar',
    altitudeDeg: 71,
    azimuthDeg: 238, // WSW
    tempOffsetC: 0.0,
    radiationFactor: 1.0,
  },
  '16:30': {
    label: '16:30 Low Western Sun',
    altitudeDeg: 36,
    azimuthDeg: 262, // W
    tempOffsetC: -0.6,
    radiationFactor: 0.68,
  },
};

export const BASELINE_SCENARIO_CONFIG: ScenarioConfig = {
  orientationDeg: 0,
  layoutPreset: 'baseline-parallel',
  voidDecksEnabled: false,
  shading: {
    walkwayCanopy: false,
    playgroundShadeSails: false,
    courtyardPergola: false,
  },
  greeneryPreset: 'none',
  weatherScenario: 'peak-tropical',
  timeOfDay: '14:00',
  customBlockOverride: null,
};

export const MILESTONE_1_SHADE_CONFIG: ScenarioConfig = {
  ...BASELINE_SCENARIO_CONFIG,
  shading: {
    walkwayCanopy: true,
    playgroundShadeSails: true,
    courtyardPergola: false,
  },
};

export const CURATED_PRESET_SCENARIOS: PresetScenarioItem[] = [
  {
    id: 'baseline',
    title: '00. Baseline Estate (Unshaded Parallel)',
    badge: 'Baseline Reference',
    description:
      '5 parallel residential slab blocks (0° N-S), solid ground floors, exposed central courtyard, spine walkway, and playground.',
    config: BASELINE_SCENARIO_CONFIG,
  },
  {
    id: 'milestone-1-shade',
    title: '01. Milestone 1: Walkway & Playground Canopies',
    badge: 'First Milestone',
    description:
      'Same baseline estate geometry with continuous high-albedo walkway canopy and tensile shade sails over the playground.',
    config: MILESTONE_1_SHADE_CONFIG,
  },
  {
    id: 'orientation-ne-15',
    title: '02. Orientation +15° NE Wind Alignment',
    badge: 'Orientation Study',
    description:
      'Rotates block axis +15° to align street canyons with prevailing NE trade winds while adding walkway shade.',
    config: {
      ...MILESTONE_1_SHADE_CONFIG,
      orientationDeg: 15,
    },
  },
  {
    id: 'ventilation-void-decks',
    title: '03. Staggered Courtyard + Open Void Decks',
    badge: 'Ventilation & Void Decks',
    description:
      'Staggers block spacing to widen the wind corridor and opens 3.6m ground-floor void decks beneath all blocks (GFA locked at 42,000 m²).',
    config: {
      ...MILESTONE_1_SHADE_CONFIG,
      orientationDeg: 15,
      layoutPreset: 'staggered-courtyard',
      voidDecksEnabled: true,
    },
  },
  {
    id: 'greenery-raintrees',
    title: '04. Mature Rain Tree Cluster (Samanea saman)',
    badge: 'Greenery Intervention',
    description:
      'Introduces wide-spreading tropical Rain Trees (14m crown diameter, τ = 0.16) across the central courtyard and playground.',
    config: {
      ...BASELINE_SCENARIO_CONFIG,
      greeneryPreset: 'courtyard-raintrees',
    },
  },
  {
    id: 'integrated-cooling-masterplan',
    title: '05. Integrated Cooling Masterplan',
    badge: 'Combined Best Practice',
    description:
      'Combines +15° NE orientation, wind-corridor spacing with open void decks, full canopy shading, and dense rain tree avenue.',
    config: {
      orientationDeg: 15,
      layoutPreset: 'wind-corridor',
      voidDecksEnabled: true,
      shading: {
        walkwayCanopy: true,
        playgroundShadeSails: true,
        courtyardPergola: true,
      },
      greeneryPreset: 'dense-canopy-avenue',
      weatherScenario: 'peak-tropical',
      timeOfDay: '14:00',
      customBlockOverride: null,
    },
  },
];

export function computeScenarioHash(config: ScenarioConfig): string {
  const customPart = config.customBlockOverride
    ? `_custom_${config.customBlockOverride.blockId}_${config.customBlockOverride.offsetX.toFixed(1)}_${config.customBlockOverride.offsetZ.toFixed(1)}_${config.customBlockOverride.extraRotationDeg.toFixed(1)}`
    : '_std';
  return [
    `ori:${config.orientationDeg}`,
    `lay:${config.layoutPreset}`,
    `vd:${config.voidDecksEnabled ? 1 : 0}`,
    `sh:${config.shading.walkwayCanopy ? 1 : 0}${config.shading.playgroundShadeSails ? 1 : 0}${config.shading.courtyardPergola ? 1 : 0}`,
    `gr:${config.greeneryPreset}`,
    `wx:${config.weatherScenario}`,
    `tm:${config.timeOfDay}`,
    customPart,
  ].join('|');
}

export function describeScenarioShort(config: ScenarioConfig): string {
  const layoutLabels: Record<LayoutPresetId, string> = {
    'baseline-parallel': 'Parallel Slabs',
    'staggered-courtyard': 'Staggered Courtyard',
    'wind-corridor': 'Widened Wind Corridor',
    'void-deck-cluster': 'Perimeter Cluster',
  };
  const shadeCount =
    (config.shading.walkwayCanopy ? 1 : 0) +
    (config.shading.playgroundShadeSails ? 1 : 0) +
    (config.shading.courtyardPergola ? 1 : 0);
  const customTag = config.customBlockOverride
    ? ` · Custom ${config.customBlockOverride.blockId} Edit`
    : '';
  return `${layoutLabels[config.layoutPreset]} (${config.orientationDeg}°) · ${
    config.voidDecksEnabled ? 'Void Decks Open' : 'Solid Plinth'
  } · ${shadeCount}/3 Canopies · Greenery: ${config.greeneryPreset}${customTag}`;
}

/**
 * Deterministic 3D Estate Geometry Builder
 * Conserves Total Gross Floor Area (GFA) at 42,000 m² across all layouts so
 * ventilation/shade comparisons never reward removing development floor space.
 */
export function buildEstateGeometry(config: ScenarioConfig): EstateGeometryModel {
  const siteSizeM = 120;
  const gridSize = 48;
  const globalRad = (config.orientationDeg * Math.PI) / 180;
  const voidDeckHeight = config.voidDecksEnabled ? 3.6 : 0;
  const storeyHeightM = 3.2;

  // Rotate (x,z) around estate center (0,0) by global orientation angle
  const rotateGlobal = (x: number, z: number): [number, number] => {
    const cos = Math.cos(globalRad);
    const sin = Math.sin(globalRad);
    return [x * cos - z * sin, x * sin + z * cos];
  };

  // Base block templates per layout preset (all total exactly 42,000 m² GFA)
  // Standard footprint: 28m x 12.5m = 350 m² per floor.
  // 5 blocks x 24 floors total across 5 blocks = 120 residential floors * 350 = 42,000 m²
  let rawBlocks: Array<{
    id: string;
    label: string;
    x: number;
    z: number;
    width: number;
    depth: number;
    storeys: number;
    localAngleDeg: number;
  }> = [];

  switch (config.layoutPreset) {
    case 'baseline-parallel':
      // Tighter parallel slabs that partially obstruct NE oblique wind and leave courtyard exposed
      rawBlocks = [
        { id: 'BLK-A', label: 'Block A (North-West)', x: -24, z: -30, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 0 },
        { id: 'BLK-B', label: 'Block B (North-East)', x: 22, z: -30, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 0 },
        { id: 'BLK-C', label: 'Block C (Central East)', x: 30, z: 2, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 90 },
        { id: 'BLK-D', label: 'Block D (South-West)', x: -24, z: 32, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 0 },
        { id: 'BLK-E', label: 'Block E (South-East)', x: 22, z: 32, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 0 },
      ];
      break;

    case 'staggered-courtyard':
      // Staggered arrangement opens NE -> SW diagonal wind passage while conserving 120 total floors
      rawBlocks = [
        { id: 'BLK-A', label: 'Block A (North-West)', x: -30, z: -34, width: 28, depth: 12.5, storeys: 24, localAngleDeg: -8 },
        { id: 'BLK-B', label: 'Block B (North-East)', x: 28, z: -38, width: 25, depth: 14.0, storeys: 24, localAngleDeg: -15 },
        { id: 'BLK-C', label: 'Block C (East Wing)', x: 38, z: 6, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 75 },
        { id: 'BLK-D', label: 'Block D (South-West)', x: -32, z: 28, width: 28, depth: 12.5, storeys: 24, localAngleDeg: -8 },
        { id: 'BLK-E', label: 'Block E (South-East)', x: 18, z: 36, width: 28, depth: 12.5, storeys: 24, localAngleDeg: 0 },
      ];
      break;

    case 'wind-corridor':
      // Slender slightly taller towers (25m x 12m = 300 m²/floor, 28 storeys each = 140 floors * 300 = 42,000 m²)
      // Creates wide breezy channels aligned with the central courtyard and playground
      rawBlocks = [
        { id: 'BLK-A', label: 'Block A (North-West Tower)', x: -34, z: -34, width: 25, depth: 12.0, storeys: 28, localAngleDeg: -20 },
        { id: 'BLK-B', label: 'Block B (North-East Gate)', x: 32, z: -36, width: 25, depth: 12.0, storeys: 28, localAngleDeg: -25 },
        { id: 'BLK-C', label: 'Block C (Mid-East Foil)', x: 40, z: 4, width: 25, depth: 12.0, storeys: 28, localAngleDeg: -25 },
        { id: 'BLK-D', label: 'Block D (South-West Tower)', x: -34, z: 32, width: 25, depth: 12.0, storeys: 28, localAngleDeg: -20 },
        { id: 'BLK-E', label: 'Block E (South-East Anchor)', x: 22, z: 38, width: 25, depth: 12.0, storeys: 28, localAngleDeg: -15 },
      ];
      break;

    case 'void-deck-cluster':
      // Perimeter courtyard arrangement providing strong west-sun self-shading in late afternoon
      rawBlocks = [
        { id: 'BLK-A', label: 'Block A (West Shield N)', x: -36, z: -18, width: 28, depth: 12.5, storeys: 26, localAngleDeg: 85 },
        { id: 'BLK-B', label: 'Block B (North Bar)', x: 8, z: -38, width: 28, depth: 12.5, storeys: 22, localAngleDeg: 0 },
        { id: 'BLK-C', label: 'Block C (East Bar)', x: 36, z: -4, width: 28, depth: 12.5, storeys: 22, localAngleDeg: 85 },
        { id: 'BLK-D', label: 'Block D (West Shield S)', x: -32, z: 24, width: 28, depth: 12.5, storeys: 26, localAngleDeg: 75 },
        { id: 'BLK-E', label: 'Block E (South Bar)', x: 14, z: 36, width: 28, depth: 12.5, storeys: 24, localAngleDeg: -5 },
      ];
      break;
  }

  const blocks: BlockGeometry[] = rawBlocks.map((b) => {
    let [rx, rz] = rotateGlobal(b.x, b.z);
    let rotRad = globalRad + (b.localAngleDeg * Math.PI) / 180;

    if (
      config.customBlockOverride &&
      config.customBlockOverride.blockId === b.id
    ) {
      rx += config.customBlockOverride.offsetX;
      rz += config.customBlockOverride.offsetZ;
      rotRad += (config.customBlockOverride.extraRotationDeg * Math.PI) / 180;
    }

    const residentialHeight = b.storeys * storeyHeightM;
    return {
      id: b.id,
      label: b.label,
      x: rx,
      z: rz,
      width: b.width,
      depth: b.depth,
      height: residentialHeight + voidDeckHeight,
      storeys: b.storeys,
      rotationRad: rotRad,
      hasVoidDeck: config.voidDecksEnabled,
      voidDeckHeight,
      floorAreaM2: Math.round(b.width * b.depth * b.storeys),
    };
  });

  const totalFloorAreaM2 = blocks.reduce((acc, b) => acc + b.floorAreaM2, 0);

  // Shade Canopies over key pedestrian zones
  const canopies: ShadeCanopyGeometry[] = [];
  if (config.shading.walkwayCanopy) {
    // Spine walkway runs from North-East (-4, -26) through Courtyard (0, 0) to South-West (-8, 28)
    canopies.push({
      id: 'SHADE-WALKWAY-N',
      label: 'North Spine Covered Linkway',
      type: 'walkway-arch',
      x: -6,
      z: -16,
      width: 6.5,
      depth: 26,
      height: 4.2,
      rotationRad: 0.12,
      transmissivity: 0.08,
    });
    canopies.push({
      id: 'SHADE-WALKWAY-S',
      label: 'South Spine Covered Linkway',
      type: 'walkway-arch',
      x: -8,
      z: 16,
      width: 6.5,
      depth: 26,
      height: 4.2,
      rotationRad: -0.1,
      transmissivity: 0.08,
    });
  }

  if (config.shading.playgroundShadeSails) {
    canopies.push({
      id: 'SHADE-PLAYGROUND',
      label: 'Playground Tensile Shade Sails',
      type: 'playground-sails',
      x: -14,
      z: 4,
      width: 18,
      depth: 16,
      height: 5.5,
      rotationRad: 0,
      transmissivity: 0.1,
    });
  }

  if (config.shading.courtyardPergola) {
    canopies.push({
      id: 'SHADE-COURTYARD',
      label: 'Central Courtyard Louvered Pergola',
      type: 'courtyard-pergola',
      x: 8,
      z: -2,
      width: 20,
      depth: 18,
      height: 4.8,
      rotationRad: 0,
      transmissivity: 0.12,
    });
  }

  // Greenery arrangements with explicit crown radius, height, and solar transmissivity
  const trees: TreeGeometry[] = [];
  const addTree = (
    id: string,
    species: string,
    x: number,
    z: number,
    trunkHeight: number,
    crownRadius: number,
    transmissivity: number,
    lai: number
  ) => {
    trees.push({
      id,
      species,
      x,
      z,
      trunkHeight,
      crownRadius,
      totalHeight: trunkHeight + crownRadius * 1.35,
      transmissivity,
      leafAreaIndex: lai,
    });
  };

  if (config.greeneryPreset === 'sparse-palms') {
    const coords: Array<[number, number]> = [
      [-18, -12],
      [-2, -14],
      [14, -12],
      [-20, 14],
      [2, 16],
      [16, 12],
      [-6, 0],
      [14, 0],
    ];
    coords.forEach(([tx, tz], idx) => {
      addTree(`TREE-PALM-${idx}`, 'Royal Palm (Roystonea regia)', tx, tz, 6.5, 3.2, 0.42, 1.8);
    });
  } else if (config.greeneryPreset === 'courtyard-raintrees') {
    const coords: Array<[number, number]> = [
      [4, -8],
      [14, -6],
      [8, 6],
      [-4, -6],
      [-18, -2],
      [-12, 10],
      [-2, 14],
      [16, 10],
      [-10, -18],
      [10, -20],
    ];
    coords.forEach(([tx, tz], idx) => {
      addTree(`TREE-RAIN-${idx}`, 'Rain Tree (Samanea saman)', tx, tz, 4.5, 7.2, 0.16, 4.2);
    });
  } else if (config.greeneryPreset === 'dense-canopy-avenue') {
    const coords: Array<[number, number]> = [
      // Courtyard + Playground cluster
      [4, -8],
      [14, -6],
      [8, 6],
      [-4, -6],
      [-18, -2],
      [-12, 10],
      [-18, 8],
      [-6, 8],
      // Spine Walkway & Perimeter Avenue
      [-4, -22],
      [-10, -14],
      [-10, 22],
      [0, 22],
      [18, -18],
      [22, -8],
      [20, 14],
      [-26, -12],
      [-26, 14],
      [2, -2],
    ];
    coords.forEach(([tx, tz], idx) => {
      addTree(
        `TREE-AVE-${idx}`,
        idx % 2 === 0 ? 'Rain Tree (Samanea saman)' : 'Yellow Flame (Peltophorum)',
        tx,
        tz,
        4.2,
        6.8,
        0.15,
        4.5
      );
    });
  }

  // Designated Pedestrian Activity Zones & Point Probes
  const bBlock = blocks.find((b) => b.id === 'BLK-B') || blocks[1];
  const zones: ActivityZoneGeometry[] = [
    {
      id: 'PROBE-WALKWAY',
      label: 'Spine Walkway',
      type: 'walkway',
      probeX: -6,
      probeZ: -14,
      width: 6,
      depth: 48,
      description: 'Primary N-S pedestrian commuter path linking transit to residential blocks.',
    },
    {
      id: 'PROBE-COURTYARD',
      label: 'Central Courtyard',
      type: 'courtyard',
      probeX: 8,
      probeZ: -2,
      width: 22,
      depth: 20,
      description: 'Open communal plaza between blocks, prone to midday radiant heat buildup.',
    },
    {
      id: 'PROBE-PLAYGROUND',
      label: "Children's Playground",
      type: 'playground',
      probeX: -14,
      probeZ: 4,
      width: 16,
      depth: 14,
      description: 'Rubber-surfaced active play zone sensitive to high surface and radiant temperatures.',
    },
    {
      id: 'PROBE-PAVILION',
      label: 'Seating Pavilion',
      type: 'pavilion',
      probeX: 6,
      probeZ: 14,
      width: 10,
      depth: 10,
      description: 'Elderly rest & social seating node on the southern edge of the courtyard.',
    },
    {
      id: 'PROBE-VOIDDECK',
      label: 'Block B Void Deck',
      type: 'void-deck',
      probeX: bBlock.x,
      probeZ: bBlock.z,
      width: 14,
      depth: 10,
      description: 'Ground-floor under-building space testing piloti airflow channelling vs solid plinth.',
    },
  ];

  return {
    siteSizeM,
    gridSize,
    totalFloorAreaM2,
    blocks,
    trees,
    canopies,
    zones,
  };
}
