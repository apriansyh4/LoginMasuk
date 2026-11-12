-- AR-LOKAL security layer: role helpers, integrity triggers, RLS, grants.
-- Principle: default deny. Users read their own rows. Writes that affect
-- integrity (validations, jobs, models, audit, rate limits) are performed
-- only by the trusted server layer with the service role.

-- ================================================================ helpers
-- Role lookups read public.profiles, never JWT/user metadata (client-editable).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_active_user() to authenticated, service_role;

-- ================================================================ profile on signup
-- Always creates role 'user'. Only display_name and the consent timestamp are
-- taken from signup metadata; role/is_active in metadata are ignored.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  v_consent text := new.raw_user_meta_data ->> 'consented_at';
  v_consented_at timestamptz;
begin
  if v_name is not null then
    v_name := left(v_name, 80);
  end if;
  begin
    v_consented_at := v_consent::timestamptz;
  exception when others then
    v_consented_at := null;
  end;
  insert into public.profiles (id, display_name, role, is_active, consented_at)
  values (new.id, v_name, 'user', true, v_consented_at);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================ role protection
-- Layer 1 (column privileges, below): authenticated may only UPDATE display_name.
-- Layer 2 (this trigger): role / is_active / id changes are rejected unless the
-- statement runs as a privileged database role (service_role, postgres).
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role
          or new.is_active is distinct from old.is_active
          or new.id is distinct from old.id
          or new.consented_at is distinct from old.consented_at
          or new.created_at is distinct from old.created_at) then
    raise exception 'permission denied: privileged profile columns are read-only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileged
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- Never leave the system without an active admin.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_others integer;
begin
  if old.role = 'admin' and old.is_active then
    if tg_op = 'DELETE'
       or new.role <> 'admin'
       or not new.is_active then
      select count(*) into v_others
      from public.profiles
      where role = 'admin' and is_active and id <> old.id;
      if v_others = 0 then
        raise exception 'cannot remove, demote or suspend the last active admin'
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_last_admin
  before update or delete on public.profiles
  for each row execute function public.protect_last_admin();

-- ================================================================ validation gate
-- A generation job requires a valid image_validations row for the same
-- product and the same user. Enforced in the database, not only in the UI.
create or replace function public.enforce_job_requires_valid_validation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.image_validations%rowtype;
begin
  select * into v from public.image_validations where id = new.validation_id;
  if not found then
    raise exception 'generation job requires an image validation' using errcode = '23514';
  end if;
  if not v.is_valid then
    raise exception 'generation job requires a passing image validation' using errcode = '23514';
  end if;
  if v.user_id <> new.user_id or v.product_id <> new.product_id then
    raise exception 'validation does not belong to this user/product' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.user_id = new.user_id
  ) then
    raise exception 'product does not belong to this user' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger generation_jobs_require_valid_validation
  before insert or update of validation_id, product_id, user_id on public.generation_jobs
  for each row execute function public.enforce_job_requires_valid_validation();

-- Validation rows must reference a product owned by the same user.
create or replace function public.enforce_validation_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.products p where p.id = new.product_id and p.user_id = new.user_id
  ) then
    raise exception 'validation user does not own the product' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger image_validations_ownership
  before insert or update of product_id, user_id on public.image_validations
  for each row execute function public.enforce_validation_ownership();

-- Users may edit only a few product columns (name, sharing). Sharing changes
-- are made through the server so the token is generated with a CSPRNG.
create or replace function public.protect_product_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.user_id is distinct from old.user_id
          or new.marketplace is distinct from old.marketplace
          or new.original_product_url is distinct from old.original_product_url
          or new.canonical_url is distinct from old.canonical_url
          or new.original_image_key is distinct from old.original_image_key
          or new.rights_confirmed is distinct from old.rights_confirmed
          or new.share_token is distinct from old.share_token
          or new.is_public is distinct from old.is_public
          or new.source_price is distinct from old.source_price
          or new.created_at is distinct from old.created_at) then
    raise exception 'permission denied: column is read-only for users' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger products_protect_columns
  before update on public.products
  for each row execute function public.protect_product_columns();

-- ================================================================ rate limiting
-- Atomic fixed-window counter. Returns true when the hit is allowed.
create or replace function public.rate_limit_hit(
  p_bucket text, p_subject text, p_window_seconds integer, p_max integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'invalid rate limit parameters';
  end if;
  insert into public.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

-- ================================================================ history view
-- One row per product with a derived submission status. security_invoker makes
-- the view obey the caller's RLS.
create or replace view public.submission_history
with (security_invoker = true)
as
select
  p.id,
  p.user_id,
  p.name,
  p.category,
  p.marketplace,
  p.original_product_url,
  p.original_image_key,
  p.is_public,
  p.created_at,
  v.id                 as validation_id,
  v.is_valid,
  v.quality_score,
  v.rejection_reasons,
  v.detected_category,
  j.id                 as job_id,
  j.status             as job_status,
  j.current_stage      as job_stage,
  m.id                 as model_id,
  m.quality_status,
  case
    when m.id is not null and m.status = 'ready' then 'ready'
    when m.id is not null and m.status = 'disabled' then 'disabled'
    when j.status in ('queued', 'running') then 'generating'
    when j.status in ('failed', 'timed_out', 'cancelled') then 'failed'
    when v.id is null then 'pending'
    when v.is_valid then 'validated'
    else 'rejected'
  end                  as status
from public.products p
left join lateral (
  select * from public.image_validations iv
  where iv.product_id = p.id order by iv.validated_at desc limit 1
) v on true
left join lateral (
  select * from public.generation_jobs gj
  where gj.product_id = p.id order by gj.created_at desc limit 1
) j on true
left join lateral (
  select * from public.generated_models gm
  where gm.product_id = p.id order by gm.created_at desc limit 1
) m on true;

-- ================================================================ RLS
alter table public.profiles          enable row level security;
alter table public.products          enable row level security;
alter table public.image_validations enable row level security;
alter table public.generation_jobs   enable row level security;
alter table public.generated_models  enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.rate_limits       enable row level security;

alter table public.profiles          force row level security;
alter table public.products          force row level security;
alter table public.image_validations force row level security;
alter table public.generation_jobs   force row level security;
alter table public.generated_models  force row level security;
alter table public.audit_logs        force row level security;
alter table public.rate_limits       force row level security;

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.is_active_user())
  with check (id = auth.uid());

-- products (insert happens server-side after rights/URL/file checks)
create policy products_select_own on public.products
  for select to authenticated using (user_id = auth.uid() and public.is_active_user());
create policy products_select_admin on public.products
  for select to authenticated using (public.is_admin());
create policy products_update_own on public.products
  for update to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid());
create policy products_delete_own on public.products
  for delete to authenticated using (user_id = auth.uid() and public.is_active_user());

-- image_validations: read-only for owners
create policy image_validations_select_own on public.image_validations
  for select to authenticated using (user_id = auth.uid() and public.is_active_user());
create policy image_validations_select_admin on public.image_validations
  for select to authenticated using (public.is_admin());

-- generation_jobs: read-only for owners (Realtime uses this policy)
create policy generation_jobs_select_own on public.generation_jobs
  for select to authenticated using (user_id = auth.uid() and public.is_active_user());
create policy generation_jobs_select_admin on public.generation_jobs
  for select to authenticated using (public.is_admin());

-- generated_models: read-only for owners
create policy generated_models_select_own on public.generated_models
  for select to authenticated using (
    public.is_active_user() and exists (
      select 1 from public.products p where p.id = product_id and p.user_id = auth.uid()
    )
  );
create policy generated_models_select_admin on public.generated_models
  for select to authenticated using (public.is_admin());

-- audit_logs: admins read; writes via service role only
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_admin());

-- rate_limits: no policies -> no access except service role / definer function

-- ================================================================ grants
-- Supabase grants broad table privileges to anon/authenticated by default;
-- tighten to exactly what the policies above need.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon;
-- Trigger/definer functions are never callable through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_last_admin() from public, anon, authenticated;
revoke all on function public.enforce_job_requires_valid_validation() from public, anon, authenticated;
revoke all on function public.enforce_validation_ownership() from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.products to authenticated;
grant update (name) on public.products to authenticated;

grant select on public.image_validations to authenticated;
grant select on public.generation_jobs   to authenticated;
grant select on public.generated_models  to authenticated;
grant select on public.audit_logs        to authenticated;
grant select on public.submission_history to authenticated;

grant all on all tables in schema public to service_role;
