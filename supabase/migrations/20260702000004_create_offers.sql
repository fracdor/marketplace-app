-- supabase/migrations/20260702000004_create_offers.sql
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  freelancer_id uuid not null references public.profiles(id) on delete cascade,
  price numeric(12,2) not null check (price > 0),
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (task_id, freelancer_id)
);

alter table public.offers enable row level security;

grant select, insert, update on public.offers to authenticated;

create policy "offers_select_related" on public.offers
  for select using (
    freelancer_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = offers.task_id and t.client_id = auth.uid()
    )
  );

create or replace function public.offer_insert_is_valid(p_task_id uuid, p_freelancer_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and t.status = 'open'
      and t.client_id <> p_freelancer_id
  );
$$;

create policy "offers_insert_own" on public.offers
  for insert with check (
    freelancer_id = auth.uid()
    and public.offer_insert_is_valid(task_id, freelancer_id)
  );

create policy "offers_withdraw_own" on public.offers
  for update using (freelancer_id = auth.uid() and status = 'pending')
  with check (status = 'withdrawn');
