import React from 'react';
import { Home, Bus, MapPin, Settings } from 'lucide-react';

export type NavTab = 'home' | 'mybus' | 'routes' | 'settings';

interface MobileNavBarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  hasActiveBus: boolean;
}

export const MobileNavBar: React.FC<MobileNavBarProps> = ({
  activeTab,
  onTabChange,
  hasActiveBus,
}) => {
  const tabs = [
    { id: 'home' as const, label: 'Home', icon: Home },
    { id: 'mybus' as const, label: 'My Bus', icon: Bus, badge: hasActiveBus },
    { id: 'routes' as const, label: 'Routes', icon: MapPin },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-theme-card/95 backdrop-blur-2xl border-t border-theme-border px-3 pt-2 select-none shadow-[0_-8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.6)]"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
    >
      <div className="max-w-md mx-auto grid grid-cols-4 gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all duration-200 cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 text-amber-500 dark:text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.18)]'
                  : 'text-theme-muted hover:text-theme-main hover:bg-theme-hover'
              }`}
              style={{ minHeight: '52px' }}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Luminous Top Glow Bar on Active Tab */}
              {isActive && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <span className="w-8 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 rounded-full shadow-[0_0_12px_#f59e0b]" />
                </div>
              )}

              {/* Icon Container with Scale Animation */}
              <div className="relative">
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isActive
                      ? 'text-amber-500 dark:text-amber-400 scale-115 stroke-[2.5]'
                      : 'text-theme-muted stroke-[1.8]'
                  }`}
                />

                {/* Active Ride Live Indicator Dot on My Bus */}
                {tab.id === 'mybus' && hasActiveBus && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] tracking-tight mt-1 transition-colors ${
                  isActive
                    ? 'text-amber-600 dark:text-amber-300 font-extrabold'
                    : 'text-theme-muted font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileNavBar;
