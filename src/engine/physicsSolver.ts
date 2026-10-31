import {
  BlockGeometry,
  buildEstateGeometry,
  computeScenarioHash,
  describeScenarioShort,
  GridSummaryStats,
  ProbeReading,
  ScenarioConfig,
  ShadeCanopyGeometry,
  SimulationResult,
  SOLAR_TIME_CATALOG,
  TreeGeometry,
  WEATHER_CATALOG,
} from '../types/microclimate';

const PEDESTRIAN_HEIGHT_M = 1.5;
const STEFAN_BOLTZMANN = 5.670374419e-8;
const HUMAN_EMISSIVITY = 0.97;
const HUMAN_ABSORPTIVITY_SHORTWAVE = 0.7;

/**
 * Transform world (x, z) into local coordinates of a rotated rectangle centered at (cx, cz)
 */
function worldToLocal2D(
  x: number,
  z: number,
  cx: number,
  cz: number,
  rotationRad: number
): [number, number] {
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(-rotationRad);
  const sin = Math.sin(-rotationRad);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

/**
 * Check if a 3D point (px, py, pz) is inside a BlockGeometry
 * Respects ground-floor void deck opening (0 <= py < voidDeckHeight)
 */
function isPointInSolidBlock(
  px: number,
  py: number,
  pz: number,
  block: BlockGeometry
): boolean {
  if (py < 0 || py > block.height) return false;
  if (block.hasVoidDeck && py < block.voidDeckHeight) {
    return false; // Open void deck beneath the residential slab!
  }
  const [lx, lz] = worldToLocal2D(px, pz, block.x, block.z, block.rotationRad);
  return Math.abs(lx) <= block.width * 0.5 && Math.abs(lz) <= block.depth * 0.5;
}

/**
 * Check if (px, pz) footprint falls inside block plan footprint
 */
function isPointInBlockFootprint(
  px: number,
  pz: number,
  block: BlockGeometry
): boolean {
  const [lx, lz] = worldToLocal2D(px, pz, block.x, block.z, block.rotationRad);
  return Math.abs(lx) <= block.width * 0.5 && Math.abs(lz) <= block.depth * 0.5;
}

/**
 * Check if a 3D ray from (ox, oy, oz) along unit vector (dx, dy, dz)
 * intersects building blocks, shade canopies, or tree crowns.
 * Returns cumulative shortwave transmissivity tau in [0, 1].
 */
function traceSolarRayTransmissivity(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  blocks: BlockGeometry[],
  canopies: ShadeCanopyGeometry[],
  trees: TreeGeometry[]
): number {
  let tau = 1.0;

  // March along solar ray from pedestrian height (1.5m) up to 95m
  // Using fine step near pedestrian level (canopies/trees) and coarser step higher up (towers)
  const maxDist = 110;
  let t = 0.8;
  while (t < maxDist) {
    const rx = ox + dx * t;
    const ry = oy + dy * t;
    const rz = oz + dz * t;

    if (ry > 98) break;

    // 1. Check solid building blocks (opaque: tau = 0)
    for (let i = 0; i < blocks.length; i++) {
      if (isPointInSolidBlock(rx, ry, rz, blocks[i])) {
        return 0.0;
      }
    }

    // 2. Check overhead shade canopies (thin horizontal slabs at canopy.height ± 0.7m)
    if (ry >= 3.2 && ry <= 6.6) {
      for (let i = 0; i < canopies.length; i++) {
        const c = canopies[i];
        if (Math.abs(ry - c.height) <= 0.75) {
          const [lx, lz] = worldToLocal2D(rx, rz, c.x, c.z, c.rotationRad);
          if (Math.abs(lx) <= c.width * 0.5 && Math.abs(lz) <= c.depth * 0.5) {
            tau = Math.min(tau, c.transmissivity);
          }
        }
      }
    }

    // 3. Check tree crowns (ellipsoidal crown centered at trunkHeight + crownRadius*0.65)
    if (ry >= 2.8 && ry <= 16.5) {
      for (let i = 0; i < trees.length; i++) {
        const tr = trees[i];
        const centerY = tr.trunkHeight + tr.crownRadius * 0.65;
        const radiusY = tr.crownRadius * 0.75;
        const ndx = (rx - tr.x) / tr.crownRadius;
        const ndy = (ry - centerY) / radiusY;
        const ndz = (rz - tr.z) / tr.crownRadius;
        if (ndx * ndx + ndy * ndy + ndz * ndz <= 1.0) {
          tau = Math.min(tau, tr.transmissivity);
        }
      }
    }

    t += ry < 16 ? 1.1 : 2.4;
  }

  return tau;
}

/**
 * Estimate Sky View Factor (SVF) at pedestrian point (px, pz)
 * Combines building canyon solid-angle obstruction and overhead canopy/tree cover
 */
function computeSkyViewFactor(
  px: number,
  pz: number,
  blocks: BlockGeometry[],
  canopies: ShadeCanopyGeometry[],
  trees: TreeGeometry[],
  isUnderVoidDeck: boolean
): number {
  if (isUnderVoidDeck) {
    return 0.14; // Deeply sheltered under building slab
  }

  let obstructedFraction = 0;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const [lx, lz] = worldToLocal2D(px, pz, b.x, b.z, b.rotationRad);
    const dx = Math.max(0, Math.abs(lx) - b.width * 0.5);
    const dz = Math.max(0, Math.abs(lz) - b.depth * 0.5);
    const dist = Math.max(2.0, Math.hypot(dx, dz));
    // Elevation angle subtended by building height
    const elevAngle = Math.atan2(b.height - PEDESTRIAN_HEIGHT_M, dist);
    const azimuthalSpan = Math.min(0.28, (b.width + b.depth) / (4 * Math.PI * (dist + 6)));
    obstructedFraction += (elevAngle / (Math.PI * 0.5)) * azimuthalSpan;
  }

  // Overhead shade canopy reduction
  for (let i = 0; i < canopies.length; i++) {
    const c = canopies[i];
    const [lx, lz] = worldToLocal2D(px, pz, c.x, c.z, c.rotationRad);
    if (Math.abs(lx) <= c.width * 0.55 && Math.abs(lz) <= c.depth * 0.55) {
      obstructedFraction += 0.45 * (1 - c.transmissivity);
    }
  }

  // Overhead or nearby tree crown reduction
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    const dist = Math.hypot(px - tr.x, pz - tr.z);
    if (dist < tr.crownRadius * 1.25) {
      const weight = 1 - dist / (tr.crownRadius * 1.25);
      obstructedFraction += 0.38 * weight * (1 - tr.transmissivity);
    }
  }

  return Math.max(0.12, Math.min(0.96, 1.0 - obstructedFraction));
}

/**
 * SOLWEIG-Inspired Mean Radiant Temperature (Tmrt in °C)
 * Accounts for direct beam shortwave, diffuse sky shortwave, reflected ground/wall shortwave,
 * sky longwave, ground surface longwave (cooled by shade), and sunlit/shaded surrounding walls.
 */
function computeSolweigMeanRadiantTemp(
  airTempC: number,
  directBeamWm2: number,
  diffuseSkyWm2: number,
  solarAltitudeDeg: number,
  tauDirect: number,
  svf: number,
  hasTreeOverhead: boolean,
  isUnderVoidDeck: boolean
): number {
  const altRad = (solarAltitudeDeg * Math.PI) / 180;
  // Cylinder/standing human projection factor fp (SOLWEIG / Höppe formulation)
  const fp = 0.308 * Math.cos(altRad * (1 - (solarAltitudeDeg * solarAltitudeDeg) / 48400));

  // Shortwave fluxes reaching the pedestrian body
  const kDirectHorizontal = directBeamWm2 * Math.sin(altRad) * tauDirect;
  const kDirectBody = directBeamWm2 * fp * tauDirect;
  const kDiffuseBody = diffuseSkyWm2 * svf * 0.5;
  const groundAlbedo = hasTreeOverhead ? 0.16 : 0.2;
  const kReflectedBody =
    (kDirectHorizontal + diffuseSkyWm2 * svf) * groundAlbedo * 0.5;

  const totalShortwaveAbsorbed =
    HUMAN_ABSORPTIVITY_SHORTWAVE * (kDirectBody + kDiffuseBody + kReflectedBody);

  // Longwave radiation components
  const taKelvin = airTempC + 273.15;
  // Clear-sky effective emissivity
  const skyTempKelvin = taKelvin - 11.0;
  const lSky = STEFAN_BOLTZMANN * Math.pow(skyTempKelvin, 4) * svf * 0.5;

  // Ground surface temperature excess depends on solar exposure
  const sunlitGroundExcessC = isUnderVoidDeck
    ? -1.2
    : tauDirect * (hasTreeOverhead ? 6.5 : 14.5) - (1 - tauDirect) * 1.8;
  const groundTempKelvin = taKelvin + sunlitGroundExcessC;
  const lGround =
    HUMAN_EMISSIVITY * STEFAN_BOLTZMANN * Math.pow(groundTempKelvin, 4) * 0.5;

  // Surrounding walls and canopy underside longwave
  // Vegetated shade stays near air temp; sunlit concrete walls warm by +4.5°C
  const wallExcessC = isUnderVoidDeck
    ? -0.8
    : hasTreeOverhead
      ? 0.4
      : 1.5 + 3.2 * tauDirect;
  const wallTempKelvin = taKelvin + wallExcessC;
  const lWalls =
    HUMAN_EMISSIVITY *
    STEFAN_BOLTZMANN *
    Math.pow(wallTempKelvin, 4) *
    (1 - svf) *
    0.5;

  const totalLongwaveAbsorbed = HUMAN_EMISSIVITY * (lSky + lGround + lWalls);

  const sStr = totalShortwaveAbsorbed + totalLongwaveAbsorbed;
  const tmrtKelvin = Math.pow(sStr / (HUMAN_EMISSIVITY * STEFAN_BOLTZMANN), 0.25);
  return tmrtKelvin - 273.15;
}

/**
 * URock-Inspired Semi-Empirical Spatial Wind Field Solver at z = 1.5m
 * Models:
 * 1. Logarithmic pedestrian height adjustment from reference wind speed
 * 2. Upwind stagnation cushion & corner streamtube acceleration
 * 3. Leeward recirculation cavity & far-wake velocity deficit behind solid blocks
 * 4. Explicit Void-Deck Venturi underpass flow when voidDecksEnabled = true
 * 5. Porous vegetative canopy drag under low-branching trees
 */
function computeURockPedestrianWind(
  px: number,
  pz: number,
  refWindSpeedMs: number,
  windDirectionDeg: number, // Meteorological direction wind blows FROM (0=N, 45=NE, 90=E)
  blocks: BlockGeometry[],
  trees: TreeGeometry[]
): number {
  // Convert meteorological "FROM" angle to unit flow vector (wx, wz) in Three.js world (N = -Z, E = +X)
  const radFrom = (windDirectionDeg * Math.PI) / 180;
  // Wind coming from North (0°) blows toward South (+Z); from East (90°) blows toward West (-X)
  const flowX = -Math.sin(radFrom);
  const flowZ = Math.cos(radFrom);
  // Cross-wind perpendicular vector
  const crossX = -flowZ;
  const crossZ = flowX;

  // Base pedestrian wind speed (z=1.5m vs z_ref=10m log profile factor ~0.68 in suburban/urban roughness)
  let windFactor = 0.72;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    // Check if point is directly inside the building footprint
    if (isPointInBlockFootprint(px, pz, b)) {
      if (b.hasVoidDeck) {
        // Explicit Void-Deck Permeability:
        // Pressure differential between windward and leeward facade drives Venturi flow under the piloti slab
        return Math.max(0.4, refWindSpeedMs * 0.84);
      } else {
        return 0.05; // Solid ground floor obstacle
      }
    }

    // Project (px - b.x, pz - b.z) onto wind-aligned coordinates (alongWind > 0 is downwind of block center)
    const relX = px - b.x;
    const relZ = pz - b.z;
    const alongWind = relX * flowX + relZ * flowZ;
    const acrossWind = Math.abs(relX * crossX + relZ * crossZ);

    // Effective cross-wind width W_eff and along-wind depth D_eff of the rotated block
    const angleDiff = Math.abs(b.rotationRad - radFrom);
    const wEff =
      b.width * Math.abs(Math.cos(angleDiff)) +
      b.depth * Math.abs(Math.sin(angleDiff));
    const dEff =
      b.width * Math.abs(Math.sin(angleDiff)) +
      b.depth * Math.abs(Math.cos(angleDiff));

    const halfWidth = wEff * 0.5;
    const halfDepth = dEff * 0.5;

    // 1. Upwind displacement zone (stagnation cushion in front of solid blocks)
    if (alongWind < -halfDepth && alongWind > -halfDepth - 14) {
      if (acrossWind < halfWidth * 0.95) {
        const upwindDist = -halfDepth - alongWind;
        const cushionLoss = b.hasVoidDeck ? 0.14 : 0.42;
        const decay = 1 - cushionLoss * Math.exp(-upwindDist / 6.5);
        windFactor *= decay;
      }
    }

    // 2. Corner streamtube / street-canyon channelling acceleration along block flanks
    if (
      Math.abs(alongWind) <= halfDepth * 1.25 &&
      acrossWind > halfWidth &&
      acrossWind < halfWidth + 14
    ) {
      const flankDist = acrossWind - halfWidth;
      // Blocks aligned obliquely/parallel with wind channel airflow strongly
      const alignmentBoost = 0.22 * Math.exp(-flankDist / 7.0);
      windFactor *= 1.0 + alignmentBoost;
    }

    // 3. Downwind Leeward Cavity & Wake Zone (URock Röckle formulation)
    if (alongWind > halfDepth) {
      const leeDist = alongWind - halfDepth;
      // Cavity length Lr scales with effective width and height
      const cavityLength = Math.min(34, 1.4 * wEff);
      const wakeWidth = halfWidth + leeDist * 0.18;

      if (acrossWind < wakeWidth) {
        const lateralProfile = Math.cos(
          (acrossWind / wakeWidth) * (Math.PI * 0.5)
        );
        if (b.hasVoidDeck) {
          // Open Void Deck bleeds high-momentum air into the leeward cavity, suppressing stagnant wakes!
          const jetRecovery =
            1.08 * Math.exp(-leeDist / 16.0) +
            0.88 * (1 - Math.exp(-leeDist / 16.0));
          windFactor *=
            1.0 - (1.0 - jetRecovery) * Math.pow(lateralProfile, 1.2);
        } else {
          // Solid ground floor creates deep recirculation cavity and slow far-wake recovery
          if (leeDist < cavityLength) {
            const cavityDeficit = 0.72 * lateralProfile;
            windFactor *= 1.0 - cavityDeficit;
          } else {
            const wakeDecay =
              0.55 *
              Math.exp(-(leeDist - cavityLength) / 24.0) *
              lateralProfile;
            windFactor *= 1.0 - wakeDecay;
          }
        }
      }
    }
  }

  // 4. Vegetative aerodynamic drag near dense tree crowns/trunks
  for (let i = 0; i < trees.length; i++) {
    const tr = trees[i];
    const dist = Math.hypot(px - tr.x, pz - tr.z);
    if (dist < tr.crownRadius * 1.15) {
      // High-branching tropical trees allow moderate under-trunk breeze while slightly damping gusts
      windFactor *= 0.91;
    }
  }

  return Math.max(0.15, Math.min(refWindSpeedMs * 1.35, refWindSpeedMs * windFactor));
}

/**
 * Calculate Universal Thermal Climate Index (UTCI in °C)
 * Based on Bröde et al. (2012) sensitivity to Ta, (Tmrt - Ta), v_10m, and water vapour pressure (RH)
 */
export function calculateUTCI(
  taC: number,
  tmrtC: number,
  windPedestrianMs: number,
  rhPct: number
): number {
  const dTmrt = tmrtC - taC;
  // Convert pedestrian 1.5m wind speed to meteorological 10m wind speed (standard UTCI input)
  const va10m = Math.max(0.5, Math.min(17.0, windPedestrianMs * 1.42));

  // Saturation vapour pressure (hPa) and actual vapour pressure (hPa)
  const esHpa = 6.1078 * Math.exp((17.27 * taC) / (taC + 237.3));
  const eaHpa = esHpa * (rhPct / 100);
  // Reference 50% RH vapour pressure at Ta
  const eaRef50 = esHpa * 0.5;

  // Radiant offset (approximately +0.265°C UTCI per +1°C of Tmrt - Ta in warm conditions, modulated by wind)
  const radiantContribution =
    dTmrt * (0.275 - 0.014 * Math.min(6, va10m));

  // Convective wind cooling offset (stronger when air temp < skin temp 35°C, plus evaporative cooling boost)
  const windCooling =
    -1.52 * Math.pow(va10m - 0.5, 0.58) * (1 - 0.015 * Math.max(0, taC - 33));

  // Humidity / latent heat stress offset relative to 50% RH reference
  const humidityContribution = (eaHpa - eaRef50) * (0.145 + 0.004 * Math.max(0, taC - 26));

  return Number((taC + radiantContribution + windCooling + humidityContribution).toFixed(2));
}

/**
 * Calculate Physiological Equivalent Temperature (PET in °C)
 * Approximates the Munich Energy-Balance Model for Individuals (MEMI) for a pedestrian
 * (Metabolic rate = 80W + basal, clothing = 0.9 clo)
 */
export function calculatePET(
  taC: number,
  tmrtC: number,
  windPedestrianMs: number,
  rhPct: number
): number {
  const dTmrt = tmrtC - taC;
  const vEff = Math.max(0.15, windPedestrianMs);

  // In MEMI/PET, radiant temperature has a higher weighting at low wind speeds and decreases as convective heat transfer h_c = 8.6 * v^0.53 rises
  const hc = 8.6 * Math.pow(vEff, 0.53);
  const hr = 5.7; // linearized radiative transfer coefficient W/(m2·K)
  const radiantWeight = hr / (hr + hc * 0.68);

  const esHpa = 6.1078 * Math.exp((17.27 * taC) / (taC + 237.3));
  const eaHpa = esHpa * (rhPct / 100);

  // Indoor reference environment for PET has v = 0.1 m/s, vp = 12 hPa, Tmrt = Ta
  const windOffset = -1.85 * Math.pow(vEff - 0.1, 0.52);
  const humidityOffset = (eaHpa - 12.0) * 0.085;

  const pet = taC + dTmrt * radiantWeight + windOffset + humidityOffset;
  return Number(pet.toFixed(2));
}

function getPercentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * sortedAsc.length))
  );
  return Number(sortedAsc[idx].toFixed(2));
}

/**
 * Full 2.5D SOLWEIG + URock + PET/UTCI Spatial Simulation on a 48x48 Common Grid
 */
export function runMicroclimateSimulation(
  config: ScenarioConfig,
  cached = false
): SimulationResult {
  const t0 = performance.now();
  const geometry = buildEstateGeometry(config);
  const weather = WEATHER_CATALOG[config.weatherScenario];
  const solarTime = SOLAR_TIME_CATALOG[config.timeOfDay];

  const airTempC = Number((weather.airTempC + solarTime.tempOffsetC).toFixed(1));
  const rhPct = weather.relativeHumidityPct;
  const refWindMs = weather.refWindSpeedMs;
  const windDirDeg = weather.windDirectionDeg;

  const directBeamWm2 = Math.round(
    weather.directBeamMaxWm2 * solarTime.radiationFactor
  );
  const diffuseSkyWm2 = Math.round(
    weather.diffuseMaxWm2 * solarTime.radiationFactor
  );

  // Unit vector pointing toward the sun
  const altRad = (solarTime.altitudeDeg * Math.PI) / 180;
  const azRad = (solarTime.azimuthDeg * Math.PI) / 180;
  // Azimuth: 0=N (-Z), 90=E (+X), 180=S (+Z), 270=W (-X)
  const sunDx = Math.cos(altRad) * Math.sin(azRad);
  const sunDy = Math.sin(altRad);
  const sunDz = -Math.cos(altRad) * Math.cos(azRad);

  const gridSize = geometry.gridSize; // 48
  const siteSizeM = geometry.siteSizeM; // 120
  const cellSizeM = siteSizeM / gridSize; // 2.5m
  const halfSite = siteSizeM * 0.5; // 60m

  const totalCells = gridSize * gridSize;
  const utciGrid = new Array<number>(totalCells);
  const petGrid = new Array<number>(totalCells);
  const mrtGrid = new Array<number>(totalCells);
  const windGrid = new Array<number>(totalCells);
  const shadeGrid = new Array<number>(totalCells);
  const buildingMask = new Array<number>(totalCells);

  const walkableUtci: number[] = [];
  const walkablePet: number[] = [];
  const walkableMrt: number[] = [];
  const walkableWind: number[] = [];
  let shadedWalkableCount = 0;
  let above32UtciCount = 0;
  let above38UtciCount = 0;

  for (let row = 0; row < gridSize; row++) {
    const pz = -halfSite + (row + 0.5) * cellSizeM;
    for (let col = 0; col < gridSize; col++) {
      const px = -halfSite + (col + 0.5) * cellSizeM;
      const idx = row * gridSize + col;

      // Check if cell center is inside a building footprint
      let inFootprint = false;
      let isUnderVoidDeck = false;
      for (let bIdx = 0; bIdx < geometry.blocks.length; bIdx++) {
        const blk = geometry.blocks[bIdx];
        if (isPointInBlockFootprint(px, pz, blk)) {
          inFootprint = true;
          isUnderVoidDeck = blk.hasVoidDeck;
          break;
        }
      }

      if (inFootprint && !isUnderVoidDeck) {
        // Solid building ground floor (non-walkable)
        buildingMask[idx] = 1;
        shadeGrid[idx] = -1;
        mrtGrid[idx] = airTempC;
        windGrid[idx] = 0;
        utciGrid[idx] = airTempC;
        petGrid[idx] = airTempC;
        continue;
      }

      buildingMask[idx] = isUnderVoidDeck ? 2 : 0;

      // Check if under a tree crown
      let hasTreeOverhead = false;
      for (let tIdx = 0; tIdx < geometry.trees.length; tIdx++) {
        const tr = geometry.trees[tIdx];
        if (Math.hypot(px - tr.x, pz - tr.z) <= tr.crownRadius) {
          hasTreeOverhead = true;
          break;
        }
      }

      // 1. SOLWEIG-Lite: Solar raycast transmissivity & Sky View Factor
      const tauDirect = isUnderVoidDeck
        ? 0.0
        : traceSolarRayTransmissivity(
            px,
            PEDESTRIAN_HEIGHT_M,
            pz,
            sunDx,
            sunDy,
            sunDz,
            geometry.blocks,
            geometry.canopies,
            geometry.trees
          );

      const svf = computeSkyViewFactor(
        px,
        pz,
        geometry.blocks,
        geometry.canopies,
        geometry.trees,
        isUnderVoidDeck
      );

      const tmrt = computeSolweigMeanRadiantTemp(
        airTempC,
        directBeamWm2,
        diffuseSkyWm2,
        solarTime.altitudeDeg,
        tauDirect,
        svf,
        hasTreeOverhead,
        isUnderVoidDeck
      );

      // 2. URock-Lite: Spatial wind speed at z = 1.5m
      const windSpeed = computeURockPedestrianWind(
        px,
        pz,
        refWindMs,
        windDirDeg,
        geometry.blocks,
        geometry.trees
      );

      // 3. Comfort Indices: UTCI & PET
      const utci = calculateUTCI(airTempC, tmrt, windSpeed, rhPct);
      const pet = calculatePET(airTempC, tmrt, windSpeed, rhPct);

      const shadeFraction = Number((1.0 - tauDirect).toFixed(2));
      mrtGrid[idx] = Number(tmrt.toFixed(2));
      windGrid[idx] = Number(windSpeed.toFixed(2));
      utciGrid[idx] = utci;
      petGrid[idx] = pet;
      shadeGrid[idx] = shadeFraction;

      walkableUtci.push(utci);
      walkablePet.push(pet);
      walkableMrt.push(mrtGrid[idx]);
      walkableWind.push(windGrid[idx]);

      if (shadeFraction >= 0.5) shadedWalkableCount++;
      if (utci > 32.0) above32UtciCount++;
      if (utci > 38.0) above38UtciCount++;
    }
  }

  // Sort walkable arrays for exact percentile extraction
  const sortedUtci = [...walkableUtci].sort((a, b) => a - b);
  const sortedPet = [...walkablePet].sort((a, b) => a - b);
  const sortedMrt = [...walkableMrt].sort((a, b) => a - b);
  const sortedWind = [...walkableWind].sort((a, b) => a - b);

  const nWalk = Math.max(1, walkableUtci.length);
  const avg = (arr: number[]) =>
    Number((arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length)).toFixed(2));

  const stats: GridSummaryStats = {
    utciMean: avg(walkableUtci),
    utciMedianP50: getPercentile(sortedUtci, 50),
    utciP90: getPercentile(sortedUtci, 90),
    utciHotspotP95: getPercentile(sortedUtci, 95),
    utciMax: sortedUtci[sortedUtci.length - 1] ?? airTempC,
    utciMin: sortedUtci[0] ?? airTempC,
    petMean: avg(walkablePet),
    petP90: getPercentile(sortedPet, 90),
    mrtMean: avg(walkableMrt),
    mrtP90: getPercentile(sortedMrt, 90),
    windMean: avg(walkableWind),
    windMin: sortedWind[0] ?? 0,
    windMax: sortedWind[sortedWind.length - 1] ?? refWindMs,
    shadeCoveragePct: Number(((shadedWalkableCount / nWalk) * 100).toFixed(1)),
    areaAbove32UtciPct: Number(((above32UtciCount / nWalk) * 100).toFixed(1)),
    areaAbove38UtciPct: Number(((above38UtciCount / nWalk) * 100).toFixed(1)),
    walkableCellsCount: walkableUtci.length,
  };

  // Sample exact readings at the 5 designated estate activity probes
  const probes: ProbeReading[] = geometry.zones.map((z) => {
    const px = z.probeX;
    const pz = z.probeZ;

    let inFootprint = false;
    let isUnderVoidDeck = false;
    for (let bIdx = 0; bIdx < geometry.blocks.length; bIdx++) {
      const blk = geometry.blocks[bIdx];
      if (isPointInBlockFootprint(px, pz, blk)) {
        inFootprint = true;
        isUnderVoidDeck = blk.hasVoidDeck;
        break;
      }
    }

    let hasTreeOverhead = false;
    for (let tIdx = 0; tIdx < geometry.trees.length; tIdx++) {
      const tr = geometry.trees[tIdx];
      if (Math.hypot(px - tr.x, pz - tr.z) <= tr.crownRadius) {
        hasTreeOverhead = true;
        break;
      }
    }

    const tauDirect =
      inFootprint && !isUnderVoidDeck
        ? 0.0
        : isUnderVoidDeck
          ? 0.0
          : traceSolarRayTransmissivity(
              px,
              PEDESTRIAN_HEIGHT_M,
              pz,
              sunDx,
              sunDy,
              sunDz,
              geometry.blocks,
              geometry.canopies,
              geometry.trees
            );

    const svf = computeSkyViewFactor(
      px,
      pz,
      geometry.blocks,
      geometry.canopies,
      geometry.trees,
      isUnderVoidDeck
    );

    const tmrt = computeSolweigMeanRadiantTemp(
      airTempC,
      directBeamWm2,
      diffuseSkyWm2,
      solarTime.altitudeDeg,
      tauDirect,
      svf,
      hasTreeOverhead,
      isUnderVoidDeck
    );

    const windSpeed =
      inFootprint && !isUnderVoidDeck
        ? 0.1
        : computeURockPedestrianWind(
            px,
            pz,
            refWindMs,
            windDirDeg,
            geometry.blocks,
            geometry.trees
          );

    const utci = calculateUTCI(airTempC, tmrt, windSpeed, rhPct);
    const pet = calculatePET(airTempC, tmrt, windSpeed, rhPct);

    return {
      id: z.id,
      label: z.label,
      zoneType: z.type,
      x: px,
      z: pz,
      utci,
      pet,
      mrt: Number(tmrt.toFixed(1)),
      windSpeed: Number(windSpeed.toFixed(2)),
      shaded: tauDirect < 0.5,
      skyViewFactor: Number(svf.toFixed(2)),
    };
  });

  const computeTimeMs = Math.max(1, Math.round(performance.now() - t0));

  return {
    scenarioHash: computeScenarioHash(config),
    scenarioLabel: describeScenarioShort(config),
    config,
    gridSize,
    siteSizeM,
    utciGrid,
    petGrid,
    mrtGrid,
    windGrid,
    shadeGrid,
    buildingMask,
    stats,
    probes,
    weatherMeta: {
      airTempC,
      relativeHumidityPct: rhPct,
      refWindSpeedMs: refWindMs,
      windDirectionDeg: windDirDeg,
      solarAltitudeDeg: solarTime.altitudeDeg,
      solarAzimuthDeg: solarTime.azimuthDeg,
      directRadiationWm2: directBeamWm2,
      diffuseRadiationWm2: diffuseSkyWm2,
    },
    computeTimeMs,
    cached,
    timestamp: new Date().toISOString(),
  };
}
