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

/**
 * Renders both the desktop side rail and the mobile bottom bar unconditionally,
 * toggling which is actually visible via Tailwind's `md:` breakpoint (matches
 * tailwind.config.js's stock 768px -- no custom screens defined there) rather than
 * a JS media-query check. AppShell's outer flex container is what actually moves
 * this element from the left edge to the bottom of the screen (flex-col-reverse
 * below md, flex-row at md+) -- this component only decides which of the two
 * variants is visible, not where either one sits.
 */
export function NavRail({ activeTab, onSelect, showMeridian }: NavRailProps) {
  const tabs: TabId[] = showMeridian ? ['world', 'meetups', 'meridian'] : ['world', 'meetups'];

  return (
    <>
      {/* Desktop: left side rail, unchanged from before this pass. */}
      <nav className="hidden md:flex w-16 shrink-0 bg-dusk-950 border-r border-dusk-800 flex-col items-center gap-1 py-4">
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

      {/* Mobile: bottom tab bar, same tabs -- Pi Browser is mobile-first, and a 64px
          side rail has no room to exist below md. Safe-area padding keeps the bar
          clear of a notched phone's home indicator rather than sitting under it. */}
      <nav className="flex md:hidden w-full h-16 shrink-0 bg-dusk-950 border-t border-dusk-800 items-center justify-around pb-[env(safe-area-inset-bottom)]">
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
              className={`group relative flex-1 h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-accent' : 'text-dusk-400'
              }`}
            >
              {/* Top-edge indicator, not the rail's left-edge one -- a vertical bar
                  reads as a side-rail affordance and wouldn't make sense pinned to
                  the left of a button in a horizontal bar. */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-b bg-accent" />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{TAB_LABELS[tab]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
