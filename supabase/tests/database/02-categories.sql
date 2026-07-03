-- supabase/tests/database/02-categories.sql
begin;
select plan(5);

select has_table('public', 'categories', 'categories table should exist');
select col_is_pk('public', 'categories', 'id', 'categories.id should be the primary key');

select isnt_empty(
  $$ select 1 from public.categories $$,
  'categories should be seeded with at least one row'
);

select tests.create_user('33333333-3333-3333-3333-333333333333'::uuid);
select tests.authenticate_as('33333333-3333-3333-3333-333333333333'::uuid);

select lives_ok(
  $$ select * from public.categories $$,
  'any authenticated user should be able to read categories'
);

select throws_ok(
  $$ insert into public.categories (name, slug) values ('Hack', 'hack') $$,
  '42501',
  NULL,
  'authenticated users should not be able to insert categories'
);

select * from finish();
rollback;
