import { Globe, Users, Landmark } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { TAB_LABELS, type TabId } from './types';

const TAB_ICONS: Record<TabId, LucideIcon> = {
  world: Globe,
  meetups: Users,
  meridian: Landmark,
};

interface NavRailProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  /**
   * Meridian is a gated B2B/institutional offering (see MeridianScreen). Hiding it
   * with CSS would still ship it to every client -- excluding it from this array is
   * what actually keeps it out of the DOM for non-enterprise accounts.
   */
  showMeridian: boolean;
}

export function NavRail({ activeTab, onSelect, showMeridian }: NavRailProps) {
  const tabs: TabId[] = showMeridian ? ['world', 'meetups', 'meridian'] : ['world', 'meetups'];

  return (
    <nav className="w-16 shrink-0 bg-dusk-950 border-r border-dusk-800 flex flex-col items-center gap-1 py-4">
      {tabs.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const isActive = tab === activeTab;

        return (
          <button
            key={tab}
            onClick={() => onSelect(tab)}
            title={TAB_LABELS[tab]}
            aria-label={TAB_LABELS[tab]}
            aria-current={isActive ? 'page' : undefined}
            /*
             * The active state gets its own treatment -- a tinted surface plus an accent
             * edge bar -- rather than the verification ring. "Active" is navigation state,
             * not trust, and reusing the ring here would erode what a closed ring means
             * for exactly the reason it was kept off the minimap.
             *
             * dusk-400 (not 500) for the inactive label: 500 fails AA as text.
             */
            className={`group relative w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors ${
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-dusk-400 hover:text-dusk-200 hover:bg-dusk-800/60'
            }`}
          >
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r bg-accent" />
            )}
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-medium leading-none">{TAB_LABELS[tab]}</span>
          </button>
        );
      })}
    </nav>
  );
}
