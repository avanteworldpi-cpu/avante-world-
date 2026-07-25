/*
  # Create profiles table (public identity for messaging)

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text) -- lets the "new message" picker search by email, per product decision
      - `display_name` (text) -- derived from email locally; renaming is out of scope for this pass
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled. Any authenticated user may SELECT any profile row (a messaging
      directory has to be readable by other users to be useful at all -- this is a
      deliberate relaxation from the "own row only" pattern used elsewhere in this
      schema, not an oversight).
    - No client-side INSERT/UPDATE/DELETE policies: rows are created only by the
      trigger below (new signups) and the one-time backfill in this migration.

  3. Backfill
    - 26 real auth.users rows already exist (confirmed via query before writing this
      migration) -- a trigger that only fires on *future* inserts would leave all of
      them without a profile row and silently break conversation lookups for every
      existing account. This migration backfills them once, then the trigger covers
      everyone who signs up afterward.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Runs as the function owner (not the inserting session), so it can write into
-- profiles despite there being no client-facing INSERT policy.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- One-time backfill for the 26 users that already existed before this migration.
INSERT INTO profiles (id, email, display_name)
SELECT id, email, split_part(email, '@', 1)
FROM auth.users
ON CONFLICT (id) DO NOTHING;
