import React, { useState } from 'react';
import {
  MapPin,
  Users,
  Gauge,
  Phone,
  ChevronUp,
  ChevronDown,
  Wind,
  X,
  AlertTriangle,
  ShieldAlert,
  LifeBuoy,
} from 'lucide-react';
import { VehicleFeatureProperties } from '../map/FleetCanvas';

interface RideStatusSheetProps {
  vehicle: VehicleFeatureProperties | null;
  onClose: () => void;
  onRecenter?: () => void;
}

export const RideStatusSheet: React.FC<RideStatusSheetProps> = ({
  vehicle,
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  if (!vehicle) return null;

  const isEmergency = vehicle.status === 'SOS';

  // Derive realistic operational metrics
  const busNumber = vehicle.plateNumber || `BUS-${vehicle.busId.slice(0, 4).toUpperCase()}`;
  const routeName = vehicle.routeName || 'Sector 1 Express Corridor';
  const speed = vehicle.speed || 34;
  const heading = vehicle.heading || 75;
  const capacity = vehicle.capacity || 55;
  const passengerCount = vehicle.passengerCount ?? 38;
  const seatsLeft = Math.max(0, capacity - passengerCount);
  const occupancyPct = Math.round((passengerCount / capacity) * 100);

  // Dynamic ETA estimation (derived glanceably: 4-12 mins away)
  const etaMinutes = speed > 40 ? 5 : speed > 20 ? 8 : 12;

  // Realistic Campus Stops Timeline for this route
  const STOPS_TIMELINE = isEmergency
    ? [
        { name: 'Tagarapuvalasa Main Gate', time: '08:00 AM', status: 'COMPLETED' },
        { name: 'Tagarapuvalasa Junction (Breakdown Site)', time: 'STOPPED', status: 'BREAKDOWN' },
        { name: 'Anandapuram Toll Gate', time: 'Relief Bus ~6 min', status: 'RELIEF' },
        { name: 'ANITS Central Campus Terminal', time: 'Delayed ~15 min', status: 'DESTINATION' },
      ]
    : [
        { name: 'Tagarapuvalasa Main Gate', time: '08:00 AM', status: 'COMPLETED' },
        { name: 'Tagarapuvalasa Junction', time: `In ${etaMinutes} mins`, status: 'EN_ROUTE' },
        { name: 'Anandapuram Toll Gate', time: '08:22 AM', status: 'UPCOMING' },
        { name: 'ANITS Central Campus Terminal', time: '08:35 AM', status: 'DESTINATION' },
      ];

  return (
    <div
      className="fixed left-0 right-0 z-30 transition-all duration-300 ease-out select-none pointer-events-auto"
      style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 0.5rem) + 4rem)' }}
    >
      <div className="max-w-md mx-auto px-3 pb-2">
        <div className="glass-panel rounded-3xl border border-theme-border shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Subtle Centered Drag Handle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer group"
            aria-label={isExpanded ? 'Collapse Ride Details' : 'Expand Ride Details'}
          >
            <div className="w-10 h-1 bg-theme-border rounded-full group-hover:bg-theme-muted transition-colors" />
          </button>

          {/* Peek State: Glanceable Hero Card (Rapido / Uber Style) */}
          <div className="px-4 pb-3 pt-1 space-y-2.5">
            {/* Top ETA & Action Row */}
            <div className="flex items-start justify-between">
              <div>
                {/* Large Glanceable Gold/Amber Typography */}
                {isEmergency ? (
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-black tracking-tight text-rose-500 dark:text-rose-400 tabular-nums flex items-center gap-1.5 animate-pulse">
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      BREAKDOWN REPORTED
                    </h2>
                    <span className="text-[10px] font-extrabold text-amber-500 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      Relief Dispatched
                    </span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-xl font-black tracking-tight text-amber-500 dark:text-amber-400 tabular-nums">
                      {etaMinutes} MINS AWAY
                    </h2>
                    <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                      On Time
                    </span>
                  </div>
                )}

                <p className="text-xs font-bold text-theme-main mt-0.5 flex items-center gap-1.5">
                  <span>{busNumber}</span>
                  <span className="text-theme-muted">•</span>
                  <span className="text-theme-muted font-medium truncate max-w-[200px]">{routeName}</span>
                </p>
              </div>

              {/* Close / Recenter Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-xl bg-theme-hover text-theme-muted hover:text-theme-main border border-theme-border transition-colors cursor-pointer"
                  title={isExpanded ? 'Show Less' : 'Show More Details'}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl bg-theme-hover text-theme-muted hover:text-theme-main border border-theme-border transition-colors cursor-pointer"
                  title="Close Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Emergency Breakdown Overlay Banner (Sprint 13 Core Requirement) */}
            {isEmergency && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-500 dark:text-rose-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-500" />
                    Emergency Rerouting Activated
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                    Code RED
                  </span>
                </div>
                <p className="text-[11px] text-theme-muted leading-relaxed">
                  Bus has pulled over due to mechanical issue. Relief Bus AP 39 TE 2045 has been authorized by Dispatch.
                </p>
                <div className="pt-2 border-t border-rose-500/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-theme-muted block">Replacement Vehicle</span>
                    <span className="font-bold text-theme-main">AP 39 TE 2045 (Relief)</span>
                  </div>
                  <div className="text-right font-mono">
                    <span className="text-[10px] text-theme-muted block">Estimated Arrival</span>
                    <span className="font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">~6 mins away</span>
                  </div>
                </div>
              </div>
            )}

            {/* Next Stop Indicator */}
            <div className="flex items-center gap-1.5 text-xs text-theme-muted">
              <MapPin className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              <span className="text-[11px] text-theme-muted">Next Stop:</span>
              <span className="text-theme-main font-semibold truncate text-[11px]">
                Tagarapuvalasa Junction
              </span>
            </div>

            {/* Micro Badge Metrics Row (Realistic compact chips) */}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20 font-bold">
                <Users className="w-3 h-3 text-blue-500 dark:text-blue-400" />
                Seats: {seatsLeft} Left
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-theme-card-subtle text-theme-main border border-theme-border font-bold">
                <Gauge className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                {speed} km/h
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-theme-card-subtle text-theme-muted border border-theme-border">
                <Wind className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />
                AC Express
              </span>
            </div>

            {/* Driver Contact Strip */}
            <div className="pt-2 border-t border-theme-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-theme-hover border border-theme-border flex items-center justify-center font-bold text-xs text-amber-500 dark:text-amber-400">
                  RK
                </div>
                <div>
                  <p className="text-xs font-bold text-theme-main">Driver Ramesh K.</p>
                  <p className="text-[10px] text-theme-muted font-mono">Verified Transit Captain</p>
                </div>
              </div>

              {/* Working Call Driver or Helpline Phone Dialer Pill */}
              {isEmergency ? (
                <a
                  href="tel:18004255555"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all active:scale-95"
                >
                  <LifeBuoy className="w-3.5 h-3.5" />
                  <span>Helpline</span>
                </a>
              ) : (
                <a
                  href="tel:9876543210"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-theme-card-subtle hover:bg-theme-hover text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all active:scale-95"
                >
                  <Phone className="w-3.5 h-3.5 fill-current" />
                  <span>Call Driver</span>
                </a>
              )}
            </div>

            {/* Expanded Content: Tabular Metrics & Route Timeline */}
            {isExpanded && (
              <div className="pt-3 border-t border-theme-border-subtle space-y-3 animate-fade-in">
                {/* FlightRadar24 Style Tabular Flight/Transit Info Box */}
                <div className="bg-theme-card-subtle rounded-2xl p-3 border border-theme-border space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                    <div className="bg-theme-card p-2 rounded-xl border border-theme-border">
                      <span className="text-[9px] uppercase tracking-wider text-theme-muted block">Speed</span>
                      <span className="text-sm font-extrabold text-theme-main tabular-nums">{speed}</span>
                      <span className="text-[10px] text-theme-muted ml-0.5">km/h</span>
                    </div>

                    <div className="bg-theme-card p-2 rounded-xl border border-theme-border">
                      <span className="text-[9px] uppercase tracking-wider text-theme-muted block">Heading</span>
                      <span className="text-sm font-extrabold text-theme-main tabular-nums">{heading}°</span>
                      <span className="text-[10px] text-theme-muted ml-0.5">NE</span>
                    </div>

                    <div className="bg-theme-card p-2 rounded-xl border border-theme-border">
                      <span className="text-[9px] uppercase tracking-wider text-theme-muted block">Occupancy</span>
                      <span className="text-sm font-extrabold text-amber-500 dark:text-amber-400 tabular-nums">{occupancyPct}%</span>
                    </div>
                  </div>

                  {/* Visual Occupancy Bar */}
                  <div className="w-full bg-theme-hover h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                </div>

                {/* Vertical Route Stops Timeline */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-theme-muted px-1 flex items-center justify-between">
                    <span>Route Stop Timeline</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px]">4 Stops Total</span>
                  </p>

                  <div className="bg-theme-card-subtle rounded-2xl p-3 border border-theme-border space-y-3 text-xs">
                    {STOPS_TIMELINE.map((stop, index) => {
                      const isCompleted = stop.status === 'COMPLETED';
                      const isEnRoute = stop.status === 'EN_ROUTE';
                      const isDestination = stop.status === 'DESTINATION';
                      const isBreakdown = stop.status === 'BREAKDOWN';
                      const isRelief = stop.status === 'RELIEF';

                      return (
                        <div key={stop.name} className="flex items-center gap-2.5">
                          {/* Dot / Indicator */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${
                                isBreakdown
                                  ? 'bg-rose-500 ring-4 ring-rose-500/20 animate-pulse'
                                  : isRelief
                                  ? 'bg-amber-500 ring-4 ring-amber-500/20'
                                  : isCompleted
                                  ? 'bg-slate-400 dark:bg-slate-600'
                                  : isEnRoute
                                  ? 'bg-emerald-500 dark:bg-emerald-400 ring-4 ring-emerald-500/20 animate-pulse'
                                  : isDestination
                                  ? 'border-2 border-amber-500 dark:border-amber-400 bg-transparent'
                                  : 'bg-slate-300 dark:bg-slate-700'
                              }`}
                            />
                            {index < STOPS_TIMELINE.length - 1 && (
                              <div className="w-0.5 h-4 bg-theme-border mt-1" />
                            )}
                          </div>

                          {/* Stop Name */}
                          <span
                            className={`flex-1 truncate ${
                              isBreakdown
                                ? 'text-rose-500 dark:text-rose-400 font-bold'
                                : isRelief
                                ? 'text-amber-500 dark:text-amber-300 font-bold'
                                : isCompleted
                                ? 'text-theme-muted line-through opacity-70'
                                : isEnRoute
                                ? 'text-emerald-600 dark:text-emerald-300 font-bold'
                                : isDestination
                                ? 'text-amber-600 dark:text-amber-300 font-bold'
                                : 'text-theme-muted'
                            }`}
                          >
                            {stop.name}
                          </span>

                          {/* Timestamp Pill */}
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isBreakdown
                                ? 'bg-rose-500/20 text-rose-400 font-bold'
                                : isRelief
                                ? 'bg-amber-500/20 text-amber-400 font-bold'
                                : isEnRoute
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold'
                                : isDestination
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                : 'text-theme-muted'
                            }`}
                          >
                            {stop.time}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RideStatusSheet;
