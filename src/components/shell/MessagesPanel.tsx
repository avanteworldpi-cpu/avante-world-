import { X } from 'lucide-react';
import { VerificationRing } from '../ui/VerificationRing';

interface Conversation {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: boolean;
  /**
   * 0-1, or undefined for parties where verification doesn't apply.
   *
   * PLACEHOLDER VALUES. No trust score exists to derive these from -- see
   * VerificationRing. 1 renders a closed ring (verified); anything less renders a
   * partial arc (still building trust).
   */
  verification?: number;
  avatarBg: string;
}

/**
 * Placeholder data. There is no messaging backend: real-time DMs are a separate, later
 * piece of work. This panel exists to establish the shell's layout only.
 */
const PLACEHOLDER_CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    name: 'Lerato K.',
    preview: 'That rooftop spot in Braamfontein — still on for Saturday?',
    time: '2m',
    unread: true,
    avatarBg: 'bg-dusk-700',
  },
  {
    id: '2',
    name: 'Sipho B.',
    preview: 'Just listed the sneakers. Let me know what you think.',
    time: '1h',
    unread: true,
    // Partial arc: a seller still building trust. Illustrative only.
    verification: 0.6,
    avatarBg: 'bg-dusk-700',
  },
  {
    id: '3',
    name: '4th Ave Coffee',
    preview: "You're near us! Show this message for 10% off today.",
    time: '3h',
    unread: false,
    // Closed ring: a verified business.
    verification: 1,
    avatarBg: 'bg-dusk-700',
  },
];

interface MessagesPanelProps {
  onClose: () => void;
}

export function MessagesPanel({ onClose }: MessagesPanelProps) {
  return (
    <aside className="w-80 shrink-0 bg-dusk-950 border-l border-dusk-800 flex flex-col">
      <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-dusk-800">
        <h2 className="font-display text-sm font-semibold text-dusk-50">Messages</h2>
        <button
          onClick={onClose}
          title="Close messages"
          aria-label="Close messages"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {PLACEHOLDER_CONVERSATIONS.map((c) => (
          <button
            key={c.id}
            className="w-full text-left px-4 py-3 flex gap-3 border-b border-dusk-900 hover:bg-dusk-900 transition-colors"
          >
            <div
              className={`w-9 h-9 shrink-0 rounded-full ${c.avatarBg} text-dusk-100 text-sm font-semibold flex items-center justify-center`}
            >
              {c.name[0]}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-dusk-100 truncate">{c.name}</span>
                {/* The one sanctioned home of the ring: trust, and nothing else. */}
                {c.verification !== undefined && (
                  <VerificationRing progress={c.verification} size={14} strokeWidth={2} className="shrink-0" />
                )}
                {/* dusk-400, not the old gray-600 (2.1:1) -- timestamps are still text. */}
                <span className="ml-auto text-[11px] text-dusk-400 shrink-0">{c.time}</span>
              </div>
              <p className={`text-xs truncate mt-0.5 ${c.unread ? 'text-dusk-300' : 'text-dusk-400'}`}>
                {c.preview}
              </p>
            </div>

            {c.unread && <span className="w-2 h-2 mt-2 shrink-0 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <p className="shrink-0 px-4 py-3 border-t border-dusk-800 text-[11px] text-dusk-400">
        Placeholder conversations — messaging isn't wired up yet.
      </p>
    </aside>
  );
}
