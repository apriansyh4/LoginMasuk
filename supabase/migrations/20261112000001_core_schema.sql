-- AR-LOKAL core schema (Section 11 of the build brief)
-- Tables, enums, constraints, indexes. RLS lives in the next migration.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('user', 'admin');
create type public.marketplace as enum ('none', 'shopee', 'tokopedia');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled');
create type public.job_stage as enum (
  'validating_image', 'preparing_image', 'generating_geometry',
  'processing_texture', 'validating_model', 'preparing_ar_asset'
);
create type public.model_status as enum ('ready', 'disabled');
create type public.quality_status as enum ('good', 'fair', 'poor');
create type public.texture_mode as enum ('baked', 'vertex_color');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  role          public.app_role not null default 'user',
  is_active     boolean not null default true,
  consented_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role) where role = 'admin';

-- ---------------------------------------------------------------- products
-- One row per submission (an uploaded image or a picked marketplace image).
create table public.products (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  name                  text check (name is null or char_length(name) <= 300),
  category              text,
  marketplace           public.marketplace not null default 'none',
  original_product_url  text check (original_product_url is null or char_length(original_product_url) <= 2048),
  canonical_url         text check (canonical_url is null or char_length(canonical_url) <= 2048),
  source_price          numeric(14, 2) check (source_price is null or source_price >= 0),
  price_currency        text check (price_currency is null or price_currency ~ '^[A-Z]{3}$'),
  price_retrieved_at    timestamptz,
  original_image_key    text,
  user_size_cm          jsonb check (
    user_size_cm is null or (
      jsonb_typeof(user_size_cm) = 'object'
      and (user_size_cm ? 'height' or user_size_cm ? 'width' or user_size_cm ? 'depth')
    )
  ),
  rights_confirmed      boolean not null check (rights_confirmed),
  is_public             boolean not null default false,
  share_token           text unique check (share_token is null or char_length(share_token) >= 32),
  retain_until          timestamptz not null default (now() + interval '30 days'),
  created_at            timestamptz not null default now(),
  -- a buy link can only exist for a marketplace product
  constraint products_marketplace_url_consistent check (
    (marketplace = 'none' and original_product_url is null)
    or (marketplace <> 'none' and original_product_url is not null)
  ),
  -- a public product must have a share token
  constraint products_public_needs_token check (not is_public or share_token is not null)
);
create index products_user_id_idx on public.products (user_id, created_at desc);
create index products_retain_until_idx on public.products (retain_until);

-- ---------------------------------------------------------------- image_validations
create table public.image_validations (
  id                      uuid primary key default gen_random_uuid(),
  product_id              uuid not null references public.products (id) on delete cascade,
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  is_valid                boolean not null,
  object_count            integer check (object_count is null or object_count >= 0),
  contains_human          boolean,
  contains_other_objects  boolean,
  quality_score           integer check (quality_score is null or quality_score between 0 and 100),
  sub_scores              jsonb not null default '{}'::jsonb,
  detected_category       text,
  category_confidence     real check (category_confidence is null or category_confidence between 0 and 1),
  rejection_reasons       jsonb not null default '[]'::jsonb check (jsonb_typeof(rejection_reasons) = 'array'),
  config_version          text not null,
  validated_at            timestamptz not null default now(),
  constraint image_validations_valid_has_no_reasons check (
    not is_valid or jsonb_array_length(rejection_reasons) = 0
  )
);
create index image_validations_product_id_idx on public.image_validations (product_id, validated_at desc);
create index image_validations_user_id_idx on public.image_validations (user_id);

-- ---------------------------------------------------------------- generation_jobs
create table public.generation_jobs (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  validation_id  uuid not null references public.image_validations (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  status         public.job_status not null default 'queued',
  current_stage  public.job_stage,
  error_code     text check (error_code is null or error_code ~ '^[A-Z_]{2,64}$'),
  error_message  text check (error_message is null or char_length(error_message) <= 500),
  attempt_count  integer not null default 0 check (attempt_count >= 0),
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz
);
create index generation_jobs_product_id_idx on public.generation_jobs (product_id, created_at desc);
create index generation_jobs_validation_id_idx on public.generation_jobs (validation_id);
create index generation_jobs_user_id_idx on public.generation_jobs (user_id, created_at desc);
create index generation_jobs_status_idx on public.generation_jobs (status) where status in ('queued', 'running');

-- ---------------------------------------------------------------- generated_models
create table public.generated_models (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  job_id          uuid not null unique references public.generation_jobs (id) on delete cascade,
  status          public.model_status not null default 'ready',
  glb_key         text not null,
  usdz_key        text,
  duration_ms     integer check (duration_ms is null or duration_ms >= 0),
  quality_status  public.quality_status not null,
  quality_notes   jsonb not null default '[]'::jsonb,
  texture_mode    public.texture_mode not null,
  face_count      integer check (face_count is null or face_count >= 0),
  engine_info     jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index generated_models_product_id_idx on public.generated_models (product_id, created_at desc);

-- ---------------------------------------------------------------- audit_logs
create table public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null check (action ~ '^[a-z_.]{3,64}$'),
  target_type  text not null,
  target_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);

-- ---------------------------------------------------------------- rate_limits
-- Fixed-window counters kept in Postgres (no paid service).
create table public.rate_limits (
  bucket        text not null,
  subject       text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, subject, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);
