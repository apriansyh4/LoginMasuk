-- Private storage buckets + policies, and Realtime for job progress.

-- Future tables must not inherit Supabase's broad default grants.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------- buckets
-- Both private. Size caps are below the Supabase free-tier per-file limit
-- (see docs/DEPLOYMENT.md). Access is only through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads', 'uploads', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('models',  'models',  false, 41943040, array['model/gltf-binary', 'model/vnd.usdz+zip', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------- object policies
-- Keys are '{user_id}/{random}.{ext}'. Users may only read inside their own
-- folder; uploads and deletions happen through the server (content-checked,
-- re-encoded, random keys). Admins read for moderation.
create policy storage_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('uploads', 'models')
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.is_active_user()
  );

create policy storage_read_admin on storage.objects
  for select to authenticated
  using (bucket_id in ('uploads', 'models') and public.is_admin());

-- ---------------------------------------------------------------- realtime
-- Owners subscribe to their own generation_jobs rows (RLS applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.generation_jobs;
  end if;
end;
$$;
