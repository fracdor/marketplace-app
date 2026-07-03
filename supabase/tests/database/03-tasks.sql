-- supabase/tests/database/03-tasks.sql
begin;
select plan(10);

select has_table('public', 'tasks', 'tasks table should exist');
select col_is_pk('public', 'tasks', 'id', 'tasks.id should be the primary key');

select tests.create_user('44444444-4444-4444-4444-444444444444'::uuid);
select tests.create_user('55555555-5555-5555-5555-555555555555'::uuid);

select tests.authenticate_as('44444444-4444-4444-4444-444444444444'::uuid);

select lives_ok(
  $$ insert into public.tasks (client_id, category_id, title, description, city)
     values ('44444444-4444-4444-4444-444444444444', 1, 'Pintar una pared', 'Necesito pintar una pared de la sala', 'Medellín') $$,
  'a user should be able to create a task as themselves'
);

select throws_ok(
  $$ insert into public.tasks (client_id, category_id, title, description, city)
     values ('55555555-5555-5555-5555-555555555555', 1, 'Tarea ajena', 'desc', 'Medellín') $$,
  '42501',
  NULL,
  'a user should not be able to create a task on behalf of someone else'
);

select isnt_empty(
  $$ select 1 from public.tasks where title = 'Pintar una pared' and status = 'open' $$,
  'a newly created task should default to open status'
);

select throws_ok(
  $$ update public.tasks set status = 'assigned' where title = 'Pintar una pared' $$,
  'P0001',
  'tasks.status cannot be set to assigned directly; use accept_offer()',
  'a client should not be able to set a task to assigned directly'
);

select throws_ok(
  $$ update public.tasks set assigned_freelancer_id = '55555555-5555-5555-5555-555555555555' where title = 'Pintar una pared' $$,
  'P0001',
  'tasks.assigned_freelancer_id cannot be set directly; use accept_offer()',
  'a client should not be able to set assigned_freelancer_id directly'
);

select lives_ok(
  $$ update public.tasks set status = 'cancelled' where title = 'Pintar una pared' $$,
  'a client should be able to cancel their own open task'
);

select tests.authenticate_as('55555555-5555-5555-5555-555555555555'::uuid);

select is_empty(
  $$ select 1 from public.tasks where title = 'Pintar una pared' $$,
  'a cancelled task should no longer be visible to other users'
);

select tests.authenticate_as('44444444-4444-4444-4444-444444444444'::uuid);

select throws_ok(
  $$ update public.tasks set status = 'open' where title = 'Pintar una pared' $$,
  'P0001',
  'invalid task status transition from cancelled to open',
  'a cancelled task should not be able to transition back to open'
);

select * from finish();
rollback;
