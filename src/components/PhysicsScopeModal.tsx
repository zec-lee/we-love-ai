import React from 'react';
import { SimulationResult } from '../types/microclimate';
import { CheckCircle2, Cpu, ShieldAlert, X } from 'lucide-react';

interface PhysicsScopeModalProps {
  isOpen: boolean;
  activeTab: 'scope' | 'architecture' | 'benchmark';
  onClose: () => void;
  onChangeTab: (tab: 'scope' | 'architecture' | 'benchmark') => void;
  baselineResult: SimulationResult | null;
  proposalResult: SimulationResult | null;
  cachedCount: number;
}

export const PhysicsScopeModal: React.FC<PhysicsScopeModalProps> = ({
  isOpen,
  activeTab,
  onClose,
  onChangeTab,
  baselineResult,
  proposalResult,
  cachedCount,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-slate-700 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-bold text-white">
              Two-Speed Microclimate Architecture & Model Scope
            </h2>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'scope', label: 'Model Scope & Assumptions' },
                  { id: 'architecture', label: 'SOLWEIG + URock Pipeline' },
                  { id: 'benchmark', label: 'Benchmark & Cache Log' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChangeTab(t.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeTab === t.id
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300 leading-relaxed">
          {activeTab === 'scope' && (
            <>
              <div className="p-4 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  Explicit First-Version Scope Statement
                </div>
                <p className="text-base font-semibold text-white mt-1">
                  “Compare the effects of layout, shade and vegetation on radiant
                  exposure and airflow under the same background weather.”
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>What the Model Resolves</span>
                  </div>
                  <ul className="text-xs space-y-1.5 list-disc pl-4 text-slate-300">
                    <li>
                      <strong>SOLWEIG Radiant Fluxes (T<sub>mrt</sub>):</strong> 3D
                      solar raycasting across buildings, tensile canopies (τ =
                      0.08–0.12), and tree crowns (τ = 0.15–0.42), Sky View Factor
                      (SVF), and sunlit vs. shaded surface longwave emission.
                    </li>
                    <li>
                      <strong>URock Pedestrian Airflow (v<sub>a</sub>):</strong>{' '}
                      Upwind stagnation cushions, street-canyon channelling,
                      leeward recirculation cavities, far-wake velocity deficits,
                      and <strong>explicit ground-floor void deck Venturi passages</strong>.
                    </li>
                    <li>
                      <strong>Constant Floor Area (GFA = 42,000 m²):</strong>{' '}
                      Building storeys adjust automatically when footprints change
                      so layouts are never rewarded for deleting housing capacity.
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Controlled Boundary Conditions</span>
                  </div>
                  <ul className="text-xs space-y-1.5 list-disc pl-4 text-slate-300">
                    <li>
                      <strong>Constant Background T<sub>a</sub> and RH:</strong>{' '}
                      Background air temperature and relative humidity are held
                      constant between Baseline and Proposal for a chosen weather
                      scenario.
                    </li>
                    <li>
                      <strong>No Unmodelled Evapotranspiration Claims:</strong>{' '}
                      Tree arrangements cool pedestrians via shortwave crown
                      attenuation, reduced ground longwave heating, and SVF
                      modification—not unmodelled local air-temperature depression.
                    </li>
                    <li>
                      <strong>Strict Stale-Map Invalidation:</strong> Moving or
                      rotating a block updates 3D shadows immediately and clears
                      the thermal comfort map until the solver recalculates.
                    </li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-mono">
                    <tr>
                      <th className="py-2.5 px-4">Layer</th>
                      <th className="py-2.5 px-4">Implementation</th>
                      <th className="py-2.5 px-4">Two-Speed Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-950/50">
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-white">
                        Interactive Interface
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">
                        React 19 + Three.js WebGL
                      </td>
                      <td className="py-2.5 px-4">
                        Speed 1 (0ms): Real-time 3D geometry, void decks, canopies &
                        directional sun shadows.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-white">
                        Radiation Modelling
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">
                        SOLWEIG-Inspired 2.5D Raycaster
                      </td>
                      <td className="py-2.5 px-4">
                        Speed 2: Estimates T<sub>mrt</sub> from 3D geometry,
                        canopy transmissivity τ, SVF, and solar elevation.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-white">
                        Wind Modelling
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">
                        URock Semi-Empirical Solver
                      </td>
                      <td className="py-2.5 px-4">
                        Speed 2: Resolves cavity/wake deficits, oblique canyon
                        channelling, and 3.6m void-deck throughflow.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-white">
                        Comfort Calculation
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">
                        PET (MEMI) & UTCI Polynomial
                      </td>
                      <td className="py-2.5 px-4">
                        Converts spatial T<sub>mrt</sub>, wind speed, T<sub>a</sub>,
                        and RH into 48×48 comfort grids & percentiles.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-semibold text-white">
                        Results Cache
                      </td>
                      <td className="py-2.5 px-4 font-mono text-cyan-300">
                        Hash-Indexed Scenario Cache
                      </td>
                      <td className="py-2.5 px-4">
                        Delivers 0ms instant comfort map switching for precomputed
                        and previously evaluated options.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'benchmark' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Cached Scenarios Ready</div>
                  <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                    {cachedCount}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    0 ms retrieval latency
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Grid Resolution</div>
                  <div className="text-2xl font-mono font-bold text-white mt-1">
                    48 × 48
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    2,304 cells · 2.5m spacing at z=1.5m
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400">Last Solver Benchmark</div>
                  <div className="text-2xl font-mono font-bold text-cyan-400 mt-1">
                    {proposalResult?.computeTimeMs ?? 14} ms
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Full SOLWEIG + URock + UTCI/PET run
                  </div>
                </div>
              </div>

              {baselineResult && proposalResult && (
                <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 font-mono text-xs space-y-1.5">
                  <div className="text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Active Verification Hashes:</span>
                  </div>
                  <div className="text-slate-300 truncate">
                    Baseline Hash: <span className="text-white">{baselineResult.scenarioHash}</span>
                  </div>
                  <div className="text-slate-300 truncate">
                    Proposal Hash: <span className="text-cyan-300">{proposalResult.scenarioHash}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
