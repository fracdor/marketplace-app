-- supabase/migrations/20260702000003_create_tasks.sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  category_id smallint not null references public.categories(id),
  title text not null,
  description text not null,
  budget_reference numeric(12,2),
  city text not null,
  address_approx text,
  status text not null default 'open' check (status in ('open','assigned','completed','cancelled')),
  assigned_freelancer_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

grant select, insert, update, delete on public.tasks to authenticated;

create policy "tasks_select_visible" on public.tasks
  for select using (
    status = 'open'
    or client_id = auth.uid()
    or assigned_freelancer_id = auth.uid()
  );

create policy "tasks_insert_own" on public.tasks
  for insert with check (client_id = auth.uid());

create policy "tasks_update_own" on public.tasks
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());

create policy "tasks_delete_own_open" on public.tasks
  for delete using (client_id = auth.uid() and status = 'open');

create or replace function public.enforce_task_status_transitions()
returns trigger
language plpgsql
as $$
begin
  if new.assigned_freelancer_id is distinct from old.assigned_freelancer_id
     and coalesce(current_setting('app.allow_assignment', true), 'false') <> 'true' then
    raise exception 'tasks.assigned_freelancer_id cannot be set directly; use accept_offer()';
  end if;

  if new.status = old.status then
    new.updated_at := now();
    return new;
  end if;

  if old.status = 'open' and new.status = 'cancelled' then
    -- allowed: client cancels an open task
  elsif old.status = 'open' and new.status = 'assigned' then
    if coalesce(current_setting('app.allow_assignment', true), 'false') <> 'true' then
      raise exception 'tasks.status cannot be set to assigned directly; use accept_offer()';
    end if;
  elsif old.status = 'assigned' and new.status = 'completed' then
    -- allowed: client marks an assigned task as completed
  else
    raise exception 'invalid task status transition from % to %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_enforce_status_transitions
  before update on public.tasks
  for each row execute function public.enforce_task_status_transitions();
