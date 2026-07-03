-- supabase/tests/database/04-offers.sql
begin;
select plan(5);

select has_table('public', 'offers', 'offers table should exist');
select col_is_pk('public', 'offers', 'id', 'offers.id should be the primary key');

select tests.create_user('a1111111-1111-1111-1111-111111111111'::uuid);
select tests.create_user('a2222222-2222-2222-2222-222222222222'::uuid);

select tests.authenticate_as('a1111111-1111-1111-1111-111111111111'::uuid);

insert into public.tasks (id, client_id, category_id, title, description, city)
values ('a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 1, 'Reparar puerta', 'La puerta no cierra bien', 'Cali');

select tests.authenticate_as('a2222222-2222-2222-2222-222222222222'::uuid);

select lives_ok(
  $$ insert into public.offers (task_id, freelancer_id, price, message)
     values ('a3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222', 60000, 'Puedo hacerlo mañana') $$,
  'a freelancer should be able to offer on an open task that is not their own'
);

select tests.authenticate_as('a1111111-1111-1111-1111-111111111111'::uuid);

select throws_ok(
  $$ insert into public.offers (task_id, freelancer_id, price, message)
     values ('a3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 10000, 'yo mismo') $$,
  '42501',
  NULL,
  'a client should not be able to offer on their own task'
);

select isnt_empty(
  $$ select 1 from public.offers where task_id = 'a3333333-3333-3333-3333-333333333333' and status = 'pending' $$,
  'the task owner should be able to see offers on their task'
);

select * from finish();
rollback;
