/*
  # Create avatars storage bucket

  1. Storage
    - Public bucket `avatars` (referenced by SHARED_AVATAR_URL and
      getAvatarStorageUrl in src/lib/supabase.ts via the public object path).
    - Restricted to GLB/GLTF model files.

  2. Security
    - Bucket is public, so object URLs are readable without any SELECT policy.
      No bucket-wide SELECT policy is granted: that would let clients *list*
      every file in the bucket.
    - Authenticated users may read and write only within their own top-level
      folder (`<uid>/...`). SELECT is scoped there rather than omitted because
      storage upsert requires INSERT + SELECT + UPDATE.
    - Root-level assets like `shared-avatar.glb` are managed via the service role.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  52428800, -- 50 MB
  ARRAY['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read their own avatar files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload to their own avatar folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
