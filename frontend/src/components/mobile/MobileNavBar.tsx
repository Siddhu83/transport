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
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#090d16]/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 select-none">
      <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all cursor-pointer relative active:scale-95 ${
                isActive
                  ? 'text-amber-400 font-bold bg-amber-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              style={{ minHeight: '48px' }}
            >
              {/* Subtle active pill indicator on top */}
              {isActive && (
                <span className="absolute -top-1.5 w-6 h-0.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400" />
              )}

              <div className="relative">
                <Icon className={`w-4 h-4 stroke-[2.2] ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                {tab.badge && !isActive && (
                  <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>

              <span className={`text-[10px] tracking-tight mt-1 ${isActive ? 'text-amber-300 font-bold' : 'text-slate-400 font-medium'}`}>
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
