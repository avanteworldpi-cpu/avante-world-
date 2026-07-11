import { X, BadgeCheck } from 'lucide-react';

interface Conversation {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: boolean;
  verified?: boolean;
  accent: string;
}

/**
 * Placeholder data. There is no messaging backend: real-time DMs are a separate,
 * later piece of work. This panel exists to establish the shell's layout only.
 */
const PLACEHOLDER_CONVERSATIONS: Conversation[] = [
  {
    id: '1',
    name: 'Lerato K.',
    preview: "That rooftop spot in Braamfontein — still on for Saturday?",
    time: '2m',
    unread: true,
    accent: 'bg-purple-500',
  },
  {
    id: '2',
    name: 'Sipho B.',
    preview: 'Just listed the sneakers. Let me know what you think.',
    time: '1h',
    unread: true,
    accent: 'bg-emerald-500',
  },
  {
    id: '3',
    name: '4th Ave Coffee',
    preview: "You're near us! Show this message for 10% off today.",
    time: '3h',
    unread: false,
    verified: true,
    accent: 'bg-amber-500',
  },
];

interface MessagesPanelProps {
  onClose: () => void;
}

export function MessagesPanel({ onClose }: MessagesPanelProps) {
  return (
    <aside className="w-80 shrink-0 bg-gray-950 border-l border-gray-800 flex flex-col">
      <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white">Messages</h2>
        <button
          onClick={onClose}
          title="Close messages"
          aria-label="Close messages"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {PLACEHOLDER_CONVERSATIONS.map((c) => (
          <button
            key={c.id}
            className="w-full text-left px-4 py-3 flex gap-3 border-b border-gray-900 hover:bg-gray-900 transition-colors"
          >
            <div
              className={`w-9 h-9 shrink-0 rounded-full ${c.accent} text-white text-sm font-semibold flex items-center justify-center`}
            >
              {c.name[0]}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-sm font-medium text-gray-100 truncate">{c.name}</span>
                {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                <span className="ml-auto text-[11px] text-gray-600 shrink-0">{c.time}</span>
              </div>
              <p className={`text-xs truncate mt-0.5 ${c.unread ? 'text-gray-300' : 'text-gray-600'}`}>
                {c.preview}
              </p>
            </div>

            {c.unread && <span className="w-2 h-2 mt-2 shrink-0 rounded-full bg-blue-400" />}
          </button>
        ))}
      </div>

      <p className="shrink-0 px-4 py-3 border-t border-gray-800 text-[11px] text-gray-600">
        Placeholder conversations — messaging isn't wired up yet.
      </p>
    </aside>
  );
}
