-- Milestone 2: generation jobs + fix for accounts created before the
-- profile trigger existed.

-- ---------------------------------------------------------------- profile backfill
-- Accounts that signed up before migrations were applied have no profile row,
-- which the app treated as "suspended". Create the missing rows (role 'user').
insert into public.profiles (id, display_name, role, is_active)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1)), 80),
       'user',
       true
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- jobs
-- At most one queued/running job per product (prevents double-clicks and GPU abuse).
create unique index if not exists generation_jobs_one_active_per_product
  on public.generation_jobs (product_id)
  where status in ('queued', 'running');

-- Daily quota lookups.
create index if not exists generation_jobs_user_created_idx
  on public.generation_jobs (user_id, created_at desc);

-- Realtime needs the full row in UPDATE payloads for RLS-filtered delivery.
alter table public.generation_jobs replica identity full;
