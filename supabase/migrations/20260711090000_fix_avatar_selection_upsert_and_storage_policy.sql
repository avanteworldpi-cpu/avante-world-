/*
  # Fix avatar-selection upsert and storage-path policy mismatch

  Both bugs were unreachable until now: the app had no sign-in code, so nothing
  had ever authenticated and exercised these paths (auth.users had 0 rows).

  1. user_avatar_selections: UNIQUE (user_id)
     saveUserAvatarSelection() issues
       .upsert({...}, { onConflict: 'user_id' })
     but the table only had PRIMARY KEY (id). Postgres requires a unique index to
     match an ON CONFLICT target, so every save failed with
       42P10: no unique or exclusion constraint matching the ON CONFLICT specification
     It failed silently -- the helper catches its own error and returns null, and
     the caller proceeds anyway -- so the selection was simply never persisted.
     The constraint also enforces the intended one-selection-per-user model, which
     getUserAvatarSelection() already assumes by calling .maybeSingle().

  2. storage.objects: correct the per-user folder check
     The policies checked (storage.foldername(name))[1] = auth.uid(), but
     AvatarUpload writes to `user-uploads/<uid>/<timestamp>-<file>`, so segment 1
     is the literal 'user-uploads' and the uid is segment 2. The check could never
     be true and every upload would have been rejected by RLS.

     The `user-uploads/` prefix is kept: the avatars bucket is shared with
     marketplace and shared assets, so the prefix is meaningful namespacing.
     Pinning segment 1 to 'user-uploads' as well as segment 2 to the uid is
     stricter than only re-indexing -- it also stops a user writing into another
     prefix under their own uid.
*/

ALTER TABLE user_avatar_selections
  ADD CONSTRAINT user_avatar_selections_user_id_key UNIQUE (user_id);

DROP POLICY IF EXISTS "Users can read their own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own avatar folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar files" ON storage.objects;

CREATE POLICY "Users can read their own avatar files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user-uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can upload to their own avatar folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user-uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user-uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user-uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user-uploads'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
