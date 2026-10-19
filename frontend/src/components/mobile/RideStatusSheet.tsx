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
  const STOPS_TIMELINE = [
    { name: 'Tagarapuvalasa Main Gate', time: '08:00 AM', status: 'COMPLETED' },
    { name: 'Tagarapuvalasa Junction', time: `In ${etaMinutes} mins`, status: 'EN_ROUTE' },
    { name: 'Anandapuram Toll Gate', time: '08:22 AM', status: 'UPCOMING' },
    { name: 'ANITS Central Campus Terminal', time: '08:35 AM', status: 'DESTINATION' },
  ];

  return (
    <div
      className={`fixed left-0 right-0 z-30 transition-all duration-300 ease-out select-none pointer-events-auto ${
        isExpanded ? 'bottom-16' : 'bottom-16'
      }`}
    >
      <div className="max-w-md mx-auto px-3 pb-2">
        <div className="glass-panel rounded-3xl border border-slate-800/90 shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Subtle Centered Drag Handle */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-pointer group"
            aria-label={isExpanded ? 'Collapse Ride Details' : 'Expand Ride Details'}
          >
            <div className="w-10 h-1 bg-slate-700/80 rounded-full group-hover:bg-slate-500 transition-colors" />
          </button>

          {/* Peek State: Glanceable Hero Card (Rapido / Uber Style) */}
          <div className="px-4 pb-3 pt-1 space-y-2.5">
            {/* Top ETA & Action Row */}
            <div className="flex items-start justify-between">
              <div>
                {/* Large Glanceable Gold/Amber Typography */}
                <div className="flex items-baseline gap-2">
                  <h2 className="text-xl font-black tracking-tight text-amber-400 tabular-nums">
                    {etaMinutes} MINS AWAY
                  </h2>
                  <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    On Time
                  </span>
                </div>

                <p className="text-xs font-bold text-white mt-0.5 flex items-center gap-1.5">
                  <span>{busNumber}</span>
                  <span className="text-slate-500">•</span>
                  <span className="text-slate-300 font-medium truncate max-w-[200px]">{routeName}</span>
                </p>
              </div>

              {/* Close / Recenter Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
                  title={isExpanded ? 'Show Less' : 'Show More Details'}
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
                  title="Close Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Next Stop Indicator */}
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[11px] text-slate-400">Next Stop:</span>
              <span className="text-white font-semibold truncate text-[11px]">
                Tagarapuvalasa Junction
              </span>
            </div>

            {/* Micro Badge Metrics Row (Realistic compact chips) */}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20 font-bold">
                <Users className="w-3 h-3 text-blue-400" />
                Seats: {seatsLeft} Left
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800 font-bold">
                <Gauge className="w-3 h-3 text-emerald-400" />
                {speed} km/h
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-slate-400 border border-slate-800">
                <Wind className="w-3 h-3 text-cyan-400" />
                AC Express
              </span>
            </div>

            {/* Driver Contact Strip (SOS strictly removed per modification #2) */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-amber-400">
                  RK
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Driver Ramesh K.</p>
                  <p className="text-[10px] text-slate-400 font-mono">Verified Transit Captain</p>
                </div>
              </div>

              {/* Working Call Driver Phone Dialer Pill */}
              <a
                href="tel:9876543210"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all active:scale-95"
              >
                <Phone className="w-3.5 h-3.5 fill-current" />
                <span>Call Driver</span>
              </a>
            </div>

            {/* Expanded Content: FlightRadar24 Tabular Metrics & Route Timeline */}
            {isExpanded && (
              <div className="pt-3 border-t border-slate-800 space-y-3 animate-fade-in">
                {/* FlightRadar24 Style Tabular Flight/Transit Info Box */}
                <div className="bg-slate-950/70 rounded-2xl p-3 border border-slate-800 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Speed</span>
                      <span className="text-sm font-extrabold text-white tabular-nums">{speed}</span>
                      <span className="text-[10px] text-slate-400 ml-0.5">km/h</span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Heading</span>
                      <span className="text-sm font-extrabold text-white tabular-nums">{heading}°</span>
                      <span className="text-[10px] text-slate-400 ml-0.5">NE</span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Occupancy</span>
                      <span className="text-sm font-extrabold text-amber-400 tabular-nums">{occupancyPct}%</span>
                    </div>
                  </div>

                  {/* Visual Occupancy Bar */}
                  <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                </div>

                {/* Vertical Route Stops Timeline */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                    <span>Route Stop Timeline</span>
                    <span className="text-emerald-400 font-mono text-[9px]">4 Stops Total</span>
                  </p>

                  <div className="bg-slate-950/70 rounded-2xl p-3 border border-slate-800 space-y-3 text-xs">
                    {STOPS_TIMELINE.map((stop, index) => {
                      const isCompleted = stop.status === 'COMPLETED';
                      const isEnRoute = stop.status === 'EN_ROUTE';
                      const isDestination = stop.status === 'DESTINATION';

                      return (
                        <div key={stop.name} className="flex items-center gap-2.5">
                          {/* Dot / Indicator */}
                          <div className="flex flex-col items-center">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${
                                isCompleted
                                  ? 'bg-slate-600'
                                  : isEnRoute
                                  ? 'bg-emerald-400 ring-4 ring-emerald-500/20 animate-pulse'
                                  : isDestination
                                  ? 'border-2 border-amber-400 bg-transparent'
                                  : 'bg-slate-700'
                              }`}
                            />
                            {index < STOPS_TIMELINE.length - 1 && (
                              <div className="w-0.5 h-4 bg-slate-800 mt-1" />
                            )}
                          </div>

                          {/* Stop Name */}
                          <span
                            className={`flex-1 truncate ${
                              isCompleted
                                ? 'text-slate-500 line-through'
                                : isEnRoute
                                ? 'text-emerald-300 font-bold'
                                : isDestination
                                ? 'text-amber-300 font-bold'
                                : 'text-slate-400'
                            }`}
                          >
                            {stop.name}
                          </span>

                          {/* Timestamp Pill */}
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isEnRoute
                                ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                                : isDestination
                                ? 'bg-amber-500/10 text-amber-300'
                                : 'text-slate-500'
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
