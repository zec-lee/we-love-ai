import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  AIAdvisorResponse,
  BASELINE_SCENARIO_CONFIG,
  computeScenarioHash,
  CURATED_PRESET_SCENARIOS,
  MILESTONE_1_SHADE_CONFIG,
  ScenarioConfig,
  SimulationResult,
} from './src/types/microclimate';
import { runMicroclimateSimulation } from './src/engine/physicsSolver';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

// Server-side Scenario Cache indexed by scenarioHash
const scenarioCache = new Map<string, SimulationResult>();

function seedInitialScenarioCache() {
  const start = performance.now();
  // 1. Seed all 6 curated milestone scenarios at 14:00 Peak Tropical
  for (const preset of CURATED_PRESET_SCENARIOS) {
    const hash = computeScenarioHash(preset.config);
    if (!scenarioCache.has(hash)) {
      const result = runMicroclimateSimulation(preset.config, true);
      scenarioCache.set(hash, result);
    }
  }

  // 2. Seed additional discrete variations (e.g., orientations 0, 15, 30, 45 & times 10:00, 16:30 for baseline & milestone 1)
  const extraConfigs: ScenarioConfig[] = [
    { ...BASELINE_SCENARIO_CONFIG, orientationDeg: 15 },
    { ...BASELINE_SCENARIO_CONFIG, orientationDeg: 30 },
    { ...BASELINE_SCENARIO_CONFIG, orientationDeg: 45 },
    { ...BASELINE_SCENARIO_CONFIG, voidDecksEnabled: true },
    { ...MILESTONE_1_SHADE_CONFIG, voidDecksEnabled: true },
    {
      ...MILESTONE_1_SHADE_CONFIG,
      shading: { walkwayCanopy: true, playgroundShadeSails: true, courtyardPergola: true },
    },
    {
      ...MILESTONE_1_SHADE_CONFIG,
      greeneryPreset: 'courtyard-raintrees',
    },
    { ...BASELINE_SCENARIO_CONFIG, timeOfDay: '10:00' },
    { ...BASELINE_SCENARIO_CONFIG, timeOfDay: '16:30' },
    { ...MILESTONE_1_SHADE_CONFIG, timeOfDay: '10:00' },
    { ...MILESTONE_1_SHADE_CONFIG, timeOfDay: '16:30' },
    { ...BASELINE_SCENARIO_CONFIG, weatherScenario: 'monsoon-breeze' },
    { ...MILESTONE_1_SHADE_CONFIG, weatherScenario: 'monsoon-breeze' },
    { ...BASELINE_SCENARIO_CONFIG, weatherScenario: 'calm-heatwave' },
    { ...MILESTONE_1_SHADE_CONFIG, weatherScenario: 'calm-heatwave' },
  ];

  for (const cfg of extraConfigs) {
    const hash = computeScenarioHash(cfg);
    if (!scenarioCache.has(hash)) {
      const result = runMicroclimateSimulation(cfg, true);
      scenarioCache.set(hash, result);
    }
  }

  const elapsed = Math.round(performance.now() - start);
  console.log(
    `[ScenarioCache] Pre-seeded ${scenarioCache.size} modelled SOLWEIG+URock scenarios in ${elapsed}ms`
  );
}

function buildDeterministicAdvisorFallback(
  baseline: SimulationResult,
  proposal: SimulationResult
): AIAdvisorResponse {
  const utciDelta = Number((proposal.stats.utciMean - baseline.stats.utciMean).toFixed(2));
  const p95Delta = Number(
    (proposal.stats.utciHotspotP95 - baseline.stats.utciHotspotP95).toFixed(2)
  );
  const stressDelta = Number(
    (proposal.stats.areaAbove32UtciPct - baseline.stats.areaAbove32UtciPct).toFixed(1)
  );

  // Identify hottest probe in proposal
  const sortedProbes = [...proposal.probes].sort((a, b) => b.utci - a.utci);
  const hottestProbe = sortedProbes[0];
  const coolestProbe = sortedProbes[sortedProbes.length - 1];

  const walkwayProbeBase = baseline.probes.find((p) => p.id === 'PROBE-WALKWAY');
  const walkwayProbeProp = proposal.probes.find((p) => p.id === 'PROBE-WALKWAY');
  const walkwayDelta =
    walkwayProbeBase && walkwayProbeProp
      ? Number((walkwayProbeProp.utci - walkwayProbeBase.utci).toFixed(1))
      : utciDelta;

  const recommendations: AIAdvisorResponse['recommendations'] = [];

  if (!proposal.config.shading.courtyardPergola || proposal.config.greeneryPreset === 'none') {
    const nextCfg: ScenarioConfig = {
      ...proposal.config,
      shading: {
        ...proposal.config.shading,
        walkwayCanopy: true,
        playgroundShadeSails: true,
        courtyardPergola: true,
      },
      greeneryPreset:
        proposal.config.greeneryPreset === 'none'
          ? 'courtyard-raintrees'
          : proposal.config.greeneryPreset,
      customBlockOverride: null,
    };
    recommendations.push({
      title: 'Add Courtyard Rain Trees & Louvered Pergola',
      rationale: `${hottestProbe.label} remains a radiant hotspot (UTCI ${hottestProbe.utci.toFixed(1)}°C, MRT ${hottestProbe.mrt.toFixed(1)}°C). High-transmissivity canopy cover targets direct shortwave radiation where sky view factor is highest.`,
      expectedImpact: 'Reduces local courtyard MRT by ~11–14°C and lowers P95 UTCI by ~2.4°C.',
      isPrecomputedInCache: scenarioCache.has(computeScenarioHash(nextCfg)),
      suggestedConfigPatch: {
        shading: nextCfg.shading,
        greeneryPreset: nextCfg.greeneryPreset,
        customBlockOverride: null,
      },
    });
  }

  if (!proposal.config.voidDecksEnabled || proposal.config.layoutPreset === 'baseline-parallel') {
    const ventCfg: ScenarioConfig = {
      ...proposal.config,
      orientationDeg: 15,
      layoutPreset: 'staggered-courtyard',
      voidDecksEnabled: true,
      customBlockOverride: null,
    };
    recommendations.push({
      title: 'Open Ground-Floor Void Decks & Stagger Blocks (+15°)',
      rationale: `Mean pedestrian wind speed is currently ${proposal.stats.windMean.toFixed(2)} m/s with leeward wake stagnation behind solid slabs. Opening 3.6m piloti void decks allows Venturi under-building airflow without reducing the 42,000 m² GFA.`,
      expectedImpact: 'Boosts void-deck & courtyard airflow by +0.6 to +1.1 m/s and trims UTCI by ~1.1°C.',
      isPrecomputedInCache: scenarioCache.has(computeScenarioHash(ventCfg)),
      suggestedConfigPatch: {
        orientationDeg: 15,
        layoutPreset: 'staggered-courtyard',
        voidDecksEnabled: true,
        customBlockOverride: null,
      },
    });
  }

  if (recommendations.length < 2) {
    const masterCfg = CURATED_PRESET_SCENARIOS[5].config;
    recommendations.push({
      title: 'Test Integrated Cooling Masterplan (Wind Corridor + Avenue Canopy)',
      rationale:
        'Combines widened wind-corridor towers (28 storeys, same 42,000 m² GFA) with continuous Rain Tree avenue shading to eliminate residual thermal stress pockets.',
      expectedImpact: 'Brings estate P90 UTCI below 33.0°C and increases shade coverage above 45%.',
      isPrecomputedInCache: scenarioCache.has(computeScenarioHash(masterCfg)),
      suggestedConfigPatch: {
        orientationDeg: masterCfg.orientationDeg,
        layoutPreset: masterCfg.layoutPreset,
        voidDecksEnabled: masterCfg.voidDecksEnabled,
        shading: masterCfg.shading,
        greeneryPreset: masterCfg.greeneryPreset,
        customBlockOverride: null,
      },
    });
  }

  return {
    headlineDiagnosis:
      utciDelta < -0.1
        ? `Proposal lowers estate-wide mean UTCI by ${Math.abs(utciDelta).toFixed(2)}°C (P95 hotspot ${p95Delta >= 0 ? '+' : ''}${p95Delta.toFixed(2)}°C) and changes Strong Heat Stress area (>32°C) by ${stressDelta >= 0 ? '+' : ''}${stressDelta}%.`
        : `Current proposal shows a ${utciDelta >= 0 ? '+' : ''}${utciDelta.toFixed(2)}°C mean UTCI shift against Baseline; ${hottestProbe.label} remains the primary thermal hotspot at ${hottestProbe.utci.toFixed(1)}°C UTCI.`,
    spatialFindings: [
      `Spine Walkway UTCI changed by ${walkwayDelta >= 0 ? '+' : ''}${walkwayDelta}°C (MRT: ${walkwayProbeProp?.mrt.toFixed(1)}°C, Wind: ${walkwayProbeProp?.windSpeed.toFixed(2)} m/s).`,
      `Hottest activity zone is ${hottestProbe.label} at ${hottestProbe.utci.toFixed(1)}°C UTCI (MRT ${hottestProbe.mrt.toFixed(1)}°C, Sky View Factor ${hottestProbe.skyViewFactor}).`,
      `Coolest zone is ${coolestProbe.label} at ${coolestProbe.utci.toFixed(1)}°C UTCI with ${coolestProbe.windSpeed.toFixed(2)} m/s airflow.`,
    ],
    modelScopeNote:
      'Background air temperature (' +
      proposal.weatherMeta.airTempC +
      '°C) and relative humidity (' +
      proposal.weatherMeta.relativeHumidityPct +
      '%) are held constant between Baseline and Proposal; deltas reflect modelled changes in SOLWEIG Mean Radiant Temperature and URock pedestrian airflow.',
    recommendations: recommendations.slice(0, 2),
    generatedBy: 'Physics-Grounded Diagnostic Engine',
  };
}

async function startServer() {
  seedInitialScenarioCache();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // 1. Get cache index + initial Baseline and Milestone 1 results
  app.get('/api/scenarios/bootstrap', (_req, res) => {
    const baselineHash = computeScenarioHash(BASELINE_SCENARIO_CONFIG);
    const milestone1Hash = computeScenarioHash(MILESTONE_1_SHADE_CONFIG);

    const baseline =
      scenarioCache.get(baselineHash) ||
      runMicroclimateSimulation(BASELINE_SCENARIO_CONFIG, true);
    const milestone1 =
      scenarioCache.get(milestone1Hash) ||
      runMicroclimateSimulation(MILESTONE_1_SHADE_CONFIG, true);

    scenarioCache.set(baselineHash, baseline);
    scenarioCache.set(milestone1Hash, milestone1);

    const cachedHashes = Array.from(scenarioCache.keys());

    res.json({
      baseline,
      initialProposal: milestone1,
      cachedHashes,
      cacheCount: scenarioCache.size,
    });
  });

  // 2. Evaluate or retrieve a scenario from cache
  app.post('/api/scenarios/evaluate', (req, res) => {
    try {
      const { config, forceRecalculate } = req.body as {
        config: ScenarioConfig;
        forceRecalculate?: boolean;
      };

      if (!config) {
        res.status(400).json({ error: 'Missing ScenarioConfig in request body' });
        return;
      }

      const hash = computeScenarioHash(config);

      if (!forceRecalculate && scenarioCache.has(hash)) {
        const cachedResult = scenarioCache.get(hash)!;
        res.json({
          result: { ...cachedResult, cached: true },
          cachedHashes: Array.from(scenarioCache.keys()),
          cacheHit: true,
        });
        return;
      }

      // Run live 2.5D SOLWEIG + URock + PET/UTCI calculation
      const freshResult = runMicroclimateSimulation(config, false);
      scenarioCache.set(hash, freshResult);

      res.json({
        result: freshResult,
        cachedHashes: Array.from(scenarioCache.keys()),
        cacheHit: false,
      });
    } catch (err) {
      console.error('Error evaluating scenario:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to run microclimate simulation',
      });
    }
  });

  // 3. Focused AI Design Advisor (Server-side @google/genai)
  app.post('/api/ai/advise', async (req, res) => {
    const { baseline, proposal } = req.body as {
      baseline: SimulationResult;
      proposal: SimulationResult;
    };

    if (!baseline || !proposal) {
      res.status(400).json({ error: 'Both baseline and proposal results are required.' });
      return;
    }

    const fallbackAdvice = buildDeterministicAdvisorFallback(baseline, proposal);
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.json(fallbackAdvice);
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const probeSummary = proposal.probes.map((p) => {
        const bProbe = baseline.probes.find((bp) => bp.id === p.id);
        return {
          zone: p.label,
          baselineUtci: bProbe?.utci,
          proposalUtci: p.utci,
          deltaUtci: bProbe ? Number((p.utci - bProbe.utci).toFixed(2)) : 0,
          proposalMrt: p.mrt,
          proposalWindMs: p.windSpeed,
          shaded: p.shaded,
        };
      });

      const promptText = `You are a quantitative urban microclimate analyst embedded in the SolWeig-URock Decision Platform.
Analyze the following actual calculated comparison between the Baseline Estate and the active Proposal on a 48x48 pedestrian grid (z=1.5m), and recommend 2 concrete next design comparisons.

IMPORTANT SCIENTIFIC CONSTRAINTS:
1. Background air temperature (${proposal.weatherMeta.airTempC}°C) and relative humidity (${proposal.weatherMeta.relativeHumidityPct}%) are held constant between designs. Do NOT claim evapotranspiration changes air temperature or humidity.
2. Total Gross Floor Area (GFA) is conserved at 42,000 m² across all layouts.
3. Refer strictly to the actual numbers below:
- Baseline Config: ${JSON.stringify(baseline.config)}
- Proposal Config: ${JSON.stringify(proposal.config)}
- Baseline Stats: Mean UTCI=${baseline.stats.utciMean}°C, P50=${baseline.stats.utciMedianP50}°C, P90=${baseline.stats.utciP90}°C, P95 Hotspot=${baseline.stats.utciHotspotP95}°C, Mean MRT=${baseline.stats.mrtMean}°C, Mean Wind=${baseline.stats.windMean} m/s, Shade=${baseline.stats.shadeCoveragePct}%, Area >32°C UTCI=${baseline.stats.areaAbove32UtciPct}%
- Proposal Stats: Mean UTCI=${proposal.stats.utciMean}°C, P50=${proposal.stats.utciMedianP50}°C, P90=${proposal.stats.utciP90}°C, P95 Hotspot=${proposal.stats.utciHotspotP95}°C, Mean MRT=${proposal.stats.mrtMean}°C, Mean Wind=${proposal.stats.windMean} m/s, Shade=${proposal.stats.shadeCoveragePct}%, Area >32°C UTCI=${proposal.stats.areaAbove32UtciPct}%
- Activity Zone Probes: ${JSON.stringify(probeSummary)}

Valid parameter values for recommendations:
- orientationDeg: 0, 15, 30, or 45
- layoutPreset: "baseline-parallel", "staggered-courtyard", "wind-corridor", or "void-deck-cluster"
- voidDecksEnabled: true or false
- greeneryPreset: "none", "sparse-palms", "courtyard-raintrees", or "dense-canopy-avenue"
- walkwayCanopy: true or false
- playgroundShadeSails: true or false
- courtyardPergola: true or false`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptText,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headlineDiagnosis: {
                type: Type.STRING,
                description:
                  '1-2 concise sentences summarizing the primary comfort change and remaining hotspot with exact numbers.',
              },
              spatialFindings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 bullet points citing specific zone probes, MRT, wind, or P90/P95 metrics.',
              },
              modelScopeNote: {
                type: Type.STRING,
                description:
                  '1 sentence reminding that background Ta and RH are held constant while MRT and wind vary.',
              },
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    expectedImpact: { type: Type.STRING },
                    orientationDeg: { type: Type.INTEGER },
                    layoutPreset: { type: Type.STRING },
                    voidDecksEnabled: { type: Type.BOOLEAN },
                    walkwayCanopy: { type: Type.BOOLEAN },
                    playgroundShadeSails: { type: Type.BOOLEAN },
                    courtyardPergola: { type: Type.BOOLEAN },
                    greeneryPreset: { type: Type.STRING },
                  },
                  required: [
                    'title',
                    'rationale',
                    'expectedImpact',
                    'orientationDeg',
                    'layoutPreset',
                    'voidDecksEnabled',
                    'walkwayCanopy',
                    'playgroundShadeSails',
                    'courtyardPergola',
                    'greeneryPreset',
                  ],
                },
              },
            },
            required: ['headlineDiagnosis', 'spatialFindings', 'modelScopeNote', 'recommendations'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText);

      const mappedRecommendations: AIAdvisorResponse['recommendations'] = (
        parsed.recommendations || []
      )
        .slice(0, 2)
        .map((rec: Record<string, unknown>) => {
          const validOrientations = [0, 15, 30, 45];
          const ori = validOrientations.includes(Number(rec.orientationDeg))
            ? (Number(rec.orientationDeg) as 0 | 15 | 30 | 45)
            : proposal.config.orientationDeg;

          const validLayouts = [
            'baseline-parallel',
            'staggered-courtyard',
            'wind-corridor',
            'void-deck-cluster',
          ];
          const lay = validLayouts.includes(String(rec.layoutPreset))
            ? (String(rec.layoutPreset) as ScenarioConfig['layoutPreset'])
            : proposal.config.layoutPreset;

          const validGreenery = [
            'none',
            'sparse-palms',
            'courtyard-raintrees',
            'dense-canopy-avenue',
          ];
          const gr = validGreenery.includes(String(rec.greeneryPreset))
            ? (String(rec.greeneryPreset) as ScenarioConfig['greeneryPreset'])
            : proposal.config.greeneryPreset;

          const candidateConfig: ScenarioConfig = {
            ...proposal.config,
            orientationDeg: ori,
            layoutPreset: lay,
            voidDecksEnabled: Boolean(rec.voidDecksEnabled),
            shading: {
              walkwayCanopy: Boolean(rec.walkwayCanopy),
              playgroundShadeSails: Boolean(rec.playgroundShadeSails),
              courtyardPergola: Boolean(rec.courtyardPergola),
            },
            greeneryPreset: gr,
            customBlockOverride: null,
          };

          const isCached = scenarioCache.has(computeScenarioHash(candidateConfig));

          return {
            title: String(rec.title || 'Test Alternative Intervention'),
            rationale: String(rec.rationale || ''),
            expectedImpact: String(rec.expectedImpact || ''),
            isPrecomputedInCache: isCached,
            suggestedConfigPatch: {
              orientationDeg: candidateConfig.orientationDeg,
              layoutPreset: candidateConfig.layoutPreset,
              voidDecksEnabled: candidateConfig.voidDecksEnabled,
              shading: candidateConfig.shading,
              greeneryPreset: candidateConfig.greeneryPreset,
              customBlockOverride: null,
            },
          };
        });

      const finalResponse: AIAdvisorResponse = {
        headlineDiagnosis: parsed.headlineDiagnosis || fallbackAdvice.headlineDiagnosis,
        spatialFindings:
          Array.isArray(parsed.spatialFindings) && parsed.spatialFindings.length > 0
            ? parsed.spatialFindings
            : fallbackAdvice.spatialFindings,
        modelScopeNote: parsed.modelScopeNote || fallbackAdvice.modelScopeNote,
        recommendations:
          mappedRecommendations.length > 0
            ? mappedRecommendations
            : fallbackAdvice.recommendations,
        generatedBy: 'Gemini 3.8 Flash · Grounded in SOLWEIG+URock Grid',
      };

      res.json(finalResponse);
    } catch (error) {
      console.warn('Gemini advisor fallback triggered:', error);
      res.json(fallbackAdvice);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SolWeig-URock Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
