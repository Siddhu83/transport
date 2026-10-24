import { Radio, ArrowLeft, Search, X, Bus } from 'lucide-react';

interface MobileHeaderProps {
  activeTab: 'home' | 'mybus' | 'routes' | 'settings';
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onBackToHome: () => void;
  selectedBusPlate?: string;
  selectedBusName?: string;
  selectedRouteName?: string;
  latencyMs?: number | null;
  isConnected: boolean;
  totalBusesCount?: number;
  isFullscreen?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  activeTab,
  searchQuery,
  onSearchChange,
  onBackToHome,
  selectedBusPlate,
  selectedBusName,
  selectedRouteName,
  latencyMs,
  isConnected,
  totalBusesCount = 0,
  isFullscreen = false,
}) => {
  // Static time-based greeting (Zero DB fetch, zero user-name logic)
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning 👋';
    if (hour < 17) return 'Good Afternoon 👋';
    return 'Good Evening 👋';
  };

  const dynamicBusTitle = selectedBusName || selectedBusPlate || 'FLEET BUS';
  const topPadding = isFullscreen
    ? 'max(env(safe-area-inset-top, 0px), 2rem)'
    : 'max(env(safe-area-inset-top, 0px), 2.75rem)';

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 pointer-events-none px-3 sm:px-4 transition-[padding] duration-200"
      style={{ paddingTop: topPadding }}
    >
      <div className="max-w-md mx-auto pointer-events-auto space-y-2">
        {/* State A: Home / Fleet Explorer Mode */}
        {activeTab === 'home' && (
          <div className="glass-panel rounded-2xl p-3.5 shadow-xl border border-theme-border space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-sm font-extrabold tracking-tight text-theme-main flex items-center gap-1.5">
                  {getGreeting()}
                </h1>
                <p className="text-[11px] text-theme-muted mt-0.5">
                  ANITS Campus Transit • <span className="text-emerald-600 dark:text-emerald-400 font-bold">{totalBusesCount} Buses Active</span>
                </p>
              </div>

              {/* Minimal SSE Latency Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-theme-card-subtle border border-theme-border font-mono text-[10px]">
                <Radio
                  className={`w-3 h-3 ${
                    isConnected ? 'text-emerald-500 dark:text-emerald-400 animate-pulse' : 'text-amber-500 dark:text-amber-400'
                  }`}
                />
                <span className={isConnected ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-amber-600 dark:text-amber-400'}>
                  {isConnected ? `${latencyMs ?? 16}ms` : 'Connecting'}
                </span>
              </div>
            </div>

            {/* Minimal Search Bar (Theme-aware background & borders) */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-theme-muted absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search bus number (e.g. 101) or corridor..."
                className="w-full bg-theme-card-subtle border border-theme-border rounded-xl pl-9 pr-8 py-2 text-xs text-theme-main placeholder:text-theme-muted focus:outline-none focus:border-amber-500/60 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2.5 top-2.5 p-0.5 text-theme-muted hover:text-theme-main transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* State B: In-Ride Active Tracker Mode - Mathematically Centered 3-Column Grid */}
        {activeTab === 'mybus' && (
          <div className="glass-panel rounded-2xl px-3.5 py-2.5 shadow-xl border border-theme-border grid grid-cols-[1fr_auto_1fr] items-center">
            {/* Left Column (aligned start) */}
            <div className="flex justify-start">
              <button
                onClick={onBackToHome}
                className="flex items-center gap-1.5 text-xs font-bold text-theme-muted hover:text-theme-main bg-theme-hover px-2.5 py-1.5 rounded-xl border border-theme-border transition-colors active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Fleet Map</span>
              </button>
            </div>

            {/* Center Column (precisely centered with respect to screen dimensions) */}
            <div className="text-center max-w-[200px] px-1 justify-self-center">
              <h2 className="text-xs font-black tracking-wider uppercase text-theme-main flex items-center gap-1.5 justify-center truncate">
                <Bus className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="truncate">{dynamicBusTitle}</span>
              </h2>
              {selectedRouteName ? (
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono truncate max-w-[180px]">
                  {selectedRouteName}
                </p>
              ) : (
                <p className="text-[10px] text-theme-muted">Live Tracking</p>
              )}
            </div>

            {/* Right Column (aligned end) */}
            <div className="flex justify-end">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-theme-card-subtle border border-theme-border font-mono text-[10px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping"></span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">LIVE</span>
              </div>
            </div>
          </div>
        )}

        {/* State C: Routes Directory Header */}
        {activeTab === 'routes' && (
          <div className="glass-panel rounded-2xl px-4 py-3 shadow-xl border border-theme-border flex items-center justify-between">
            <div>
              <h1 className="text-xs font-black tracking-wider uppercase text-theme-main">
                Transit Corridors
              </h1>
              <p className="text-[10px] text-theme-muted">Campus Express Route Network</p>
            </div>
            <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md">
              4 Corridors
            </span>
          </div>
        )}

        {/* State D: Settings Header */}
        {activeTab === 'settings' && (
          <div className="glass-panel rounded-2xl px-4 py-3 shadow-xl border border-theme-border flex items-center justify-between">
            <div>
              <h1 className="text-xs font-black tracking-wider uppercase text-theme-main">
                Preferences & System
              </h1>
              <p className="text-[10px] text-theme-muted">Theme, Telemetry & App Diagnostics</p>
            </div>
            <span className="text-[10px] font-mono text-theme-muted bg-theme-card-subtle px-2 py-0.5 rounded border border-theme-border">
              v1.0.0
            </span>
          </div>
        )}
      </div>
    </header>
  );
};

export default MobileHeader;
