import React from 'react';
import { Route as RouteIcon, Bus, ChevronRight, MapPin, Clock } from 'lucide-react';

interface RouteItem {
  id: string;
  routeNumber: string;
  name: string;
  startPoint: string;
  endPoint: string;
  frequency: string;
  stopsCount: number;
}

const COLLEGE_CORRIDORS: RouteItem[] = [
  {
    id: 'a1111111-1111-4111-8111-111111111111',
    routeNumber: 'R-101',
    name: 'Sector 1 Express Corridor',
    startPoint: 'Tagarapuvalasa Junction',
    endPoint: 'ANITS Campus Gate',
    frequency: 'Every 10 mins',
    stopsCount: 8,
  },
  {
    id: 'a2222222-2222-4222-8222-222222222222',
    routeNumber: 'R-102',
    name: 'Sector 2 Tech Park Corridor',
    startPoint: 'Madhurawada IT SEZ',
    endPoint: 'ANITS Central Terminal',
    frequency: 'Every 15 mins',
    stopsCount: 12,
  },
  {
    id: 'a3333333-3333-4333-8333-333333333333',
    routeNumber: 'R-103',
    name: 'Central Hostels & Campus Corridor',
    startPoint: 'Boy’s Hostels Complex',
    endPoint: 'Academic Block 4',
    frequency: 'Every 8 mins',
    stopsCount: 5,
  },
  {
    id: 'a4444444-4444-4444-8444-444444444444',
    routeNumber: 'R-104',
    name: 'MVP Colony Express Corridor',
    startPoint: 'MVP Colony Rythu Bazaar',
    endPoint: 'ANITS Campus Gate',
    frequency: 'Every 20 mins',
    stopsCount: 14,
  },
];

interface RoutesDirectoryViewProps {
  onSelectRouteBus: (routeId: string) => void;
  activeFeatures: any[];
}

export const RoutesDirectoryView: React.FC<RoutesDirectoryViewProps> = ({
  onSelectRouteBus,
  activeFeatures,
}) => {
  return (
    <div className="fixed inset-0 z-20 view-content-padding px-4 overflow-y-auto bg-theme-canvas/95 backdrop-blur-xl">
      <div className="max-w-md mx-auto space-y-3 pb-6 pt-2">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-bold text-theme-main uppercase tracking-wider flex items-center gap-1.5">
            <RouteIcon className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            Active Corridors
          </span>
          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
            {activeFeatures.length} Fleet Buses Live
          </span>
        </div>

        {COLLEGE_CORRIDORS.map((corridor) => {
          // Count active buses running along this corridor
          const corridorBuses = activeFeatures.filter(
            (f) => f.properties?.routeId === corridor.id || f.properties?.routeName?.includes(corridor.routeNumber)
          );
          const hasBuses = corridorBuses.length > 0;

          return (
            <div
              key={corridor.id}
              onClick={() => onSelectRouteBus(corridor.id)}
              className="glass-panel rounded-2xl p-4 border border-theme-border hover:border-amber-500/50 transition-all cursor-pointer active:scale-98 space-y-3 shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 font-mono border border-amber-500/30">
                      {corridor.routeNumber}
                    </span>
                    <h3 className="text-xs font-bold text-theme-main">{corridor.name}</h3>
                  </div>

                  <p className="text-[11px] text-theme-muted mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-theme-muted shrink-0" />
                    <span>{corridor.startPoint}</span>
                    <span className="text-theme-muted">→</span>
                    <span className="text-theme-main font-medium">{corridor.endPoint}</span>
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-theme-muted shrink-0 mt-1" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-theme-border-subtle text-[10px] font-mono">
                <span className="text-theme-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-theme-muted" />
                  {corridor.frequency}
                </span>

                <span
                  className={`font-bold flex items-center gap-1 px-2 py-0.5 rounded ${
                    hasBuses
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-theme-card-subtle text-theme-muted border border-theme-border'
                  }`}
                >
                  <Bus className="w-3 h-3" />
                  {corridorBuses.length > 0 ? `${corridorBuses.length} Buses Live` : 'Next in 12m'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RoutesDirectoryView;
