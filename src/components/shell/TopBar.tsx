import { useState } from 'react';
import { Search, MapPin, Bell, MessageSquare, LogOut } from 'lucide-react';

interface TopBarProps {
  userEmail: string | undefined;
  locationLabel: string;
  messagesOpen: boolean;
  onToggleMessages: () => void;
  onSignOut: () => void;
}

export function TopBar({
  userEmail,
  locationLabel,
  messagesOpen,
  onToggleMessages,
  onSignOut,
}: TopBarProps) {
  const [query, setQuery] = useState('');
  const initial = (userEmail?.[0] ?? '?').toUpperCase();

  return (
    <header className="h-14 shrink-0 bg-dusk-950 border-b border-dusk-800 flex items-center gap-4 px-4">
      <span className="font-display text-lg font-semibold text-dusk-50 tracking-tight whitespace-nowrap">
        Avante World
      </span>

      {/* Typing here must not drive the character. AvatarCharacter ignores key events
          whose target is a text field, so w/a/s/d and space reach this input intact. */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dusk-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, places, listings"
          aria-label="Search"
          /* Placeholder at dusk-400, not 500/600: the old gray-600 was 2.1:1, badly
             failing AA. The accent focus ring (8.9:1) is the real affordance here --
             hairline borders in a dark UI can't carry that weight on their own. */
          className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-dusk-900 border border-dusk-700 text-sm text-dusk-100 placeholder:text-dusk-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
        />
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dusk-900 border border-dusk-800 text-xs text-dusk-300 whitespace-nowrap">
        {/* Muted, not accent: a decorative pin isn't one of the three sanctioned
            accent contexts, and amber here would start to spread. */}
        <MapPin className="w-3.5 h-3.5 text-dusk-400" />
        {locationLabel}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleMessages}
          title="Messages"
          aria-label="Messages"
          aria-pressed={messagesOpen}
          className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            messagesOpen ? 'bg-accent/10 text-accent' : 'text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800'
          }`}
        >
          <MessageSquare className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent ring-2 ring-dusk-950" />
        </button>

        <button
          title="Notifications"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
        >
          <Bell className="w-4.5 h-4.5" />
          {/* danger, not accent: an alert is urgency, not brand identity. */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger ring-2 ring-dusk-950" />
        </button>

        {/* dusk-700, not accent. This is a solid 32px disc -- in amber it becomes the
            loudest object in the bar and the accent stops reading as sparing. */}
        <div
          title={userEmail}
          className="w-8 h-8 ml-1 rounded-full bg-dusk-700 text-dusk-100 text-sm font-semibold flex items-center justify-center select-none"
        >
          {initial}
        </div>

        <button
          onClick={onSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" />
        </button>
      </div>
    </header>
  );
}
