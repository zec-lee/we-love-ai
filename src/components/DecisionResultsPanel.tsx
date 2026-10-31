import React from 'react';
import {
  AIAdvisorResponse,
  ScenarioConfig,
  SimulationResult,
} from '../types/microclimate';
import { classifyUtciThermalStress } from '../utils/colorScales';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  CheckCircle2,
  FlaskConical,
  MapPin,
  RefreshCw,
} from 'lucide-react';

interface DecisionResultsPanelProps {
  baselineResult: SimulationResult | null;
  proposalResult: SimulationResult | null;
  isAssessmentPending: boolean;
  selectedProbeId: string;
  onSelectProbe: (probeId: string) => void;
  aiAdvice: AIAdvisorResponse | null;
  isLoadingAiAdvice: boolean;
  onRefreshAiAdvice: () => void;
  onApplyRecommendation: (patch: Partial<ScenarioConfig>) => void;
}

export const DecisionResultsPanel: React.FC<DecisionResultsPanelProps> = ({
  baselineResult,
  proposalResult,
  isAssessmentPending,
  selectedProbeId,
  onSelectProbe,
  aiAdvice,
  isLoadingAiAdvice,
  onRefreshAiAdvice,
  onApplyRecommendation,
}) => {
  if (!baselineResult || !proposalResult) {
    return (
      <aside className="w-96 shrink-0 bg-[#111827] border-l border-slate-800 p-4 flex items-center justify-center text-xs text-slate-400">
        Loading baseline and proposal spatial grids...
      </aside>
    );
  }

  const baseStats = baselineResult.stats;
  const propStats = proposalResult.stats;

  const formatDelta = (
    propVal: number,
    baseVal: number,
    unit: string,
    lowerIsBetter = true
  ) => {
    const diff = Number((propVal - baseVal).toFixed(2));
    if (Math.abs(diff) < 0.01) {
      return <span className="text-slate-400 font-mono">0.0{unit}</span>;
    }
    const isGood = lowerIsBetter ? diff < 0 : diff > 0;
    const sign = diff > 0 ? '+' : '';
    return (
      <span
        className={`inline-flex items-center gap-0.5 font-mono font-semibold ${
          isGood ? 'text-emerald-400' : 'text-amber-400'
        }`}
      >
        {diff < 0 ? (
          <ArrowDownRight className="w-3.5 h-3.5" />
        ) : (
          <ArrowUpRight className="w-3.5 h-3.5" />
        )}
        {sign}
        {diff.toFixed(1)}
        {unit}
      </span>
    );
  };

  const selectedProbeProp =
    proposalResult.probes.find((p) => p.id === selectedProbeId) ||
    proposalResult.probes[0];
  const selectedProbeBase =
    baselineResult.probes.find((p) => p.id === selectedProbeProp.id) ||
    baselineResult.probes[0];

  const stressClass = classifyUtciThermalStress(propStats.utciHotspotP95);

  return (
    <aside className="w-96 xl:w-[410px] shrink-0 bg-[#111827] border-l border-slate-800 flex flex-col h-full overflow-y-auto">
      {/* Header: Baseline vs Proposal Comparison Status */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Baseline vs. Proposal Assessment
          </h2>
          <span className="text-xs font-mono text-slate-400">
            z = 1.5m · 48×48 Grid
          </span>
        </div>

        <div className="mt-2 space-y-1 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>Baseline:</span>
            <span className="text-slate-200 font-medium truncate max-w-[240px]">
              {baselineResult.scenarioLabel}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>Proposal:</span>
            <span className="text-cyan-300 font-medium truncate max-w-[240px]">
              {proposalResult.scenarioLabel}
            </span>
          </div>
        </div>

        {isAssessmentPending && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/50 flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Showing last calculated result. Run assessment to update for edited geometry.
            </span>
          </div>
        )}
      </div>

      {/* Section 1: Spatial Percentiles & Hotspot Distribution (Not Just Means!) */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">
            01. Spatial UTCI & PET Distribution
          </h3>
          <span className={`text-[11px] font-mono ${stressClass.toneClass}`}>
            P95: {stressClass.category}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Spatial percentiles prevent estate-wide averages from hiding local hotspots.
        </p>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {/* P50 Median */}
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] text-slate-400">Median (P50)</div>
            <div className="text-lg font-mono font-bold text-white mt-0.5">
              {propStats.utciMedianP50.toFixed(1)}
              <span className="text-xs font-normal text-slate-400 ml-0.5">°C</span>
            </div>
            <div className="text-[11px] mt-1 flex items-center justify-between">
              <span className="text-slate-500 font-mono">
                Base {baseStats.utciMedianP50.toFixed(1)}°
              </span>
              {formatDelta(propStats.utciMedianP50, baseStats.utciMedianP50, '°', true)}
            </div>
          </div>

          {/* P90 Upper Decile */}
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] text-slate-400">90th %ile (P90)</div>
            <div className="text-lg font-mono font-bold text-white mt-0.5">
              {propStats.utciP90.toFixed(1)}
              <span className="text-xs font-normal text-slate-400 ml-0.5">°C</span>
            </div>
            <div className="text-[11px] mt-1 flex items-center justify-between">
              <span className="text-slate-500 font-mono">
                Base {baseStats.utciP90.toFixed(1)}°
              </span>
              {formatDelta(propStats.utciP90, baseStats.utciP90, '°', true)}
            </div>
          </div>

          {/* P95 Hotspot */}
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] text-slate-400">Hotspot (P95)</div>
            <div className="text-lg font-mono font-bold text-white mt-0.5">
              {propStats.utciHotspotP95.toFixed(1)}
              <span className="text-xs font-normal text-slate-400 ml-0.5">°C</span>
            </div>
            <div className="text-[11px] mt-1 flex items-center justify-between">
              <span className="text-slate-500 font-mono">
                Base {baseStats.utciHotspotP95.toFixed(1)}°
              </span>
              {formatDelta(
                propStats.utciHotspotP95,
                baseStats.utciHotspotP95,
                '°',
                true
              )}
            </div>
          </div>
        </div>

        {/* Secondary Row: PET, MRT, Wind, and Shade Coverage */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">Mean PET / P90</div>
              <div className="text-sm font-mono font-semibold text-white mt-0.5">
                {propStats.petMean.toFixed(1)}° / {propStats.petP90.toFixed(1)}°C
              </div>
            </div>
            <div className="text-right text-xs">
              {formatDelta(propStats.petMean, baseStats.petMean, '°C', true)}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">Mean MRT (SOLWEIG)</div>
              <div className="text-sm font-mono font-semibold text-white mt-0.5">
                {propStats.mrtMean.toFixed(1)}°C
              </div>
            </div>
            <div className="text-right text-xs">
              {formatDelta(propStats.mrtMean, baseStats.mrtMean, '°C', true)}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">Mean Wind (URock)</div>
              <div className="text-sm font-mono font-semibold text-white mt-0.5">
                {propStats.windMean.toFixed(2)} m/s
              </div>
            </div>
            <div className="text-right text-xs">
              {formatDelta(propStats.windMean, baseStats.windMean, ' m/s', false)}
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">Pedestrian Shade</div>
              <div className="text-sm font-mono font-semibold text-white mt-0.5">
                {propStats.shadeCoveragePct.toFixed(1)}%
              </div>
            </div>
            <div className="text-right text-xs">
              {formatDelta(
                propStats.shadeCoveragePct,
                baseStats.shadeCoveragePct,
                '%',
                false
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Area Above Thermal Stress Thresholds */}
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-xs font-semibold text-white">
          02. Walkable Area Above Stress Threshold
        </h3>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Percentage of walkable estate grid exceeding UTCI heat stress thresholds.
        </p>

        <div className="mt-3 space-y-3">
          {/* Strong Heat Stress (> 32°C UTCI) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300">UTCI &gt; 32°C (Strong Heat Stress)</span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400">
                  Base {baseStats.areaAbove32UtciPct}%
                </span>
                <span className="text-white font-semibold">
                  → {propStats.areaAbove32UtciPct}%
                </span>
                {formatDelta(
                  propStats.areaAbove32UtciPct,
                  baseStats.areaAbove32UtciPct,
                  '%',
                  true
                )}
              </div>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${Math.min(100, propStats.areaAbove32UtciPct)}%` }}
              />
            </div>
          </div>

          {/* Very Strong Heat Stress (> 38°C UTCI) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-300">
                UTCI &gt; 38°C (Very Strong Stress)
              </span>
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400">
                  Base {baseStats.areaAbove38UtciPct}%
                </span>
                <span className="text-white font-semibold">
                  → {propStats.areaAbove38UtciPct}%
                </span>
                {formatDelta(
                  propStats.areaAbove38UtciPct,
                  baseStats.areaAbove38UtciPct,
                  '%',
                  true
                )}
              </div>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{ width: `${Math.min(100, propStats.areaAbove38UtciPct)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: UTCI & PET at Designated Activity Spaces (5 Point Probes) */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">
            03. Designated Activity Zone Probes
          </h3>
          <span className="text-[11px] text-slate-400">Click row to inspect in 3D</span>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {proposalResult.probes.map((probe) => {
            const bProbe =
              baselineResult.probes.find((bp) => bp.id === probe.id) || probe;
            const isSelected = probe.id === selectedProbeId;
            return (
              <button
                key={probe.id}
                onClick={() => onSelectProbe(probe.id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/60 text-white'
                    : 'bg-slate-900/60 border-slate-800/90 text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <MapPin
                      className={`w-3.5 h-3.5 ${
                        isSelected ? 'text-cyan-400' : 'text-slate-500'
                      }`}
                    />
                    <span className="text-xs font-semibold">{probe.label}</span>
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-slate-400 mr-1.5">
                      UTCI {probe.utci.toFixed(1)}°C
                    </span>
                    {formatDelta(probe.utci, bProbe.utci, '°C', true)}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-1.5 pt-1.5 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
                  <div>
                    PET: <span className="text-slate-200">{probe.pet.toFixed(1)}°C</span>
                  </div>
                  <div>
                    MRT: <span className="text-slate-200">{probe.mrt.toFixed(1)}°C</span>
                  </div>
                  <div>
                    Wind:{' '}
                    <span className="text-slate-200">{probe.windSpeed.toFixed(2)}m/s</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Probe Detailed Breakdown */}
        {selectedProbeProp && selectedProbeBase && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
            <span>
              <strong>{selectedProbeProp.label}:</strong> SVF{' '}
              <span className="font-mono">{selectedProbeProp.skyViewFactor}</span> ·{' '}
              {selectedProbeProp.shaded ? 'Direct Beam Shaded' : 'Direct Sun Exposed'}
            </span>
            <span className="font-mono text-cyan-400">
              ΔMRT {(selectedProbeProp.mrt - selectedProbeBase.mrt).toFixed(1)}°C
            </span>
          </div>
        )}
      </div>

      {/* Section 4: Grounded AI Microclimate Advisor */}
      <div className="p-4 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BrainCircuit className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-semibold text-white">
              04. Grounded AI Comparison Advisor
            </h3>
          </div>
          <button
            onClick={onRefreshAiAdvice}
            disabled={isLoadingAiAdvice}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
          >
            <RefreshCw
              className={`w-3 h-3 ${isLoadingAiAdvice ? 'animate-spin text-cyan-400' : ''}`}
            />
            <span>{isLoadingAiAdvice ? 'Analyzing...' : 'Analyze Grid'}</span>
          </button>
        </div>

        {aiAdvice ? (
          <div className="mt-2.5 space-y-3">
            <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800">
              <p className="text-xs text-slate-100 font-medium leading-relaxed">
                {aiAdvice.headlineDiagnosis}
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                {aiAdvice.spatialFindings.map((finding, idx) => (
                  <li key={idx} className="leading-snug">
                    {finding}
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
                {aiAdvice.modelScopeNote}
              </div>
            </div>

            {/* Suggested Next Comparisons with Explicit Cache / Proposal Label & "Test This Option" Button */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recommended Next Comparisons
              </div>
              {aiAdvice.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-white">
                      {rec.title}
                    </span>
                    <span
                      className={`text-[10px] font-mono shrink-0 ${
                        rec.isPrecomputedInCache
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {rec.isPrecomputedInCache
                        ? 'Cached Result'
                        : 'Untested Proposal'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {rec.rationale}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] font-mono text-cyan-400 truncate">
                      {rec.expectedImpact}
                    </span>
                    <button
                      onClick={() => onApplyRecommendation(rec.suggestedConfigPatch)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                    >
                      {rec.isPrecomputedInCache ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <FlaskConical className="w-3.5 h-3.5" />
                      )}
                      <span>Test this option</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2.5 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
            Generating spatial comfort diagnosis from SOLWEIG & URock grids...
          </div>
        )}
      </div>
    </aside>
  );
};
