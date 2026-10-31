import React from 'react';
import {
  buildEstateGeometry,
  computeScenarioHash,
  CURATED_PRESET_SCENARIOS,
  GreeneryPresetId,
  LayoutPresetId,
  OrientationAngle,
  ScenarioConfig,
  ShadingConfig,
} from '../types/microclimate';
import {
  Building2,
  Check,
  Compass,
  Database,
  Play,
  Pin,
  ShieldCheck,
  Trees,
  Umbrella,
  Wind,
} from 'lucide-react';

interface DesignControlsPanelProps {
  config: ScenarioConfig;
  cachedHashes: Set<string>;
  isAssessmentPending: boolean;
  isSimulating: boolean;
  onUpdateConfig: (nextConfig: ScenarioConfig) => void;
  onRunAssessment: () => void;
  onPinCurrentAsBaseline: () => void;
}

export const DesignControlsPanel: React.FC<DesignControlsPanelProps> = ({
  config,
  cachedHashes,
  isAssessmentPending,
  isSimulating,
  onUpdateConfig,
  onRunAssessment,
  onPinCurrentAsBaseline,
}) => {
  const estateGeo = buildEstateGeometry(config);
  const currentHash = computeScenarioHash(config);
  const isCurrentCached = cachedHashes.has(currentHash);

  const setOrientation = (orientationDeg: OrientationAngle) => {
    onUpdateConfig({
      ...config,
      orientationDeg,
      customBlockOverride: null,
    });
  };

  const setLayoutPreset = (layoutPreset: LayoutPresetId) => {
    onUpdateConfig({
      ...config,
      layoutPreset,
      customBlockOverride: null,
    });
  };

  const toggleVoidDecks = () => {
    onUpdateConfig({
      ...config,
      voidDecksEnabled: !config.voidDecksEnabled,
    });
  };

  const toggleShade = (key: keyof ShadingConfig) => {
    onUpdateConfig({
      ...config,
      shading: {
        ...config.shading,
        [key]: !config.shading[key],
      },
    });
  };

  const setGreenery = (greeneryPreset: GreeneryPresetId) => {
    onUpdateConfig({
      ...config,
      greeneryPreset,
    });
  };

  return (
    <aside className="w-80 xl:w-88 shrink-0 bg-[#111827] border-r border-slate-800 flex flex-col h-full overflow-y-auto">
      {/* Section 0: Controlled Milestone Presets */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            01. Precomputed Scenarios
          </h2>
          <span className="text-xs font-mono text-slate-400">
            {cachedHashes.size} Cached
          </span>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {CURATED_PRESET_SCENARIOS.map((preset) => {
            const pHash = computeScenarioHash(preset.config);
            const isSelected = pHash === currentHash;
            const isCached = cachedHashes.has(pHash);
            return (
              <button
                key={preset.id}
                onClick={() => onUpdateConfig(preset.config)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/60 text-white'
                    : 'bg-slate-900/70 border-slate-800/90 text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{preset.title}</span>
                  <span className="text-[11px] font-mono text-cyan-400 shrink-0">
                    {isCached ? 'Cached' : 'Model'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-snug">
                  {preset.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 1: GFA Conservation Lock Banner */}
      <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="text-xs font-medium text-white">Total Floor Area Conserved</div>
            <div className="text-[11px] text-slate-400">
              5 Blocks · {estateGeo.blocks[0]?.storeys} Storeys/Block
            </div>
          </div>
        </div>
        <div className="text-right font-mono">
          <div className="text-sm font-bold text-emerald-400">
            {estateGeo.totalFloorAreaM2.toLocaleString()} m²
          </div>
          <div className="text-[10px] text-slate-400">Constant GFA</div>
        </div>
      </div>

      {/* Section 2: Orientation Controls */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-xs font-semibold text-white">
              02. Estate Block Orientation
            </h3>
          </div>
          <span className="text-xs font-mono text-cyan-400">{config.orientationDeg}°</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Rotate estate axis relative to solar path and prevailing NE trade winds.
        </p>

        <div className="grid grid-cols-4 gap-1.5 mt-2.5">
          {([0, 15, 30, 45] as OrientationAngle[]).map((angle) => {
            const active = config.orientationDeg === angle && !config.customBlockOverride;
            return (
              <button
                key={angle}
                onClick={() => setOrientation(angle)}
                className={`py-2 px-2 text-xs font-mono rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
                }`}
              >
                {angle === 0 ? '0° N-S' : `+${angle}°`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 3: Ventilation & Block Arrangement (Consequence of Geometry) */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5 text-cyan-400" />
          <h3 className="text-xs font-semibold text-white">
            03. Ventilation & Block Morphology
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Airflow changes are modelled from block spacing and ground-floor void decks (URock).
        </p>

        <div className="grid grid-cols-1 gap-1.5 mt-2.5">
          {(
            [
              {
                id: 'baseline-parallel',
                label: 'Parallel Slabs (24 Storeys · 28×12.5m)',
                sub: 'Standard orthogonal court; leeward wake shadows',
              },
              {
                id: 'staggered-courtyard',
                label: 'Staggered Courtyard (24 Storeys · Oblique)',
                sub: 'Opens diagonal NE breeze channel into courtyard',
              },
              {
                id: 'wind-corridor',
                label: 'Widened Wind Corridor (28 Storeys · Slender)',
                sub: 'Narrower footprints +4 storeys to maintain 42,000 m² GFA',
              },
              {
                id: 'void-deck-cluster',
                label: 'Perimeter Sun-Shield Cluster (22–26 Storeys)',
                sub: 'Blocks afternoon western solar beam into courtyard',
              },
            ] as const
          ).map((lay) => {
            const active = config.layoutPreset === lay.id;
            return (
              <button
                key={lay.id}
                onClick={() => setLayoutPreset(lay.id)}
                className={`text-left p-2.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-slate-800 border-cyan-500/70 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="text-xs font-medium">{lay.label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{lay.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Explicit Ground-Floor Void Deck Toggle */}
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <button
            onClick={toggleVoidDecks}
            className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
              config.voidDecksEnabled
                ? 'bg-emerald-500/15 border-emerald-500/60 text-white'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <div className="text-left">
              <div className="text-xs font-semibold">
                Ground-Floor Open Void Decks (3.6m)
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {config.voidDecksEnabled
                  ? 'Active: Piloti columns allow under-building airflow'
                  : 'Inactive: Solid ground floor obstructs wind wakes'}
              </div>
            </div>
            <div
              className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                config.voidDecksEnabled
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                  : 'border-slate-600'
              }`}
            >
              {config.voidDecksEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </div>
          </button>
        </div>
      </div>

      {/* Section 4: Overhead Shading Structures */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <Umbrella className="w-3.5 h-3.5 text-amber-400" />
          <h3 className="text-xs font-semibold text-white">
            04. Architectural Shade Structures
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Toggle high-albedo canopies over designated pedestrian paths and activity zones.
        </p>

        <div className="space-y-1.5 mt-2.5">
          {(
            [
              {
                key: 'walkwayCanopy',
                label: 'Spine Walkway Covered Linkway',
                spec: 'τ = 0.08 · H = 4.2m continuous arch',
              },
              {
                key: 'playgroundShadeSails',
                label: 'Playground Tensile Shade Sails',
                spec: 'τ = 0.10 · H = 5.5m dual membrane',
              },
              {
                key: 'courtyardPergola',
                label: 'Central Courtyard Louvered Pergola',
                spec: 'τ = 0.12 · H = 4.8m timber-steel',
              },
            ] as const
          ).map((item) => {
            const active = config.shading[item.key];
            return (
              <button
                key={item.key}
                onClick={() => toggleShade(item.key)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-amber-500/15 border-amber-500/60 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="text-left">
                  <div className="text-xs font-medium">{item.label}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {item.spec}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                    active
                      ? 'bg-amber-400 border-amber-300 text-slate-950'
                      : 'border-slate-600'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 5: Greenery & Canopy Properties */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <Trees className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-xs font-semibold text-white">
            05. Tropical Tree Arrangements
          </h3>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Defined crown diameter, height, and shortwave leaf transmissivity (τ).
        </p>

        <div className="space-y-1.5 mt-2.5">
          {(
            [
              {
                id: 'none',
                label: 'No Tree Canopy (Hardscape Baseline)',
                spec: '0 Trees · Exposed paving albedo 0.20',
              },
              {
                id: 'sparse-palms',
                label: 'Ornamental Royal Palms (8 Trees)',
                spec: 'Crown Ø 6.4m · H 10.8m · τ = 0.42 · LAI 1.8',
              },
              {
                id: 'courtyard-raintrees',
                label: 'Courtyard Rain Tree Cluster (10 Trees)',
                spec: 'Crown Ø 14.4m · H 14.2m · τ = 0.16 · LAI 4.2',
              },
              {
                id: 'dense-canopy-avenue',
                label: 'Continuous Rain Tree & Flame Avenue (18 Trees)',
                spec: 'Crown Ø 13.6m · H 13.4m · τ = 0.15 · LAI 4.5',
              },
            ] as const
          ).map((gr) => {
            const active = config.greeneryPreset === gr.id;
            return (
              <button
                key={gr.id}
                onClick={() => setGreenery(gr.id)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-white'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="text-xs font-medium">{gr.label}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                  {gr.spec}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Action Footer: Two-Speed Assessment Trigger & Baseline Lock */}
      <div className="p-4 mt-auto bg-slate-950/60 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scenario Cache Status:</span>
          </span>
          <span
            className={`font-mono font-semibold ${
              isCurrentCached ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {isCurrentCached ? 'CACHED (0ms)' : 'UNCALCULATED'}
          </span>
        </div>

        <button
          onClick={onRunAssessment}
          disabled={isSimulating}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isAssessmentPending
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
          }`}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>
            {isSimulating
              ? 'Running SOLWEIG + URock...'
              : isAssessmentPending
                ? 'Calculate Pending Arrangement'
                : 'Re-Run Modelled Assessment'}
          </span>
        </button>

        <button
          onClick={onPinCurrentAsBaseline}
          disabled={isAssessmentPending || isSimulating}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 border border-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Pin className="w-3.5 h-3.5 text-cyan-400" />
          <span>Set Current Proposal as New Baseline</span>
        </button>

        <div className="pt-2 flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            <strong>Model Scope:</strong> Background T<sub>a</sub> & RH held constant;
            models layout, shade & canopy effects on MRT and wind.
          </span>
        </div>
      </div>
    </aside>
  );
};
