-- Promote an existing, email-verified account to admin.
-- Admins can never be created through the UI. Run as a database owner:
--
--   psql "$SUPABASE_DB_URL" -v email='owner@example.com' -f supabase/scripts/promote_admin.sql
--
-- Every promotion is written to audit_logs (actor_id null = database operator).

\set ON_ERROR_STOP on

begin;

with target as (
  select u.id
  from auth.users u
  where lower(u.email) = lower(:'email') and u.email_confirmed_at is not null
)
update public.profiles p
set role = 'admin'
from target
where p.id = target.id
returning p.id as promoted_id \gset

insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
values (null, 'admin.promote', 'profile', :'promoted_id', jsonb_build_object('via', 'promote_admin.sql'));

commit;
