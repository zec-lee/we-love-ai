import React from 'react';
import {
  ScenarioConfig,
  SimulationResult,
  SOLAR_TIME_CATALOG,
  TimeOfDayId,
  WEATHER_CATALOG,
  WeatherScenarioId,
} from '../types/microclimate';
import { Clock, CloudSun, Cpu, Play } from 'lucide-react';

interface BottomWeatherStatusBarProps {
  config: ScenarioConfig;
  proposalResult: SimulationResult | null;
  isAssessmentPending: boolean;
  isSimulating: boolean;
  lastWasCacheHit: boolean;
  onUpdateWeather: (weatherScenario: WeatherScenarioId) => void;
  onUpdateTime: (timeOfDay: TimeOfDayId) => void;
  onRunAssessment: () => void;
}

export const BottomWeatherStatusBar: React.FC<BottomWeatherStatusBarProps> = ({
  config,
  proposalResult,
  isAssessmentPending,
  isSimulating,
  lastWasCacheHit,
  onUpdateWeather,
  onUpdateTime,
  onRunAssessment,
}) => {
  const activeWeather = WEATHER_CATALOG[config.weatherScenario];

  return (
    <footer className="bg-[#111827] border-t border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
      {/* Left: Weather Scenario Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <CloudSun className="w-4 h-4 text-amber-400" />
          <span>Weather Scenario:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(Object.keys(WEATHER_CATALOG) as WeatherScenarioId[]).map((wId) => {
            const w = WEATHER_CATALOG[wId];
            const active = config.weatherScenario === wId;
            return (
              <button
                key={wId}
                onClick={() => onUpdateWeather(wId)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                title={w.name}
              >
                {w.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Center: Solar Analysis Time Selector */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>Solar Time:</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(Object.keys(SOLAR_TIME_CATALOG) as TimeOfDayId[]).map((tId) => {
            const t = SOLAR_TIME_CATALOG[tId];
            const active = config.timeOfDay === tId;
            return (
              <button
                key={tId}
                onClick={() => onUpdateTime(tId)}
                className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Two-Speed Assessment Engine Status & Scope Note */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="hidden 2xl:block text-[11px] text-slate-400">
          Constant Background: <strong className="text-slate-200">{activeWeather.airTempC}°C</strong> T<sub>a</sub> ·{' '}
          <strong className="text-slate-200">{activeWeather.relativeHumidityPct}%</strong> RH
        </div>

        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
          <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          {isSimulating ? (
            <span className="font-mono text-cyan-300">
              Running SOLWEIG + URock Solver...
            </span>
          ) : isAssessmentPending ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-amber-400">
                ● Pending Assessment (Uncalculated Geometry)
              </span>
              <button
                onClick={onRunAssessment}
                className="flex items-center gap-1 px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-[11px]"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>Run Now</span>
              </button>
            </div>
          ) : (
            <span className="font-mono text-emerald-400">
              ● {lastWasCacheHit ? 'Cache Hit (0ms Instant)' : `Modelled Run (${proposalResult?.computeTimeMs ?? 12}ms)`}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
};
