-- supabase/tests/database/01-profiles.sql
begin;
select plan(10);

select has_table('public', 'profiles', 'profiles table should exist');
select has_column('public', 'profiles', 'phone', 'profiles should have a phone column');
select col_is_pk('public', 'profiles', 'id', 'profiles.id should be the primary key');
select has_view('public', 'profiles_public', 'profiles_public view should exist');

select tests.create_user('11111111-1111-1111-1111-111111111111'::uuid);
select tests.create_user('22222222-2222-2222-2222-222222222222'::uuid);

select isnt_empty(
  $$ select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  'a profile row should be auto-created when a user signs up'
);

select tests.authenticate_as('11111111-1111-1111-1111-111111111111'::uuid);

update public.profiles set full_name = 'Ana' where id = '11111111-1111-1111-1111-111111111111'::uuid;

select results_eq(
  $$ select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values ('Ana'::text) $$,
  'a user should be able to update their own profile'
);

update public.profiles set full_name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222'::uuid;

select results_ne(
  $$ select full_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  $$ values ('Hacked'::text) $$,
  'a user should not be able to update another users profile'
);

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('11111111-1111-1111-1111-111111111111'::uuid) $$,
  'a direct select on profiles should only return the authenticated users own row'
);

select tests.authenticate_as('22222222-2222-2222-2222-222222222222'::uuid);

select results_eq(
  $$ select full_name from public.profiles_public where id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values ('Ana'::text) $$,
  'profiles_public should expose another users full_name'
);

select throws_ok(
  $$ select phone from public.profiles_public $$,
  '42703',
  NULL,
  'phone should not be a reachable column on profiles_public'
);

select * from finish();
rollback;
