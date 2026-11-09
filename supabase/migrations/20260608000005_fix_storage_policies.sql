-- The old INSERT policy only covered the 'anon' role.
-- Supabase JS with sb_publishable_ keys authenticates as the
-- 'authenticated' role (anonymous session), so uploads were being blocked.
-- Replace all storage policies to cover both roles.

drop policy if exists "Allow odometer spike uploads" on storage.objects;
drop policy if exists "Allow slice photo updates"    on storage.objects;

-- INSERT: allow both anon and authenticated to upload into this bucket
create policy "Allow transfer photo uploads"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'transfer-photos');

-- SELECT: needed for the client to verify uploads and read back signed URLs
create policy "Allow transfer photo reads"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'transfer-photos');

-- UPDATE: allow overwriting a photo (e.g. re-taking a shot)
create policy "Allow transfer photo updates"
  on storage.objects for update
  to anon, authenticated
  using     (bucket_id = 'transfer-photos')
  with check (bucket_id = 'transfer-photos');
