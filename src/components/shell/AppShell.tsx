import { useState, type ReactNode } from 'react';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { MessagesPanel } from './MessagesPanel';
import { MeetupsScreen, MeridianScreen } from '../screens/PlaceholderScreens';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { AccountTier } from '../../lib/meridian';
import type { TabId } from './types';

interface AppShellProps {
  userEmail: string | undefined;
  locationLabel: string;
  onSignOut: () => void;
  /** Gates the Meridian nav entry and screen. See MeridianScreen for the route-level re-check. */
  accountTier: AccountTier;
  /**
   * The World pane. Rendered once and kept mounted for the shell's whole life --
   * see the overlay below. Receives the active flag so it can pause its render loop.
   */
  renderWorld: (active: boolean) => ReactNode;
}

export function AppShell({ userEmail, locationLabel, onSignOut, accountTier, renderWorld }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('world');
  const [messagesOpen, setMessagesOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isWorld = activeTab === 'world';
  const showMeridian = accountTier === 'enterprise';
  // Settings takes priority over whichever tab is active, exactly like Messages
  // already does with its own boolean/toggle -- it's a sibling overlay, not a nav
  // tab, so it isn't tied to activeTab at all.
  const showTabOverlay = !isWorld || settingsOpen;

  return (
    /*
     * flex-col-reverse below md, flex-row at md+: NavRail is the first child either
     * way, so this alone is what moves it from the bottom of a stacked mobile
     * layout to the left edge of a desktop row, with no JS breakpoint check and no
     * change to DOM/JSX order. NavRail itself decides which of its two rendered
     * variants (side rail vs bottom bar) is actually visible at a given width; this
     * container only decides where that visible one ends up.
     */
    <div className="w-full h-screen flex flex-col-reverse md:flex-row bg-dusk-900 overflow-hidden">
      <NavRail activeTab={activeTab} onSelect={setActiveTab} showMeridian={showMeridian} />

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <TopBar
          userEmail={userEmail}
          locationLabel={locationLabel}
          messagesOpen={messagesOpen}
          onToggleMessages={() => setMessagesOpen((open) => !open)}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
        />

        <div className="flex-1 min-h-0 flex">
          {/*
            The World pane is never unmounted. Switching tabs renders the other
            screen *over* it rather than replacing it, so the character keeps its
            position and the character model is not refetched on every tab change.

            Overlaying rather than hiding with `display:none` is deliberate: a
            display:none container reports clientWidth/clientHeight of 0, which
            would make the camera aspect NaN the moment the user came back.
          */}
          <main className="relative flex-1 min-w-0">
            {renderWorld(isWorld)}

            {showTabOverlay && (
              <div className="absolute inset-0 z-50">
                {settingsOpen ? (
                  <SettingsScreen onClose={() => setSettingsOpen(false)} onSignOut={onSignOut} />
                ) : (
                  <>
                    {activeTab === 'meetups' && <MeetupsScreen />}
                    {activeTab === 'meridian' && <MeridianScreen accountTier={accountTier} />}
                  </>
                )}
              </div>
            )}
          </main>

          {messagesOpen && <MessagesPanel onClose={() => setMessagesOpen(false)} />}
        </div>
      </div>
    </div>
  );
}
