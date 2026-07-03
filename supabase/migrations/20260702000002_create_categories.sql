-- supabase/migrations/20260702000002_create_categories.sql
create table public.categories (
  id smallint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  icon text
);

alter table public.categories enable row level security;

grant select on public.categories to authenticated;

create policy "categories_select_all" on public.categories
  for select using (true);

insert into public.categories (name, slug, icon) values
  ('Limpieza del hogar', 'limpieza-hogar', 'broom'),
  ('Mudanzas', 'mudanzas', 'truck'),
  ('Plomería', 'plomeria', 'wrench'),
  ('Electricidad', 'electricidad', 'bolt'),
  ('Jardinería', 'jardineria', 'leaf'),
  ('Diseño gráfico', 'diseno-grafico', 'pen-tool'),
  ('Reparaciones varias', 'reparaciones', 'hammer'),
  ('Clases particulares', 'clases', 'book');
