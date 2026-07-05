import { supabase } from '@/lib/supabase';
import type { Task, TaskWithRelations } from '@/features/tasks/types';

// tasks.category_id -> categories.id is a real FK, and `categories` has no
// per-row RLS restriction (categories_select_all allows every authenticated
// user to read every row) — this embed is safe.
const TASK_SELECT = `
  id, client_id, category_id, title, description, budget_reference, city,
  address_approx, status, assigned_freelancer_id, created_at, updated_at,
  category:categories(name, slug)
`;

type TaskWithCategory = Task & { category: { name: string; slug: string } };

// See "Before you start" in the plan for why this is a second query rather
// than an embed: profiles_public is a view (no FK of its own), and embedding
// the underlying `profiles` table directly would apply profiles_select_own
// RLS (auth.uid() = id) per row, nulling out every task's client except the
// viewer's own.
async function attachClients(tasks: TaskWithCategory[]): Promise<TaskWithRelations[]> {
  const clientIds = [...new Set(tasks.map((t) => t.client_id))];
  if (clientIds.length === 0) return [];

  const { data: clients, error } = await supabase
    .from('profiles_public')
    .select('id, full_name, avatar_url')
    .in('id', clientIds);
  if (error) throw error;

  const byId = new Map((clients ?? []).map((c) => [c.id, c]));
  return tasks.map((t) => ({
    ...t,
    client: byId.get(t.client_id) ?? { full_name: null, avatar_url: null },
  }));
}

export async function fetchOpenTasks(): Promise<TaskWithRelations[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    // RLS on tasks also returns the caller's own tasks regardless of status
    // (so a future "my tasks" tab can reuse this table) — this feed is
    // open-only, so filter explicitly rather than relying on RLS alone.
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  // The Supabase client can't infer from a raw select-string literal that
  // `category:categories(...)` is a to-one embed (it types it as an array),
  // so an intermediate `unknown` cast is required here even though the
  // actual runtime shape matches TaskWithCategory.
  return attachClients((data ?? []) as unknown as TaskWithCategory[]);
}

export async function fetchTaskById(id: string): Promise<TaskWithRelations | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withClient] = await attachClients([data as unknown as TaskWithCategory]);
  return withClient;
}
