import { useState, type ReactNode } from 'react';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';
import { MessagesPanel } from './MessagesPanel';
import { ExploreScreen, MeetupsScreen, MarketScreen, AgentScreen } from '../screens/PlaceholderScreens';
import type { TabId } from './types';

interface AppShellProps {
  userEmail: string | undefined;
  locationLabel: string;
  onSignOut: () => void;
  /**
   * The World pane. Rendered once and kept mounted for the shell's whole life --
   * see the overlay below. Receives the active flag so it can pause its render loop.
   */
  renderWorld: (active: boolean) => ReactNode;
}

export function AppShell({ userEmail, locationLabel, onSignOut, renderWorld }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('world');
  const [messagesOpen, setMessagesOpen] = useState(true);

  const isWorld = activeTab === 'world';

  return (
    <div className="w-full h-screen flex bg-gray-900 overflow-hidden">
      <NavRail activeTab={activeTab} onSelect={setActiveTab} />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          userEmail={userEmail}
          locationLabel={locationLabel}
          messagesOpen={messagesOpen}
          onToggleMessages={() => setMessagesOpen((open) => !open)}
          onSignOut={onSignOut}
        />

        <div className="flex-1 min-h-0 flex">
          {/*
            The World pane is never unmounted. Switching tabs renders the other
            screen *over* it rather than replacing it, so the character keeps its
            position and character.glb is not refetched on every tab change.

            Overlaying rather than hiding with `display:none` is deliberate: a
            display:none container reports clientWidth/clientHeight of 0, which
            would make the camera aspect NaN the moment the user came back.
          */}
          <main className="relative flex-1 min-w-0">
            {renderWorld(isWorld)}

            {!isWorld && (
              <div className="absolute inset-0 z-50">
                {activeTab === 'explore' && <ExploreScreen />}
                {activeTab === 'meetups' && <MeetupsScreen />}
                {activeTab === 'market' && <MarketScreen />}
                {activeTab === 'agent' && <AgentScreen />}
              </div>
            )}
          </main>

          {messagesOpen && <MessagesPanel onClose={() => setMessagesOpen(false)} />}
        </div>
      </div>
    </div>
  );
}
