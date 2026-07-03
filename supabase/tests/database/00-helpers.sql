-- supabase/tests/database/00-helpers.sql
create schema if not exists tests;

create or replace function tests.create_user(user_id uuid, user_email text default null)
returns void
language plpgsql
security definer
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    coalesce(user_email, user_id::text || '@test.local'),
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function tests.authenticate_as(user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.clear_authentication()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- once authenticate_as() switches the session role to 'authenticated' (or
-- 'anon'), those roles need their own privilege to call the tests.* helpers
-- again later in the same test file (e.g. to switch to a different user).
grant usage on schema tests to authenticated, anon;
grant execute on function tests.create_user(uuid, text) to authenticated, anon;
grant execute on function tests.authenticate_as(uuid) to authenticated, anon;
grant execute on function tests.clear_authentication() to authenticated, anon;

begin;
select plan(3);

select has_schema('tests', 'the tests schema should exist');
select has_function('tests', 'create_user', array['uuid','text'], 'tests.create_user() should exist');
select has_function('tests', 'authenticate_as', array['uuid'], 'tests.authenticate_as() should exist');

select * from finish();
rollback;
