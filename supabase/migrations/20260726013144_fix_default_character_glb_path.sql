/*
  # Fix stale glb_file_path on the "Default Character" marketplace row

  character.glb was meant to be replaced by male_humanoid.glb (see the
  male_humanoid.glb default-avatar swap) but the marketplace_avatars row
  still pointed at the old path. character.glb has never been committed to
  this repo at all (confirmed via `git log --all`), so any request for it
  hits Vite's dev-server HTML fallback instead of a GLB -- the source of the
  "Unexpected token '<'" console error in AvatarPreviewViewer.

  Confirmed via a read-only SELECT before writing this migration: exactly
  one row matched, id e140bf7b-5f1e-4754-8185-f663e87bca55, name
  "Default Character".

  Pure data fix -- no schema change, no app code change.
*/

UPDATE marketplace_avatars
SET glb_file_path = '/assets/male_humanoid.glb'
WHERE glb_file_path = '/assets/character.glb';
