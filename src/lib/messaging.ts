import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  otherUser: Profile;
  lastMessage: Message | null;
  /**
   * 0-1, or undefined. PLACEHOLDER, same as VerificationRing's own prop -- no
   * verified/business-account concept exists in this schema, so this is never
   * populated. Kept only so MessagesPanel's existing VerificationRing slot stays
   * wired exactly as it was, ready for whenever that concept exists.
   */
  verification?: number;
}

/** Finds or creates the single 1:1 thread with another user. See get_or_create_conversation(). */
export async function getOrCreateConversation(otherUserId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_conversation', {
      other_user_id: otherUserId,
    });

    if (error) {
      console.error('Error getting or creating conversation:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getOrCreateConversation:', error);
    return null;
  }
}

/**
 * Every conversation the current user is a participant in, each paired with the
 * other participant's profile and their most recent message (if any). One query
 * for conversations, one for profiles, one for messages -- avoids an N+1 per row
 * since this is meant to back a single thread-list render.
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id, user_a_id, user_b_id')
      .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`);

    if (convError) {
      console.error('Error fetching conversations:', convError);
      return [];
    }
    if (!conversations || conversations.length === 0) return [];

    const otherIdByConversation = new Map<string, string>();
    conversations.forEach((c) => {
      otherIdByConversation.set(c.id, c.user_a_id === user.id ? c.user_b_id : c.user_a_id);
    });
    const otherIds = Array.from(new Set(otherIdByConversation.values()));
    const conversationIds = conversations.map((c) => c.id);

    const [{ data: profiles, error: profilesError }, { data: messages, error: messagesError }] =
      await Promise.all([
        supabase.from('profiles').select('id, email, display_name').in('id', otherIds),
        supabase
          .from('messages')
          .select('id, conversation_id, sender_id, body, created_at')
          .in('conversation_id', conversationIds)
          .order('created_at', { ascending: false }),
      ]);

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return [];
    }
    if (messagesError) {
      console.error('Error fetching last messages:', messagesError);
    }

    const profileById = new Map((profiles || []).map((p) => [p.id, p as Profile]));
    const lastMessageByConversation = new Map<string, Message>();
    (messages || []).forEach((m) => {
      // Ordered by created_at desc, so the first one seen per conversation is the latest.
      if (!lastMessageByConversation.has(m.conversation_id)) {
        lastMessageByConversation.set(m.conversation_id, m as Message);
      }
    });

    return conversations
      .map((c) => {
        const otherId = otherIdByConversation.get(c.id)!;
        const otherUser = profileById.get(otherId);
        if (!otherUser) return null;
        return {
          id: c.id,
          otherUser,
          lastMessage: lastMessageByConversation.get(c.id) || null,
        };
      })
      .filter((c): c is ConversationSummary => c !== null)
      .sort((a, b) => {
        const aTime = a.lastMessage?.created_at ?? '';
        const bTime = b.lastMessage?.created_at ?? '';
        return bTime.localeCompare(aTime);
      });
  } catch (error) {
    console.error('Error in listConversations:', error);
    return [];
  }
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in listMessages:', error);
    return [];
  }
}

export async function sendMessage(conversationId: string, body: string): Promise<Message | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: user.id, body })
      .select('id, conversation_id, sender_id, body, created_at')
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return null;
  }
}

/** Subscribes to new messages in one conversation. Caller must remove the channel on cleanup. */
export function subscribeToConversation(
  conversationId: string,
  onInsert: (message: Message) => void
): RealtimeChannel {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as Message)
    )
    .subscribe();
}

/** Backs the "new message" recipient picker. Excludes the current user. */
export async function searchProfilesByEmail(query: string): Promise<Profile[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const { data: { user } } = await supabase.auth.getUser();

    let request = supabase
      .from('profiles')
      .select('id, email, display_name')
      .ilike('email', `%${trimmed}%`)
      .limit(10);

    if (user) {
      request = request.neq('id', user.id);
    }

    const { data, error } = await request;

    if (error) {
      console.error('Error searching profiles:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in searchProfilesByEmail:', error);
    return [];
  }
}
