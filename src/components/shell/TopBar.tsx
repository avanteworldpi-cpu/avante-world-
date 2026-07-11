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
    <header className="h-14 shrink-0 bg-gray-950 border-b border-gray-800 flex items-center gap-4 px-4">
      <span className="font-bold text-white tracking-tight whitespace-nowrap">Avante World</span>

      {/* Typing here must not drive the character. AvatarCharacter ignores key events
          whose target is a text field, so w/a/s/d and space reach this input intact. */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, places, listings"
          aria-label="Search"
          className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 border border-gray-800 text-xs text-gray-300 whitespace-nowrap">
        <MapPin className="w-3.5 h-3.5 text-blue-400" />
        {locationLabel}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleMessages}
          title="Messages"
          aria-label="Messages"
          aria-pressed={messagesOpen}
          className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            messagesOpen ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
          }`}
        >
          <MessageSquare className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-400 ring-2 ring-gray-950" />
        </button>

        <button
          title="Notifications"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-gray-950" />
        </button>

        <div
          title={userEmail}
          className="w-8 h-8 ml-1 rounded-full bg-blue-500 text-white text-sm font-semibold flex items-center justify-center select-none"
        >
          {initial}
        </div>

        <button
          onClick={onSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4.5 h-4.5" />
        </button>
      </div>
    </header>
  );
}
