/*
  # 1:1 direct messaging: conversations + messages

  1. New Tables
    - `conversations`
      - exactly two participants, `user_a_id`/`user_b_id`, canonically ordered
        (`user_a_id < user_b_id`) so a plain UNIQUE constraint enforces "at most one
        thread per pair" without a separate participants join table -- that shape
        only earns its keep once a conversation can have more than 2 members, which
        is explicitly out of scope for this pass.
    - `messages`
      - `conversation_id`, `sender_id`, `body`, `created_at`. No edit/delete/read-receipt
        columns -- none of that is in scope.

  2. Security
    - conversations: SELECT/INSERT restricted to rows where auth.uid() is one of the
      two participants. No UPDATE/DELETE policy (no leaving/renaming a conversation
      in this pass).
    - messages: SELECT/INSERT restricted via EXISTS against the parent conversation's
      participants. INSERT additionally requires auth.uid() = sender_id, so a user can
      only ever send as themselves.

  3. get_or_create_conversation(other_user_id)
    - SECURITY INVOKER (the default) -- deliberately NOT security definer. It runs as
      the calling user, so the existing conversations INSERT policy is still the
      authority; the function only centralizes the user_a/user_b ordering so client
      code can never send an ON CONFLICT target that doesn't match the actual unique
      index (that exact class of bug -- upsert target vs. real constraint mismatch --
      previously broke user_avatar_selections in this project).

  4. Realtime
    - messages added to the supabase_realtime publication so postgres_changes
      subscriptions work. Delivery is still gated by the SELECT policy above -- a
      subscriber only receives rows their own RLS would let them read.
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  CHECK (user_a_id < user_b_id),
  UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id_created_at ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_user_a_id ON conversations(user_a_id);
CREATE INDEX idx_conversations_user_b_id ON conversations(user_b_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their conversations"
  ON conversations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Participants can create conversations they're in"
  ON conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "Participants can view messages in their conversations"
  ON messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

CREATE POLICY "Participants can send messages as themselves"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  me uuid := auth.uid();
  a uuid;
  b uuid;
  conv_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF me = other_user_id THEN
    RAISE EXCEPTION 'cannot start a conversation with yourself';
  END IF;

  a := LEAST(me, other_user_id);
  b := GREATEST(me, other_user_id);

  INSERT INTO conversations (user_a_id, user_b_id)
  VALUES (a, b)
  ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

  SELECT id INTO conv_id FROM conversations WHERE user_a_id = a AND user_b_id = b;
  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
