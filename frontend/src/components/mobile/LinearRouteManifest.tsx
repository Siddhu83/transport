import React from 'react';
import { Check, MapPin, Bus, AlertTriangle, Flag } from 'lucide-react';
import { RouteManifest, VehicleRouteProgress } from '../../types/route';

interface LinearRouteManifestProps {
  manifest: RouteManifest | null;
  progress?: VehicleRouteProgress | null;
  isEmergency?: boolean;
  isLoading?: boolean;
}

export const LinearRouteManifest: React.FC<LinearRouteManifestProps> = ({
  manifest,
  progress,
  isEmergency = false,
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="bg-theme-card-subtle rounded-2xl p-4 border border-theme-border space-y-3 animate-pulse">
        <div className="h-4 bg-theme-border/60 rounded w-1/3 mb-4"></div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-theme-border/80 shrink-0"></div>
            <div className="h-3 bg-theme-border/60 rounded w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!manifest || manifest.stops.length === 0) {
    return (
      <div className="bg-theme-card-subtle rounded-2xl p-4 border border-theme-border text-center text-xs text-theme-muted">
        <MapPin className="w-5 h-5 mx-auto text-theme-muted mb-1 opacity-60" />
        No active route manifest available.
      </div>
    );
  }

  const stops = manifest.stops;
  const totalStops = stops.length;

  // Determine active target index
  let targetIndex = 0;
  if (progress) {
    const foundIdx = stops.findIndex((s) => s.stopId === progress.nextStopId);
    if (foundIdx !== -1) {
      targetIndex = foundIdx;
    } else if (progress.currentStopOrder > 0) {
      targetIndex = Math.min(totalStops - 1, progress.currentStopOrder);
    }
  }

  // Calculate Glider vertical percentage (0% at stop 0 to 100% at last stop)
  let gliderPercent = 0;
  if (totalStops > 1) {
    if (progress && progress.totalRouteDistanceKm > 0) {
      gliderPercent = Math.min(
        100,
        Math.max(0, (progress.linearDistanceCoveredKm / progress.totalRouteDistanceKm) * 100)
      );
    } else {
      gliderPercent = (targetIndex / (totalStops - 1)) * 100;
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-theme-muted px-1">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <span>APSRTC Live Route Manifest</span>
        </span>
        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          {totalStops} Stops • {manifest.totalDistanceKm} km
        </span>
      </div>

      <div className="bg-theme-card-subtle rounded-2xl p-4 border border-theme-border relative">
        {/* Continuous Vertical Track */}
        <div className="absolute left-[27px] top-[26px] bottom-[26px] w-[3px] bg-theme-border rounded-full" />

        {/* Animated Bus Glider Indicator */}
        <div
          className="absolute left-[27px] transition-all duration-700 ease-out z-20 pointer-events-none"
          style={{
            top: `calc(26px + (100% - 52px) * ${gliderPercent / 100})`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 transition-transform ${
              isEmergency
                ? 'bg-rose-600 text-white border-rose-200 shadow-rose-950/60 animate-bounce'
                : 'bg-emerald-500 text-slate-950 border-white dark:border-slate-900 shadow-emerald-500/50 scale-105'
            }`}
          >
            <Bus className="w-3.5 h-3.5 fill-current" />
          </div>
        </div>

        {/* Stop Sequence List */}
        <div className="space-y-4">
          {stops.map((stop, index) => {
            const isLast = index === totalStops - 1;
            const isPassed = index < targetIndex;
            const isTarget = index === targetIndex;

            // Formulate ETA / Status text
            let etaBadge = `+${stop.estimatedMinutesFromStart}m`;
            let isAtStop = false;

            if (isEmergency && isTarget) {
              etaBadge = 'BREAKDOWN';
            } else if (isPassed) {
              etaBadge = 'Departed';
            } else if (isTarget) {
              if (progress?.status === 'AT_STOP') {
                etaBadge = 'AT STOP';
                isAtStop = true;
              } else if (progress && progress.etaSeconds > 0) {
                const mins = Math.max(1, Math.round(progress.etaSeconds / 60));
                etaBadge = `In ${mins}m (${progress.distanceToNextStopMeters}m)`;
              } else {
                etaBadge = 'Next Stop';
              }
            } else if (isLast) {
              etaBadge = 'Terminal';
            }

            return (
              <div key={stop.id || stop.stopId} className="flex items-center gap-3 relative z-10">
                {/* Node Dot / Status Icon */}
                <div className="w-[23px] flex items-center justify-center shrink-0">
                  {isPassed ? (
                    <div className="w-5 h-5 rounded-full bg-slate-700/80 text-emerald-400 flex items-center justify-center border border-slate-600 shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : isTarget ? (
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                        isEmergency
                          ? 'border-rose-500 bg-rose-500/20 text-rose-400 ring-4 ring-rose-500/20 animate-pulse'
                          : isAtStop
                          ? 'border-emerald-400 bg-emerald-500/30 text-emerald-300 ring-4 ring-emerald-500/20'
                          : 'border-emerald-400 bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/15'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isEmergency ? 'bg-rose-500 animate-ping' : 'bg-emerald-400 animate-ping'
                        }`}
                      />
                    </div>
                  ) : isLast ? (
                    <div className="w-5 h-5 rounded-full border border-amber-500/50 bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400">
                      <Flag className="w-2.5 h-2.5" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-theme-border bg-theme-card flex items-center justify-center text-[10px] font-mono text-theme-muted">
                      {stop.stopOrder}
                    </div>
                  )}
                </div>

                {/* Stop Name & Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-xs ${
                        isTarget
                          ? 'font-extrabold text-theme-main'
                          : isPassed
                          ? 'font-medium text-theme-muted line-through opacity-70'
                          : 'font-medium text-theme-muted'
                      }`}
                    >
                      {stop.name}
                    </span>
                    {isTarget && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        TARGET
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-theme-muted/80 block mt-0.5 font-mono">
                    {stop.code} • {stop.distanceFromOriginKm} km from origin
                  </span>
                </div>

                {/* Status / ETA Pill */}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 tabular-nums ${
                    isEmergency && isTarget
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : isPassed
                      ? 'bg-theme-hover text-theme-muted'
                      : isTarget
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                      : isLast
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-theme-card text-theme-muted border border-theme-border'
                  }`}
                >
                  {isEmergency && isTarget ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Breakdown
                    </span>
                  ) : (
                    etaBadge
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
