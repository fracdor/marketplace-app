import { supabase } from '@/lib/supabase';
import type { CategoryRow, CreateTaskInput, MyPublishedTask, Task, TaskWithRelations } from '@/features/tasks/types';

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

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase.from('categories').select('id, name, slug').order('id');
  if (error) throw error;
  return data ?? [];
}

// client_id has no DB default (not null, no `default` clause) — the caller
// must supply it explicitly. See "Before you start" in the plan for why this
// isn't resolved internally via useAuth().
export async function createTask(clientId: string, input: CreateTaskInput): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    client_id: clientId,
    category_id: input.category_id,
    title: input.title,
    description: input.description,
    budget_reference: input.budget_reference,
    city: input.city,
    address_approx: input.address_approx,
  });
  if (error) throw error;
}

const MY_TASK_SELECT = `
  id, client_id, category_id, title, description, budget_reference, city,
  address_approx, status, assigned_freelancer_id, created_at, updated_at
`;

async function fetchOfferCounts(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const { data, error } = await supabase.from('offers').select('task_id').in('task_id', taskIds);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.task_id, (counts.get(row.task_id) ?? 0) + 1);
  }
  return counts;
}

async function fetchFreelancerNames(freelancerIds: string[]): Promise<Map<string, string | null>> {
  if (freelancerIds.length === 0) return new Map();
  const { data, error } = await supabase.from('profiles_public').select('id, full_name').in('id', freelancerIds);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

// client_id has no DB default — the caller supplies it, same reasoning as
// createTask's clientId parameter. offers_select_related RLS lets the owner
// see every offer on their own tasks, so the grouped count below is exact.
export async function fetchMyTasks(clientId: string): Promise<MyPublishedTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(MY_TASK_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const tasks = (data ?? []) as Task[];

  const openTaskIds = tasks.filter((t) => t.status === 'open').map((t) => t.id);
  const assignedFreelancerIds = [
    ...new Set(tasks.map((t) => t.assigned_freelancer_id).filter((id): id is string => id !== null)),
  ];

  const [counts, freelancerNames] = await Promise.all([
    fetchOfferCounts(openTaskIds),
    fetchFreelancerNames(assignedFreelancerIds),
  ]);

  return tasks.map((t) => ({
    ...t,
    offer_count: counts.get(t.id) ?? 0,
    assigned_freelancer: t.assigned_freelancer_id
      ? { full_name: freelancerNames.get(t.assigned_freelancer_id) ?? null }
      : null,
  }));
}

// No RPC needed — enforce_task_status_transitions already allows
// assigned -> completed via a plain update, protected by tasks_update_own.
export async function completeTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status: 'completed' }).eq('id', taskId);
  if (error) throw error;
}

// No RPC needed — enforce_task_status_transitions already allows
// open -> cancelled via a plain update, protected by tasks_update_own.
export async function cancelTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', taskId);
  if (error) throw error;
}
