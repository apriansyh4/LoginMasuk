-- LOCAL DEVELOPMENT SEED ONLY. Never run against production.
-- Creates one admin and one demo user with confirmed emails.
--   admin@ar-lokal.local / LocalAdmin!2026
--   demo@ar-lokal.local  / LocalDemo!2026
-- The profile row is created by the on_auth_user_created trigger (role 'user');
-- the admin is then promoted the same way as in production
-- (see supabase/scripts/promote_admin.sql and docs/DEPLOYMENT.md).

do $$
declare
  v_admin uuid := '11111111-1111-4111-8111-111111111111';
  v_demo  uuid := '22222222-2222-4222-8222-222222222222';
  r record;
begin
  for r in
    select * from (values
      (v_admin, 'admin@ar-lokal.local', 'LocalAdmin!2026', 'Admin AR-LOKAL'),
      (v_demo,  'demo@ar-lokal.local',  'LocalDemo!2026',  'Demo UMKM')
    ) as t(id, email, pw, display_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
      r.email, extensions.crypt(r.pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', r.display_name, 'consented_at', now()),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), r.id, r.id::text,
      jsonb_build_object('sub', r.id::text, 'email', r.email, 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;
  end loop;

  update public.profiles set role = 'admin' where id = v_admin;
end;
$$;
