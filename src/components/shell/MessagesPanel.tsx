import { useEffect, useState } from 'react';
import { X, SquarePen, ArrowLeft } from 'lucide-react';
import { VerificationRing } from '../ui/VerificationRing';
import { ConversationView } from './ConversationView';
import {
  listConversations,
  getOrCreateConversation,
  searchProfilesByEmail,
  type ConversationSummary,
  type Profile,
} from '../../lib/messaging';

interface MessagesPanelProps {
  onClose: () => void;
}

/**
 * Shared by both render paths below (list/new and conversation) so the two never
 * drift out of sync with each other.
 *
 * Below md: a partial-height bottom sheet, not the side panel -- a full-height
 * sheet was already explicitly rejected in an earlier mockup pass for breaking
 * the "presence in the world" feel, so World stays visible above it rather than
 * getting covered or dimmed (no backdrop). `bottom-16` clears NavRail's own
 * mobile bar (h-16) so the sheet sits above it, not under it. h-[45vh] is a
 * first guess, not a pinned value -- the mockup phase never settled on an exact
 * height, so this wants a visual pass to confirm 45% actually feels right
 * against a real phone viewport rather than being re-guessed blind.
 *
 * At md+: the original side panel, unchanged -- a flex sibling of `<main>`
 * rather than a positioned overlay, exactly as before this pass.
 */
const MESSAGES_PANEL_CLASSES =
  'fixed inset-x-0 bottom-16 z-50 h-[45vh] rounded-t-xl border-t border-dusk-800 shadow-2xl ' +
  'md:static md:inset-auto md:bottom-auto md:z-auto md:h-auto md:rounded-none md:shadow-none ' +
  'md:w-80 md:shrink-0 md:border-t-0 md:border-l ' +
  'bg-dusk-950 flex flex-col';

/** Compact relative time for a thread-list row, e.g. "2m", "3h", "5d". */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

type PanelView =
  | { mode: 'list' }
  | { mode: 'new' }
  | { mode: 'conversation'; conversationId: string; otherUser: Profile };

export function MessagesPanel({ onClose }: MessagesPanelProps) {
  const [view, setView] = useState<PanelView>({ mode: 'list' });
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  async function refreshConversations() {
    setLoading(true);
    setConversations(await listConversations());
    setLoading(false);
  }

  useEffect(() => {
    if (view.mode === 'list') {
      refreshConversations();
    }
  }, [view.mode]);

  useEffect(() => {
    if (view.mode !== 'new') return;
    const query = searchQuery;
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(async () => {
      setSearchResults(await searchProfilesByEmail(query));
      setSearching(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery, view.mode]);

  async function openConversationWith(profile: Profile) {
    const conversationId = await getOrCreateConversation(profile.id);
    if (conversationId) {
      setView({ mode: 'conversation', conversationId, otherUser: profile });
    }
  }

  async function openExistingConversation(c: ConversationSummary) {
    setView({ mode: 'conversation', conversationId: c.id, otherUser: c.otherUser });
  }

  if (view.mode === 'conversation') {
    return (
      <aside className={MESSAGES_PANEL_CLASSES}>
        <ConversationView
          conversationId={view.conversationId}
          otherUser={view.otherUser}
          onBack={() => setView({ mode: 'list' })}
        />
      </aside>
    );
  }

  return (
    <aside className={MESSAGES_PANEL_CLASSES}>
      <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-dusk-800">
        {view.mode === 'new' ? (
          <>
            <button
              onClick={() => setView({ mode: 'list' })}
              title="Back to conversations"
              aria-label="Back to conversations"
              className="w-8 h-8 -ml-2 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="font-display text-sm font-semibold text-dusk-50">New message</h2>
          </>
        ) : (
          <h2 className="font-display text-sm font-semibold text-dusk-50">Messages</h2>
        )}

        <div className="flex items-center gap-1">
          {view.mode === 'list' && (
            <button
              onClick={() => setView({ mode: 'new' })}
              title="New message"
              aria-label="New message"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
            >
              <SquarePen className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            title="Close messages"
            aria-label="Close messages"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view.mode === 'new' ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="p-3 border-b border-dusk-800">
            <input
              autoFocus
              type="email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email..."
              className="w-full rounded-lg bg-dusk-800 text-dusk-100 placeholder:text-dusk-400 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {searching && (
              <p className="px-4 py-3 text-xs text-dusk-400">Searching...</p>
            )}
            {!searching && searchQuery.trim() && searchResults.length === 0 && (
              <p className="px-4 py-3 text-xs text-dusk-400">No matching users.</p>
            )}
            {searchResults.map((profile) => (
              <button
                key={profile.id}
                onClick={() => openConversationWith(profile)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 border-b border-dusk-900 hover:bg-dusk-900 transition-colors"
              >
                <div className="w-9 h-9 shrink-0 rounded-full bg-dusk-700 text-dusk-100 text-sm font-semibold flex items-center justify-center">
                  {profile.display_name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-dusk-100 truncate">
                    {profile.display_name}
                  </div>
                  <div className="text-xs text-dusk-400 truncate">{profile.email}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="px-4 py-3 text-xs text-dusk-400">Loading...</p>}

          {!loading && conversations.length === 0 && (
            <p className="px-4 py-3 text-xs text-dusk-400">
              No conversations yet. Start one with the compose button above.
            </p>
          )}

          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openExistingConversation(c)}
              className="w-full text-left px-4 py-3 flex gap-3 border-b border-dusk-900 hover:bg-dusk-900 transition-colors"
            >
              <div className="w-9 h-9 shrink-0 rounded-full bg-dusk-700 text-dusk-100 text-sm font-semibold flex items-center justify-center">
                {c.otherUser.display_name[0]?.toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-dusk-100 truncate">
                    {c.otherUser.display_name}
                  </span>
                  {/* The one sanctioned home of the ring: trust, and nothing else. */}
                  {c.verification !== undefined && (
                    <VerificationRing progress={c.verification} size={14} strokeWidth={2} className="shrink-0" />
                  )}
                  {c.lastMessage && (
                    <span className="ml-auto text-[11px] text-dusk-400 shrink-0">
                      {formatRelativeTime(c.lastMessage.created_at)}
                    </span>
                  )}
                </div>
                <p className="text-xs truncate mt-0.5 text-dusk-400">
                  {c.lastMessage?.body ?? 'No messages yet'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
