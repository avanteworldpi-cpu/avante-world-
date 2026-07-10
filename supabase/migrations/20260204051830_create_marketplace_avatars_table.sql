/*
  # Create marketplace_avatars table

  1. New Tables
    - `marketplace_avatars`
      - `id` (uuid, primary key)
      - `name` (text)
      - `gender_type` (text: 'male' or 'female')
      - `glb_file_path` (text, path/URL to GLB model)
      - `thumbnail_url` (text, nullable)
      - `description` (text, nullable)
      - `is_active` (boolean, whether it's shown in the marketplace)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `marketplace_avatars` table
    - Anyone (anon or authenticated) can view active avatars
    - No public write access; content is managed via service role

  3. Notes
    - Referenced by `user_avatar_selections.selected_avatar_id`, so this must
      exist before that table is created.
*/

CREATE TABLE IF NOT EXISTS marketplace_avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gender_type text NOT NULL CHECK (gender_type IN ('male', 'female')),
  glb_file_path text NOT NULL,
  thumbnail_url text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE marketplace_avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active marketplace avatars"
  ON marketplace_avatars
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE INDEX idx_marketplace_avatars_gender_type ON marketplace_avatars(gender_type);
CREATE INDEX idx_marketplace_avatars_is_active ON marketplace_avatars(is_active);
