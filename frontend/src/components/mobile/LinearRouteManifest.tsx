import React from 'react';
import { Check, MapPin, Bus, AlertTriangle, Flag } from 'lucide-react';
import { RouteManifest, VehicleRouteProgress, SlidingStopWindow, StopProgressStatus } from '../../types/route';

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
        {[1, 2, 3].map((i) => (
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
  const totalStopsCount = stops.length;

  // Resolve 3-stop sliding window: either from backend SSE progress.window or computed locally
  let window: SlidingStopWindow;

  if (progress?.window) {
    window = progress.window;
  } else {
    // Derive window based on targetIndex
    const targetIndex = progress?.currentStopOrder ? Math.min(totalStopsCount - 1, progress.currentStopOrder) : 0;
    const currentStatus: StopProgressStatus = 'EN_ROUTE';
    const distanceMeters = undefined;
    const etaSeconds = undefined;

    if (targetIndex === 0) {
      window = {
        busPosition: 'TOP',
        previousStop: null,
        currentStop: {
          stopId: stops[0]!.stopId,
          name: stops[0]!.name,
          code: stops[0]!.code,
          stopOrder: stops[0]!.stopOrder,
          status: currentStatus,
          distanceMeters,
          etaSeconds,
          isOrigin: true,
        },
        nextStop: totalStopsCount > 1 ? {
          stopId: stops[1]!.stopId,
          name: stops[1]!.name,
          code: stops[1]!.code,
          stopOrder: stops[1]!.stopOrder,
          status: 'UPCOMING',
          isTerminus: totalStopsCount === 2,
        } : null,
        totalStopsCount,
      };
    } else if (targetIndex >= totalStopsCount - 1) {
      window = {
        busPosition: 'BOTTOM',
        previousStop: totalStopsCount > 1 ? {
          stopId: stops[totalStopsCount - 2]!.stopId,
          name: stops[totalStopsCount - 2]!.name,
          code: stops[totalStopsCount - 2]!.code,
          stopOrder: stops[totalStopsCount - 2]!.stopOrder,
          status: 'DEPARTED',
          isOrigin: totalStopsCount - 2 === 0,
        } : null,
        currentStop: {
          stopId: stops[totalStopsCount - 1]!.stopId,
          name: stops[totalStopsCount - 1]!.name,
          code: stops[totalStopsCount - 1]!.code,
          stopOrder: stops[totalStopsCount - 1]!.stopOrder,
          status: currentStatus,
          distanceMeters,
          etaSeconds: 0,
          isTerminus: true,
        },
        nextStop: null,
        totalStopsCount,
      };
    } else {
      const prevIdx = Math.max(0, targetIndex - 1);
      const nextIdx = targetIndex + 1 < totalStopsCount ? targetIndex + 1 : null;

      window = {
        busPosition: 'MIDDLE',
        previousStop: {
          stopId: stops[prevIdx]!.stopId,
          name: stops[prevIdx]!.name,
          code: stops[prevIdx]!.code,
          stopOrder: stops[prevIdx]!.stopOrder,
          status: 'DEPARTED',
          isOrigin: prevIdx === 0,
        },
        currentStop: {
          stopId: stops[targetIndex]!.stopId,
          name: stops[targetIndex]!.name,
          code: stops[targetIndex]!.code,
          stopOrder: stops[targetIndex]!.stopOrder,
          status: currentStatus,
          distanceMeters,
          etaSeconds,
          isTerminus: targetIndex === totalStopsCount - 1,
        },
        nextStop: nextIdx !== null ? {
          stopId: stops[nextIdx]!.stopId,
          name: stops[nextIdx]!.name,
          code: stops[nextIdx]!.code,
          stopOrder: stops[nextIdx]!.stopOrder,
          status: 'UPCOMING',
          isTerminus: nextIdx === totalStopsCount - 1,
        } : null,
        totalStopsCount,
      };
    }
  }

  interface DisplayRow {
    stopId: string;
    name: string;
    code: string;
    stopOrder: number;
    role: 'PREVIOUS' | 'CURRENT' | 'NEXT';
    hasBus: boolean;
    status: string;
    distanceMeters?: number;
    etaSeconds?: number;
    isTerminus?: boolean;
    isOrigin?: boolean;
  }

  const rows: DisplayRow[] = [];

  if (window.busPosition === 'TOP') {
    // Current is Top
    rows.push({
      ...window.currentStop,
      role: 'CURRENT',
      hasBus: true,
    });
    if (window.nextStop) {
      rows.push({
        ...window.nextStop,
        role: 'NEXT',
        hasBus: false,
      });
      const subIdx = window.nextStop.stopOrder;
      if (subIdx < stops.length) {
        rows.push({
          stopId: stops[subIdx]!.stopId,
          name: stops[subIdx]!.name,
          code: stops[subIdx]!.code,
          stopOrder: stops[subIdx]!.stopOrder,
          role: 'NEXT',
          hasBus: false,
          status: 'UPCOMING',
          isTerminus: subIdx === stops.length - 1,
        });
      }
    }
  } else if (window.busPosition === 'BOTTOM') {
    // Current is Bottom
    if (window.previousStop) {
      const prevPrevIdx = window.previousStop.stopOrder - 2;
      if (prevPrevIdx >= 0 && prevPrevIdx < stops.length) {
        rows.push({
          stopId: stops[prevPrevIdx]!.stopId,
          name: stops[prevPrevIdx]!.name,
          code: stops[prevPrevIdx]!.code,
          stopOrder: stops[prevPrevIdx]!.stopOrder,
          role: 'PREVIOUS',
          hasBus: false,
          status: 'DEPARTED',
          isOrigin: prevPrevIdx === 0,
        });
      }
      rows.push({
        ...window.previousStop,
        role: 'PREVIOUS',
        hasBus: false,
      });
    }
    rows.push({
      ...window.currentStop,
      role: 'CURRENT',
      hasBus: true,
    });
  } else {
    // Current is Middle
    if (window.previousStop) {
      rows.push({
        ...window.previousStop,
        role: 'PREVIOUS',
        hasBus: false,
      });
    }
    rows.push({
      ...window.currentStop,
      role: 'CURRENT',
      hasBus: true,
    });
    if (window.nextStop) {
      rows.push({
        ...window.nextStop,
        role: 'NEXT',
        hasBus: false,
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-theme-muted px-1">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <span>Linear Corridor Window (3 Stops)</span>
        </span>
        <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          Stop {window.currentStop.stopOrder} of {totalStopsCount}
        </span>
      </div>

      <div className="bg-theme-card-subtle rounded-2xl p-4 border border-theme-border relative">
        {/* Vertical Rail Connector */}
        <div className="absolute left-[27px] top-[24px] bottom-[24px] w-[2px] bg-theme-border rounded-full" />

        <div className="space-y-4">
          {rows.map((row) => {
            const isCurrent = row.role === 'CURRENT';
            const isPrevious = row.role === 'PREVIOUS';

            // ETA / Status Label
            let etaLabel = isPrevious ? 'Departed' : `Stop #${row.stopOrder}`;
            if (isCurrent) {
              if (isEmergency) {
                etaLabel = 'BREAKDOWN';
              } else if (row.status === 'AT_STOP') {
                etaLabel = 'AT STOP';
              } else if (row.etaSeconds !== undefined && row.etaSeconds > 0) {
                const mins = Math.max(1, Math.round(row.etaSeconds / 60));
                etaLabel = `In ${mins}m (${row.distanceMeters || 450}m)`;
              } else {
                etaLabel = 'Approaching';
              }
            } else if (row.isTerminus) {
              etaLabel = 'Terminus';
            }

            return (
              <div key={row.stopId} className="flex items-center gap-3 relative z-10">
                {/* Node Dot / Bus Icon Anchor */}
                <div className="w-[23px] flex items-center justify-center shrink-0">
                  {row.hasBus ? (
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shadow-md border transition-transform ${
                        isEmergency
                          ? 'bg-rose-600 text-white border-rose-300 shadow-rose-950/60 animate-bounce'
                          : 'bg-emerald-500 text-slate-950 border-white dark:border-slate-900 shadow-emerald-500/50 scale-105'
                      }`}
                      title="Bus Current Location"
                    >
                      <Bus className="w-3.5 h-3.5 fill-current" />
                    </div>
                  ) : isPrevious ? (
                    <div className="w-5 h-5 rounded-full bg-slate-700/80 text-emerald-400 flex items-center justify-center border border-slate-600 shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : row.isTerminus ? (
                    <div className="w-5 h-5 rounded-full border border-amber-500/50 bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400">
                      <Flag className="w-2.5 h-2.5" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-theme-border bg-theme-card flex items-center justify-center text-[10px] font-mono text-theme-muted">
                      {row.stopOrder}
                    </div>
                  )}
                </div>

                {/* Stop Name & Metadata */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-xs ${
                        isCurrent
                          ? 'font-extrabold text-theme-main'
                          : isPrevious
                          ? 'font-medium text-theme-muted line-through opacity-70'
                          : 'font-medium text-theme-muted'
                      }`}
                    >
                      {row.name}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        TARGET
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-theme-muted/80 block mt-0.5 font-mono">
                    {row.code} • {isCurrent ? 'Active Corridor Stop' : isPrevious ? 'Completed' : 'Upcoming'}
                  </span>
                </div>

                {/* Status / ETA Badge */}
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold shrink-0 tabular-nums ${
                    isEmergency && isCurrent
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : isCurrent
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30'
                      : isPrevious
                      ? 'bg-theme-hover text-theme-muted'
                      : 'bg-theme-card text-theme-muted border border-theme-border'
                  }`}
                >
                  {isEmergency && isCurrent ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Breakdown
                    </span>
                  ) : (
                    etaLabel
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
