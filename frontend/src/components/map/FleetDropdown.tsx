import React, { useState, useRef, useEffect } from 'react';
import { Bus, ChevronDown, Search, X, Check, ShieldAlert } from 'lucide-react';
import { VehicleFeatureProperties } from './FleetCanvas';

export interface FleetDropdownProps {
  geoJsonData: GeoJSON.FeatureCollection<GeoJSON.Point, VehicleFeatureProperties>;
  selectedBusId: string | null;
  onSelectBus: (busId: string | null) => void;
}

export const FleetDropdown: React.FC<FleetDropdownProps> = ({
  geoJsonData,
  selectedBusId,
  onSelectBus,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter features based on search query
  const features = geoJsonData?.features || [];
  const filteredFeatures = features.filter((feature: any) => {
    const props = feature.properties;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      props.busId?.toLowerCase().includes(query) ||
      props.plateNumber?.toLowerCase().includes(query) ||
      props.routeName?.toLowerCase().includes(query)
    );
  });

  // Selected feature details
  const selectedFeature = features.find((f: any) => f.properties.busId === selectedBusId);
  const selectedProps = selectedFeature?.properties;

  const handleToggle = () => setIsOpen((prev) => !prev);

  const handleSelect = (busId: string) => {
    onSelectBus(busId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectBus(null);
  };

  const activeCount = features.length;

  return (
    <div className="relative font-sans" ref={dropdownRef}>
      {/* Trigger Button using Semantic Theme Tokens */}
      <button
        onClick={handleToggle}
        className={`flex items-center gap-3 px-3.5 py-2 rounded-xl transition-all duration-200 glass-panel border shadow-lg cursor-pointer ${
          isOpen
            ? 'border-brand-primary/60 ring-2 ring-brand-primary/20 bg-theme-hover'
            : 'border-theme-border hover:border-brand-primary/40'
        }`}
        title="Select Target Bus from Fleet"
      >
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
        <div className="flex flex-col items-start text-left font-sans">
          <div className="text-[10px] uppercase tracking-wider text-theme-muted font-semibold flex items-center gap-1.5 font-sans">
            <span>Target Fleet</span>
            <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse" />
          </div>

          <div className="text-xs font-bold flex items-center gap-2 font-sans">
            {selectedProps ? (
              <>
                <span className="text-theme-main font-sans">
                  {selectedProps.plateNumber || `BUS-${selectedProps.busId.slice(0, 4).toUpperCase()}`}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-brand-primary/20 text-brand-primary font-mono font-normal tabular-nums">
                  {selectedProps.speed} km/h
                </span>
              </>
            ) : (
              <span className="text-theme-main font-sans">
                Select Vehicle <span className="text-theme-muted font-normal font-sans">({activeCount} Active)</span>
              </span>
            )}
          </div>
        </div>

        {/* Actions & Chevron Indicator */}
        <div className="flex items-center gap-1 ml-1 font-sans">
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
        <div className="absolute top-full left-0 mt-2 w-80 sm:w-96 glass-panel-glow border border-brand-primary/30 rounded-2xl p-3 shadow-2xl z-50 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150 bg-theme-canvas/95 text-theme-main font-sans">
          {/* Instant Search Bar */}
          <div className="relative mb-2 font-sans">
            <Search className="w-4 h-4 text-theme-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by bus plate, ID, route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full bg-theme-card/90 border border-theme-border rounded-xl pl-9 pr-8 py-2 text-xs font-sans text-theme-main placeholder:text-theme-muted focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-main font-sans"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sub-header Controls */}
          <div className="flex items-center justify-between px-2 py-1.5 text-[10px] font-sans text-theme-muted border-b border-theme-border/80 mb-2">
            <span className="font-sans font-semibold">LIVE VEHICLES ({filteredFeatures.length})</span>
            {selectedBusId && (
              <button
                onClick={() => onSelectBus(null)}
                className="text-brand-primary hover:underline cursor-pointer font-sans"
              >
                Reset Map Camera
              </button>
            )}
          </div>

          {/* Scrollable Vehicle List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar font-sans">
            {filteredFeatures.length === 0 ? (
              <div className="py-8 text-center text-theme-muted font-sans text-xs">
                No active buses match &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredFeatures.map((feature: any) => {
                const props = feature.properties;
                const isSelected = selectedBusId === props.busId;
                const isSos = props.status === 'SOS';
                const isDelayed = props.status === 'DELAYED';

                return (
                  <button
                    key={props.busId}
                    onClick={() => handleSelect(props.busId)}
                    className={`w-full text-left p-2.5 rounded-xl transition-all duration-150 flex items-center justify-between font-sans group cursor-pointer border ${
                      isSelected
                        ? 'bg-brand-primary/15 border-brand-primary/50 text-theme-main shadow-lg shadow-brand-primary/10'
                        : 'bg-theme-card/40 border-theme-border/80 text-theme-muted hover:bg-theme-hover hover:border-brand-primary/30 hover:text-theme-main'
                    }`}
                  >
                    <div className="flex items-center gap-3 font-sans">
                      {/* Pulsing Status Dot */}
                      <div className="relative flex h-2.5 w-2.5 shrink-0 font-sans">
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
                      <div className="flex flex-col text-left font-sans">
                        <span className="text-xs font-bold text-theme-main flex items-center gap-1.5 font-sans">
                          {props.plateNumber || `BUS-${props.busId.slice(0, 4).toUpperCase()}`}
                          {isSos && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-status-sos/20 text-status-sos font-extrabold flex items-center gap-0.5 uppercase font-sans">
                              <ShieldAlert className="w-2.5 h-2.5" /> SOS
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-theme-muted truncate max-w-[160px] font-sans">
                          {props.routeName || 'Sector Express Corridor'}
                        </span>
                      </div>
                    </div>

                    {/* Speed & Selection Indicator */}
                    <div className="flex items-center gap-2 font-sans">
                      <span className="text-xs font-bold text-brand-primary font-mono tabular-nums">
                        {props.speed} <span className="text-[9px] font-normal text-theme-muted font-sans">km/h</span>
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-brand-primary shrink-0" />}
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
export default FleetDropdown;
