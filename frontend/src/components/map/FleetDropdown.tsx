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
      {/* Trigger Button using Semantic Theme Tokens */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-3 px-3.5 py-2 rounded-xl border transition-all duration-200 cursor-pointer shadow-xl backdrop-blur-xl ${
          isOpen
            ? 'bg-theme-card/90 border-brand-primary text-theme-main shadow-brand-glow'
            : selectedProps
            ? 'bg-theme-card/85 border-brand-primary/50 text-brand-primary hover:border-brand-primary hover:bg-theme-card/95'
            : 'bg-theme-card/80 border-theme-border text-theme-main hover:border-brand-primary/40 hover:bg-theme-card/90'
        }`}
      >
        {/* Icon Container */}
        <div
          className={`p-1.5 rounded-lg border transition-all ${
            selectedProps
              ? 'bg-brand-primary/20 border-brand-primary/40 text-brand-primary'
              : 'bg-theme-hover border-theme-border text-theme-muted group-hover:text-brand-primary'
          }`}
        >
          <Bus className="w-4 h-4" />
        </div>

        {/* Text & Dynamic Telemetry Summary */}
        <div className="flex flex-col items-start text-left font-mono">
          <div className="text-[10px] uppercase tracking-wider text-theme-muted font-semibold flex items-center gap-1.5">
            <span>Target Fleet</span>
            <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse" />
          </div>

          <div className="text-xs font-bold flex items-center gap-2">
            {selectedProps ? (
              <>
                <span className="text-theme-main">
                  {selectedProps.plateNumber || `BUS-${selectedProps.busId.slice(0, 4).toUpperCase()}`}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-primary/20 text-brand-primary font-normal">
                  {selectedProps.speed} km/h
                </span>
              </>
            ) : (
              <span className="text-theme-main">
                Select Vehicle <span className="text-theme-muted font-normal">({activeCount} Active)</span>
              </span>
            )}
          </div>
        </div>

        {/* Actions & Chevron Indicator */}
        <div className="flex items-center gap-1 ml-1">
          {selectedProps && (
            <div
              role="button"
              onClick={handleClear}
              title="Deselect Bus"
              className="p-1 rounded-md hover:bg-theme-hover text-theme-muted hover:text-status-sos transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </div>
          )}
          <ChevronDown
            className={`w-4 h-4 text-theme-muted transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-brand-primary' : 'group-hover:text-brand-primary'
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu Popover Panel using Semantic Theme Tokens */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 sm:w-96 glass-panel-glow border border-brand-primary/30 rounded-2xl p-3 shadow-2xl z-50 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150 bg-theme-canvas/95 text-theme-main">
          {/* Instant Search Bar */}
          <div className="relative mb-2">
            <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by bus plate, ID, route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full bg-theme-card/90 border border-theme-border rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-theme-main placeholder:text-theme-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-main"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub-header Controls */}
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-mono text-theme-muted border-b border-theme-border/80 mb-2">
            <span>LIVE VEHICLES ({filteredFeatures.length})</span>
            {selectedBusId && (
              <button
                onClick={() => onSelectBus(null)}
                className="text-brand-primary hover:underline cursor-pointer"
              >
                Reset Map Camera
              </button>
            )}
          </div>

          {/* Scrollable Vehicle List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            {filteredFeatures.length === 0 ? (
              <div className="py-8 text-center text-theme-muted font-mono text-xs">
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
                        ? 'bg-brand-primary/15 border-brand-primary/50 text-theme-main shadow-lg shadow-brand-primary/10'
                        : 'bg-theme-card/40 border-theme-border/80 text-theme-muted hover:bg-theme-hover hover:border-brand-primary/30 hover:text-theme-main'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Pulsing Status Dot */}
                      <div className="relative flex h-2.5 w-2.5 shrink-0">
                        <span
                          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            isSos ? 'bg-status-sos' : isDelayed ? 'bg-status-delayed' : 'bg-status-active'
                          }`}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                            isSos ? 'bg-status-sos' : isDelayed ? 'bg-status-delayed' : 'bg-status-active'
                          }`}
                        />
                      </div>

                      {/* Bus Identification & Route info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-theme-main group-hover:text-brand-primary transition-colors">
                            {props.plateNumber || `BUS-${props.busId.slice(0, 4).toUpperCase()}`}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.2 text-[9px] rounded bg-brand-primary text-theme-canvas font-bold uppercase">
                              Target
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-theme-muted flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-brand-primary shrink-0" />
                          <span className="truncate max-w-[160px]">
                            {props.routeName || `Route ${props.routeId.slice(0, 6)}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Dynamic Telemetry Badges */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col items-end text-[10px]">
                        <span className="flex items-center gap-1 font-bold text-brand-primary">
                          <Gauge className="w-3 h-3" />
                          {props.speed} km/h
                        </span>
                        <span className="flex items-center gap-1 text-theme-muted">
                          <Users className="w-3 h-3 text-theme-muted" />
                          {props.passengerCount ?? 0}/{props.capacity ?? 55}
                        </span>
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-brand-primary text-theme-canvas flex items-center justify-center shrink-0">
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
