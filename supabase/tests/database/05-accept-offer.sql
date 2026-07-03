-- supabase/tests/database/05-accept-offer.sql
begin;
select plan(12);

select tests.create_user('b1111111-1111-1111-1111-111111111111'::uuid); -- client
select tests.create_user('b2222222-2222-2222-2222-222222222222'::uuid); -- freelancer A
select tests.create_user('b3333333-3333-3333-3333-333333333333'::uuid); -- freelancer B

select tests.authenticate_as('b1111111-1111-1111-1111-111111111111'::uuid);

insert into public.tasks (id, client_id, category_id, title, description, city)
values ('b4444444-4444-4444-4444-444444444444', 'b1111111-1111-1111-1111-111111111111', 1, 'Arreglar grifo', 'Se dañó el grifo de la cocina', 'Bogotá');

select tests.authenticate_as('b2222222-2222-2222-2222-222222222222'::uuid);

select lives_ok(
  $$ insert into public.offers (task_id, freelancer_id, price, message)
     values ('b4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 50000, 'Puedo hoy mismo') $$,
  'freelancer A should be able to offer on the open task'
);

select tests.authenticate_as('b3333333-3333-3333-3333-333333333333'::uuid);

select lives_ok(
  $$ insert into public.offers (task_id, freelancer_id, price, message)
     values ('b4444444-4444-4444-4444-444444444444', 'b3333333-3333-3333-3333-333333333333', 45000, 'Tengo experiencia') $$,
  'freelancer B should also be able to offer on the same open task'
);

-- adversarial checks (deferred from Task 6 review): freelancer cannot
-- self-accept, cannot withdraw someone else's offer, task owner cannot
-- accept directly, and a freelancer cannot submit a second offer on the
-- same task. Both offers must remain 'pending' after this block so the
-- rest of the test (accept_offer flow below) proceeds as designed.

select tests.authenticate_as('b2222222-2222-2222-2222-222222222222'::uuid);

select throws_ok(
  $$ update public.offers set status = 'accepted'
     where task_id = 'b4444444-4444-4444-4444-444444444444'
       and freelancer_id = 'b2222222-2222-2222-2222-222222222222' $$,
  '42501',
  NULL,
  'a freelancer should not be able to accept their own offer directly'
);

select throws_ok(
  $$ insert into public.offers (task_id, freelancer_id, price, message)
     values ('b4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222', 55000, 'segunda oferta') $$,
  '23505',
  NULL,
  'a freelancer should not be able to submit a second offer on the same task'
);

update public.offers set status = 'withdrawn'
  where task_id = 'b4444444-4444-4444-4444-444444444444'
    and freelancer_id = 'b3333333-3333-3333-3333-333333333333';

-- switch to the client to check the result: freelancer A (still
-- authenticated above) has no RLS visibility into freelancer B's offer
-- row at all, so checking as A would see zero rows instead of 'pending'
-- regardless of whether the withdrawal was blocked. The client can see
-- all offers on their own task, so this is the right vantage point to
-- confirm the row was left untouched.
select tests.authenticate_as('b1111111-1111-1111-1111-111111111111'::uuid);

select results_eq(
  $$ select status from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444' and freelancer_id = 'b3333333-3333-3333-3333-333333333333' $$,
  $$ values ('pending'::text) $$,
  'a freelancer should not be able to withdraw someone elses offer'
);

select tests.authenticate_as('b1111111-1111-1111-1111-111111111111'::uuid);

update public.offers set status = 'accepted'
  where task_id = 'b4444444-4444-4444-4444-444444444444'
    and freelancer_id = 'b3333333-3333-3333-3333-333333333333';

select results_eq(
  $$ select status from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444' and freelancer_id = 'b3333333-3333-3333-3333-333333333333' $$,
  $$ values ('pending'::text) $$,
  'the task owner should not be able to accept an offer via a direct update'
);

select lives_ok(
  $$ select public.accept_offer(id) from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444'
       and freelancer_id = 'b3333333-3333-3333-3333-333333333333' $$,
  'the task owner should be able to accept freelancer Bs offer'
);

select results_eq(
  $$ select status from public.tasks where id = 'b4444444-4444-4444-4444-444444444444' $$,
  $$ values ('assigned'::text) $$,
  'the task should move to assigned after an offer is accepted'
);

select results_eq(
  $$ select status from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444' and freelancer_id = 'b3333333-3333-3333-3333-333333333333' $$,
  $$ values ('accepted'::text) $$,
  'the accepted offer should be marked accepted'
);

select results_eq(
  $$ select status from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444' and freelancer_id = 'b2222222-2222-2222-2222-222222222222' $$,
  $$ values ('rejected'::text) $$,
  'the other pending offer should be automatically rejected'
);

select throws_ok(
  $$ select public.accept_offer(id) from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444'
       and freelancer_id = 'b2222222-2222-2222-2222-222222222222' $$,
  'P0001',
  'task is not open for accepting offers',
  'accepting a second offer on an already-assigned task should fail'
);

select tests.authenticate_as('b2222222-2222-2222-2222-222222222222'::uuid);

-- freelancer A can only resolve an offer id they have RLS visibility into
-- (their own, now-rejected, offer) -- RLS already hides freelancer B's
-- offer row from A entirely, so using B's offer id here would make the
-- subquery return zero rows and never call accept_offer() at all. Using
-- A's own offer id still fully exercises the "only the task owner can
-- accept" check inside accept_offer(), since that check runs regardless
-- of which offer id a non-owner supplies.
select throws_ok(
  $$ select public.accept_offer(id) from public.offers
     where task_id = 'b4444444-4444-4444-4444-444444444444'
       and freelancer_id = 'b2222222-2222-2222-2222-222222222222' $$,
  'P0001',
  'only the task owner can accept an offer',
  'a non-owner should not be able to accept an offer on someone elses task'
);

select * from finish();
rollback;
