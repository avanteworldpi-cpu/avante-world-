/*
  # Account tier + Meridian interest submissions

  1. Account tier
    - New enum `account_tier_type` ('consumer', 'enterprise').
    - `profiles.account_tier` column, NOT NULL DEFAULT 'consumer' -- every existing
      row backfills to 'consumer' for free via the column default, no separate
      backfill statement needed.
    - Tier is flipped manually per-account via Supabase's Table Editor (product
      decision: no self-serve upgrade flow exists yet). No UPDATE policy is added
      for account_tier from the client side; nothing in this migration lets a user
      change their own tier.

  2. meridian_interest_submissions
    - `id`, `user_id` (references profiles), `message`, `created_at`.
    - RLS: INSERT only, gated on the *submitter's* profiles.account_tier being
      'enterprise' via an EXISTS subquery -- not merely "any authenticated user".
      This is deliberate defense-in-depth: the Meridian nav tab and screen are
      already gated client-side, but a client-side gate is advisory, not
      enforcement. Also requires auth.uid() = user_id (same "insert as yourself
      only" shape as messages.sender_id in the conversations/messages migration),
      so an enterprise account can't submit on another user's behalf.
    - No SELECT policy for regular users: submissions are reviewed manually via
      the Table Editor (which uses elevated access and isn't subject to these
      policies), not surfaced back through the app.
*/

CREATE TYPE account_tier_type AS ENUM ('consumer', 'enterprise');

ALTER TABLE profiles
  ADD COLUMN account_tier account_tier_type NOT NULL DEFAULT 'consumer';

CREATE TABLE IF NOT EXISTS meridian_interest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_meridian_interest_submissions_user_id ON meridian_interest_submissions(user_id);

ALTER TABLE meridian_interest_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enterprise-tier users can submit Meridian interest"
  ON meridian_interest_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.account_tier = 'enterprise'
    )
  );
