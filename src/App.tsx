import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AIAdvisorResponse,
  BASELINE_SCENARIO_CONFIG,
  ComparisonMode,
  computeScenarioHash,
  CURATED_PRESET_SCENARIOS,
  MapLayerType,
  MILESTONE_1_SHADE_CONFIG,
  ScenarioConfig,
  SimulationResult,
  TimeOfDayId,
  WeatherScenarioId,
} from './types/microclimate';
import { runMicroclimateSimulation } from './engine/physicsSolver';
import { DesignControlsPanel } from './components/DesignControlsPanel';
import { EstateViewport3D } from './components/EstateViewport3D';
import { DecisionResultsPanel } from './components/DecisionResultsPanel';
import { BottomWeatherStatusBar } from './components/BottomWeatherStatusBar';
import { PhysicsScopeModal } from './components/PhysicsScopeModal';

export default function App() {
  // Client-side mirror of the Scenario Cache for 0ms instant switching
  const localCacheRef = useRef<Map<string, SimulationResult>>(new Map());

  const [cachedHashes, setCachedHashes] = useState<Set<string>>(() => {
    const initialSet = new Set<string>();
    for (const preset of CURATED_PRESET_SCENARIOS) {
      const res = runMicroclimateSimulation(preset.config, true);
      localCacheRef.current.set(res.scenarioHash, res);
      initialSet.add(res.scenarioHash);
    }
    return initialSet;
  });

  const [config, setConfig] = useState<ScenarioConfig>(MILESTONE_1_SHADE_CONFIG);

  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(() => {
    const baseHash = computeScenarioHash(BASELINE_SCENARIO_CONFIG);
    return (
      localCacheRef.current.get(baseHash) ||
      runMicroclimateSimulation(BASELINE_SCENARIO_CONFIG, true)
    );
  });

  const [proposalResult, setProposalResult] = useState<SimulationResult | null>(() => {
    const propHash = computeScenarioHash(MILESTONE_1_SHADE_CONFIG);
    return (
      localCacheRef.current.get(propHash) ||
      runMicroclimateSimulation(MILESTONE_1_SHADE_CONFIG, true)
    );
  });

  const [isAssessmentPending, setIsAssessmentPending] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [lastWasCacheHit, setLastWasCacheHit] = useState<boolean>(true);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('utci');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('proposal');
  const [selectedProbeId, setSelectedProbeId] = useState<string>('PROBE-WALKWAY');

  const [aiAdvice, setAiAdvice] = useState<AIAdvisorResponse | null>(null);
  const [isLoadingAiAdvice, setIsLoadingAiAdvice] = useState<boolean>(false);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<'scope' | 'architecture' | 'benchmark'>('scope');

  // Fetch AI Advisor analysis whenever Baseline or Proposal simulation result updates
  const fetchAiAdvisor = useCallback(
    async (baseRes: SimulationResult, propRes: SimulationResult) => {
      setIsLoadingAiAdvice(true);
      try {
        const res = await fetch('/api/ai/advise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseline: baseRes, proposal: propRes }),
        });
        if (res.ok) {
          const data: AIAdvisorResponse = await res.json();
          setAiAdvice(data);
        }
      } catch (err) {
        console.warn('AI Advisor request error:', err);
      } finally {
        setIsLoadingAiAdvice(false);
      }
    },
    []
  );

  // Bootstrap from server cache on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/scenarios/bootstrap');
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data.baseline && data.initialProposal) {
          localCacheRef.current.set(data.baseline.scenarioHash, data.baseline);
          localCacheRef.current.set(
            data.initialProposal.scenarioHash,
            data.initialProposal
          );
          setBaselineResult(data.baseline);
          setProposalResult(data.initialProposal);
          if (Array.isArray(data.cachedHashes)) {
            setCachedHashes((prev) => {
              const merged = new Set(prev);
              data.cachedHashes.forEach((h: string) => merged.add(h));
              return merged;
            });
          }
          fetchAiAdvisor(data.baseline, data.initialProposal);
        }
      } catch {
        // Fallback to already-initialized local physics cache
        if (baselineResult && proposalResult) {
          fetchAiAdvisor(baselineResult, proposalResult);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchAiAdvisor]);

  // Execute Speed 2 Modelled Assessment (either from server cache or live solver)
  const executeAssessmentForConfig = useCallback(
    async (targetConfig: ScenarioConfig, forceRecalculate = false) => {
      const hash = computeScenarioHash(targetConfig);

      if (!forceRecalculate && localCacheRef.current.has(hash)) {
        const cached = localCacheRef.current.get(hash)!;
        setProposalResult({ ...cached, cached: true });
        setIsAssessmentPending(false);
        setLastWasCacheHit(true);
        if (baselineResult) {
          fetchAiAdvisor(baselineResult, cached);
        }
        return;
      }

      setIsSimulating(true);
      try {
        const response = await fetch('/api/scenarios/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: targetConfig, forceRecalculate }),
        });

        if (response.ok) {
          const data = await response.json();
          const result: SimulationResult = data.result;
          localCacheRef.current.set(result.scenarioHash, result);
          setCachedHashes((prev) => {
            const next = new Set(prev);
            next.add(result.scenarioHash);
            if (Array.isArray(data.cachedHashes)) {
              data.cachedHashes.forEach((h: string) => next.add(h));
            }
            return next;
          });
          setProposalResult(result);
          setIsAssessmentPending(false);
          setLastWasCacheHit(Boolean(data.cacheHit));
          if (baselineResult) {
            fetchAiAdvisor(baselineResult, result);
          }
          return;
        }
      } catch (err) {
        console.warn('Backend evaluate fallback to local solver:', err);
      } finally {
        setIsSimulating(false);
      }

      // Deterministic local solver fallback
      const computed = runMicroclimateSimulation(targetConfig, false);
      localCacheRef.current.set(computed.scenarioHash, computed);
      setCachedHashes((prev) => new Set(prev).add(computed.scenarioHash));
      setProposalResult(computed);
      setIsAssessmentPending(false);
      setLastWasCacheHit(false);
      if (baselineResult) {
        fetchAiAdvisor(baselineResult, computed);
      }
    },
    [baselineResult, fetchAiAdvisor]
  );

  // Two-Speed Handler when user changes design controls:
  // - If scenario is already in cache -> update comfort maps immediately from cache!
  // - If scenario is uncalculated -> update 3D geometry & shadows immediately (Speed 1) and mark comfort map as Pending Assessment!
  const handleUpdateConfig = useCallback(
    (nextConfig: ScenarioConfig) => {
      setConfig(nextConfig);
      const nextHash = computeScenarioHash(nextConfig);

      if (localCacheRef.current.has(nextHash)) {
        const cached = localCacheRef.current.get(nextHash)!;
        setProposalResult({ ...cached, cached: true });
        setIsAssessmentPending(false);
        setLastWasCacheHit(true);
        if (baselineResult) {
          fetchAiAdvisor(baselineResult, cached);
        }
      } else if (cachedHashes.has(nextHash)) {
        // Retrieve from server cache immediately
        executeAssessmentForConfig(nextConfig, false);
      } else {
        // Uncalculated arrangement: show geometry + shadows immediately, mark comfort results as pending!
        setIsAssessmentPending(true);
        setLastWasCacheHit(false);
      }
    },
    [baselineResult, cachedHashes, executeAssessmentForConfig, fetchAiAdvisor]
  );

  // Direct 3D Block Move / Rotate handler:
  // Always demonstrates Speed 1 (Geometry + Shadows update immediately) -> Speed 2 (Pending Assessment until calculated)
  const handleUpdateCustomBlock = useCallback(
    (
      blockId: string,
      offsetX: number,
      offsetZ: number,
      extraRotationDeg: number
    ) => {
      const isZero =
        Math.abs(offsetX) < 0.1 &&
        Math.abs(offsetZ) < 0.1 &&
        Math.abs(extraRotationDeg) < 0.1;

      const nextConfig: ScenarioConfig = {
        ...config,
        customBlockOverride: isZero
          ? null
          : {
              blockId,
              offsetX,
              offsetZ,
              extraRotationDeg,
            },
      };
      handleUpdateConfig(nextConfig);
    },
    [config, handleUpdateConfig]
  );

  const handleResetCustomBlock = useCallback(() => {
    handleUpdateConfig({
      ...config,
      customBlockOverride: null,
    });
  }, [config, handleUpdateConfig]);

  // Weather or Solar Time switch: keep Baseline and Proposal under the same background weather & time!
  const handleUpdateWeatherOrTime = useCallback(
    (weatherScenario: WeatherScenarioId, timeOfDay: TimeOfDayId) => {
      const nextProposalConfig: ScenarioConfig = {
        ...config,
        weatherScenario,
        timeOfDay,
      };
      const nextBaselineConfig: ScenarioConfig = {
        ...(baselineResult?.config || BASELINE_SCENARIO_CONFIG),
        weatherScenario,
        timeOfDay,
      };

      const baseHash = computeScenarioHash(nextBaselineConfig);
      const nextBaseResult =
        localCacheRef.current.get(baseHash) ||
        runMicroclimateSimulation(nextBaselineConfig, true);
      localCacheRef.current.set(baseHash, nextBaseResult);
      setBaselineResult(nextBaseResult);

      setConfig(nextProposalConfig);
      const propHash = computeScenarioHash(nextProposalConfig);
      if (localCacheRef.current.has(propHash)) {
        const cachedProp = localCacheRef.current.get(propHash)!;
        setProposalResult(cachedProp);
        setIsAssessmentPending(false);
        setLastWasCacheHit(true);
        fetchAiAdvisor(nextBaseResult, cachedProp);
      } else {
        executeAssessmentForConfig(nextProposalConfig, false);
      }
    },
    [baselineResult, config, executeAssessmentForConfig, fetchAiAdvisor]
  );

  // Apply AI Advisor Recommendation ("Test this option")
  const handleApplyRecommendation = useCallback(
    (patch: Partial<ScenarioConfig>) => {
      const nextConfig: ScenarioConfig = {
        ...config,
        ...patch,
        shading: patch.shading ? { ...patch.shading } : config.shading,
      };
      setConfig(nextConfig);
      // Automatically run or fetch from cache when user clicks "Test this option"
      executeAssessmentForConfig(nextConfig, false);
    },
    [config, executeAssessmentForConfig]
  );

  const handlePinCurrentAsBaseline = useCallback(() => {
    if (!proposalResult || isAssessmentPending) return;
    setBaselineResult(proposalResult);
    fetchAiAdvisor(proposalResult, proposalResult);
  }, [proposalResult, isAssessmentPending, fetchAiAdvisor]);

  const handleExportCsv = useCallback(() => {
    if (!baselineResult || !proposalResult) return;
    const rows = [
      [
        'Probe ID',
        'Activity Zone',
        'X (m)',
        'Z (m)',
        'Baseline UTCI (C)',
        'Proposal UTCI (C)',
        'Delta UTCI (C)',
        'Baseline PET (C)',
        'Proposal PET (C)',
        'Baseline MRT (C)',
        'Proposal MRT (C)',
        'Baseline Wind (m/s)',
        'Proposal Wind (m/s)',
        'Sky View Factor',
      ].join(','),
    ];

    proposalResult.probes.forEach((p) => {
      const b = baselineResult.probes.find((bp) => bp.id === p.id) || p;
      rows.push(
        [
          p.id,
          `"${p.label}"`,
          p.x.toFixed(1),
          p.z.toFixed(1),
          b.utci.toFixed(2),
          p.utci.toFixed(2),
          (p.utci - b.utci).toFixed(2),
          b.pet.toFixed(2),
          p.pet.toFixed(2),
          b.mrt.toFixed(1),
          p.mrt.toFixed(1),
          b.windSpeed.toFixed(2),
          p.windSpeed.toFixed(2),
          p.skyViewFactor.toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solweig_urock_comparison_${config.weatherScenario}_${config.timeOfDay.replace(':', '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [baselineResult, proposalResult, config.weatherScenario, config.timeOfDay]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0F17] text-slate-100 overflow-hidden">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3 bg-[#111827] border-b border-slate-800 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleUpdateConfig(MILESTONE_1_SHADE_CONFIG);
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          SolWeig-URock Studio
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <a
            href="#scope"
            onClick={(e) => {
              e.preventDefault();
              setModalTab('scope');
              setModalOpen(true);
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Scope & Physics
          </a>
          <a
            href="#architecture"
            onClick={(e) => {
              e.preventDefault();
              setModalTab('architecture');
              setModalOpen(true);
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Two-Speed Architecture
          </a>
          <a
            href="#benchmark"
            onClick={(e) => {
              e.preventDefault();
              setModalTab('benchmark');
              setModalOpen(true);
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Benchmark & Cache
          </a>
          <a
            href="#export"
            onClick={(e) => {
              e.preventDefault();
              handleExportCsv();
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Export Probe CSV
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => executeAssessmentForConfig(config, false)}
            disabled={isSimulating}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isSimulating
              ? 'Calculating...'
              : isAssessmentPending
                ? 'Calculate Pending Geometry'
                : 'Run Modelled Assessment'}
          </button>
        </div>
      </header>

      {/* Main Decision Workspace: Left Controls | Centre 3D Estate + Heatmap | Right Baseline vs Proposal */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <DesignControlsPanel
          config={config}
          cachedHashes={cachedHashes}
          isAssessmentPending={isAssessmentPending}
          isSimulating={isSimulating}
          onUpdateConfig={handleUpdateConfig}
          onRunAssessment={() => executeAssessmentForConfig(config, false)}
          onPinCurrentAsBaseline={handlePinCurrentAsBaseline}
        />

        <div className="flex-1 min-w-0 h-full relative">
          <EstateViewport3D
            config={config}
            baselineResult={baselineResult}
            proposalResult={proposalResult}
            isAssessmentPending={isAssessmentPending}
            isSimulating={isSimulating}
            activeLayer={activeLayer}
            comparisonMode={comparisonMode}
            selectedProbeId={selectedProbeId}
            onSelectProbe={setSelectedProbeId}
            onChangeLayer={setActiveLayer}
            onChangeComparisonMode={setComparisonMode}
            onRunAssessment={() => executeAssessmentForConfig(config, false)}
            onUpdateCustomBlock={handleUpdateCustomBlock}
            onResetCustomBlock={handleResetCustomBlock}
          />
        </div>

        <DecisionResultsPanel
          baselineResult={baselineResult}
          proposalResult={proposalResult}
          isAssessmentPending={isAssessmentPending}
          selectedProbeId={selectedProbeId}
          onSelectProbe={setSelectedProbeId}
          aiAdvice={aiAdvice}
          isLoadingAiAdvice={isLoadingAiAdvice}
          onRefreshAiAdvice={() => {
            if (baselineResult && proposalResult) {
              fetchAiAdvisor(baselineResult, proposalResult);
            }
          }}
          onApplyRecommendation={handleApplyRecommendation}
        />
      </main>

      {/* Bottom Weather, Solar Time & Explicit Analysis Status Bar */}
      <BottomWeatherStatusBar
        config={config}
        proposalResult={proposalResult}
        isAssessmentPending={isAssessmentPending}
        isSimulating={isSimulating}
        lastWasCacheHit={lastWasCacheHit}
        onUpdateWeather={(wx) => handleUpdateWeatherOrTime(wx, config.timeOfDay)}
        onUpdateTime={(tm) => handleUpdateWeatherOrTime(config.weatherScenario, tm)}
        onRunAssessment={() => executeAssessmentForConfig(config, false)}
      />

      {/* Physics Scope, Architecture & Benchmark Modal */}
      <PhysicsScopeModal
        isOpen={modalOpen}
        activeTab={modalTab}
        onClose={() => setModalOpen(false)}
        onChangeTab={setModalTab}
        baselineResult={baselineResult}
        proposalResult={proposalResult}
        cachedCount={cachedHashes.size}
      />
    </div>
  );
}
