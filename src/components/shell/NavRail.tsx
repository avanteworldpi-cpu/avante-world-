import { Globe, Compass, Users, Store, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TAB_LABELS, type TabId } from './types';

const TAB_ICONS: Record<TabId, LucideIcon> = {
  world: Globe,
  explore: Compass,
  meetups: Users,
  market: Store,
  agent: Bot,
};

const TABS: TabId[] = ['world', 'explore', 'meetups', 'market', 'agent'];

interface NavRailProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}

export function NavRail({ activeTab, onSelect }: NavRailProps) {
  return (
    <nav className="w-16 shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col items-center gap-1 py-4">
      {TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const isActive = tab === activeTab;

        return (
          <button
            key={tab}
            onClick={() => onSelect(tab)}
            title={TAB_LABELS[tab]}
            aria-label={TAB_LABELS[tab]}
            aria-current={isActive ? 'page' : undefined}
            className={`group relative w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r bg-blue-400" />
            )}
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-medium leading-none">{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </nav>
  );
}
