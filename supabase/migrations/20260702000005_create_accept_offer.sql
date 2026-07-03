-- supabase/migrations/20260702000005_create_accept_offer.sql
create or replace function public.accept_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_freelancer_id uuid;
  v_client_id uuid;
  v_task_status text;
begin
  select o.task_id, o.freelancer_id
    into v_task_id, v_freelancer_id
  from public.offers o
  where o.id = p_offer_id
  for update;

  if v_task_id is null then
    raise exception 'offer not found';
  end if;

  select t.client_id, t.status
    into v_client_id, v_task_status
  from public.tasks t
  where t.id = v_task_id
  for update;

  if v_client_id is null then
    raise exception 'task not found';
  end if;

  if auth.uid() <> v_client_id then
    raise exception 'only the task owner can accept an offer';
  end if;

  if v_task_status <> 'open' then
    raise exception 'task is not open for accepting offers';
  end if;

  update public.offers
    set status = 'accepted'
    where id = p_offer_id;

  update public.offers
    set status = 'rejected'
    where task_id = v_task_id
      and id <> p_offer_id
      and status = 'pending';

  perform set_config('app.allow_assignment', 'true', true);

  update public.tasks
    set status = 'assigned',
        assigned_freelancer_id = v_freelancer_id
    where id = v_task_id;

  perform set_config('app.allow_assignment', 'false', true);
end;
$$;

grant execute on function public.accept_offer(uuid) to authenticated;
