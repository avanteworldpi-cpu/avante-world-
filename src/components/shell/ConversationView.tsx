import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  listMessages,
  sendMessage,
  subscribeToConversation,
  type Message,
  type Profile,
} from '../../lib/messaging';

interface ConversationViewProps {
  conversationId: string;
  otherUser: Profile;
  onBack: () => void;
}

export function ConversationView({ conversationId, otherUser, onBack }: ConversationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled) setCurrentUserId(user?.id ?? null);
    });

    listMessages(conversationId).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });

    const channel = subscribeToConversation(conversationId, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setDraft('');
    const sent = await sendMessage(conversationId, body);
    setSending(false);

    if (sent) {
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } else {
      // Give the draft back so the user doesn't lose what they typed.
      setDraft(body);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-14 shrink-0 px-2 flex items-center gap-2 border-b border-dusk-800">
        <button
          onClick={onBack}
          title="Back to conversations"
          aria-label="Back to conversations"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-dusk-400 hover:text-dusk-100 hover:bg-dusk-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-dusk-100 truncate">
          {otherUser.display_name}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages.map((m) => {
          const isOwn = m.sender_id === currentUserId;
          return (
            <div
              key={m.id}
              className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm break-words ${
                isOwn
                  ? 'self-end bg-dusk-700 text-dusk-100 rounded-br-sm'
                  : 'self-start bg-dusk-800 text-dusk-100 rounded-bl-sm'
              }`}
            >
              {m.body}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 p-3 border-t border-dusk-800 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message..."
          rows={1}
          className="flex-1 resize-none rounded-lg bg-dusk-800 text-dusk-100 placeholder:text-dusk-400 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent max-h-24"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          title="Send"
          aria-label="Send message"
          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center bg-dusk-700 text-dusk-100 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-dusk-600 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
