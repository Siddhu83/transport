import React, { useState, useRef, useEffect } from 'react';
import { Bus, ChevronDown, Search, Check, X, MapPin, Gauge, Users } from 'lucide-react';
import { VehicleFeatureProperties } from './FleetCanvas';

export interface FleetDropdownProps {
  geoJsonData?: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>;
  selectedBusId?: string | null;
  onSelectBus: (busId: string | null) => void;
  theme?: 'dark' | 'light';
}

export const FleetDropdown: React.FC<FleetDropdownProps> = ({
  geoJsonData,
  selectedBusId,
  onSelectBus,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const features = geoJsonData?.features || [];
  const activeCount = features.length;

  const selectedFeature = features.find((f) => f.properties.busId === selectedBusId);
  const selectedProps = selectedFeature?.properties;

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut listener (Escape closes dropdown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Filtered vehicles based on search query
  const filteredFeatures = features.filter((f) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const plate = (f.properties.plateNumber || '').toLowerCase();
    const busId = (f.properties.busId || '').toLowerCase();
    const route = (f.properties.routeName || f.properties.routeId || '').toLowerCase();
    return plate.includes(query) || busId.includes(query) || route.includes(query);
  });

  const handleItemClick = (busId: string) => {
    if (selectedBusId === busId) {
      onSelectBus(null);
    } else {
      onSelectBus(busId);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectBus(null);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative pointer-events-auto">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-3 px-3.5 py-2 rounded-xl border transition-all duration-200 cursor-pointer shadow-xl backdrop-blur-xl ${
          isOpen
            ? 'bg-slate-900/90 border-cyan-400 text-white shadow-cyan-500/10'
            : selectedProps
            ? 'bg-slate-900/80 border-cyan-500/50 text-cyan-400 hover:border-cyan-400 hover:bg-slate-900/95'
            : 'bg-slate-900/80 border-slate-700/60 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-900/90'
        }`}
      >
        {/* Icon */}
        <div
          className={`p-1.5 rounded-lg border transition-all ${
            selectedProps
              ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
              : 'bg-slate-800 border-slate-700 text-slate-400 group-hover:text-cyan-400'
          }`}
        >
          <Bus className="w-4 h-4" />
        </div>

        {/* Text / Status */}
        <div className="flex flex-col items-start text-left font-mono">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
            <span>Target Fleet</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="text-xs font-bold flex items-center gap-2">
            {selectedProps ? (
              <>
                <span className="text-white">
                  {selectedProps.plateNumber || `BUS-${selectedProps.busId.slice(0, 4).toUpperCase()}`}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-400 font-normal">
                  {selectedProps.speed} km/h
                </span>
              </>
            ) : (
              <span className="text-slate-300">
                Select Vehicle <span className="text-slate-500 font-normal">({activeCount} Active)</span>
              </span>
            )}
          </div>
        </div>

        {/* Actions / Arrow */}
        <div className="flex items-center gap-1 ml-1">
          {selectedProps && (
            <div
              role="button"
              onClick={handleClear}
              title="Deselect Bus"
              className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </div>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-cyan-400' : 'group-hover:text-cyan-400'
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 sm:w-96 glass-panel-glow border border-cyan-500/30 rounded-2xl p-3 shadow-2xl z-50 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150 bg-[#0b0f17]/95">
          {/* Search Header */}
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by bus plate, ID, route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Header Info Bar */}
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-mono text-slate-400 border-b border-slate-800/80 mb-2">
            <span>LIVE VEHICLES ({filteredFeatures.length})</span>
            {selectedBusId && (
              <button
                onClick={() => onSelectBus(null)}
                className="text-cyan-400 hover:underline cursor-pointer"
              >
                Reset Map Camera
              </button>
            )}
          </div>

          {/* Scrollable Vehicle List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {filteredFeatures.length === 0 ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">
                No active buses match &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredFeatures.map((feature) => {
                const props = feature.properties;
                const isSelected = selectedBusId === props.busId;
                const isSos = props.status === 'SOS';
                const isDelayed = props.status === 'DELAYED';

                return (
                  <button
                    key={props.busId}
                    onClick={() => handleItemClick(props.busId)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all duration-150 flex items-center justify-between font-mono group cursor-pointer border ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-lg shadow-cyan-500/10'
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-300 hover:bg-slate-800/80 hover:border-cyan-500/30 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Status Indicator */}
                      <div className="relative flex h-2.5 w-2.5 shrink-0">
                        <span
                          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            isSos ? 'bg-red-400' : isDelayed ? 'bg-amber-400' : 'bg-emerald-400'
                          }`}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            isSos ? 'bg-red-500' : isDelayed ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                        />
                      </div>

                      {/* Bus info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                            {props.plateNumber || `BUS-${props.busId.slice(0, 4).toUpperCase()}`}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.2 text-[9px] rounded bg-cyan-500 text-slate-950 font-bold uppercase">
                              Target
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-cyan-500 shrink-0" />
                          <span className="truncate max-w-[160px]">
                            {props.routeName || `Route ${props.routeId.slice(0, 6)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats Pill Badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end text-[10px]">
                        <span className="flex items-center gap-1 font-bold text-cyan-400">
                          <Gauge className="w-3 h-3" />
                          {props.speed} km/h
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Users className="w-3 h-3 text-slate-500" />
                          {props.passengerCount ?? 0}/{props.capacity ?? 55}
                        </span>
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
