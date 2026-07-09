export type TaskStatus = 'open' | 'assigned' | 'completed' | 'cancelled';

export interface TaskCategory {
  name: string;
  slug: string;
}

export interface TaskClient {
  full_name: string | null;
  avatar_url: string | null;
}

// The raw shape of a row in public.tasks.
export interface Task {
  id: string;
  client_id: string;
  category_id: number;
  title: string;
  description: string;
  budget_reference: number | null;
  city: string;
  address_approx: string | null;
  status: TaskStatus;
  assigned_freelancer_id: string | null;
  created_at: string;
  updated_at: string;
}

// What api.ts/hooks.ts actually return: a Task plus its joined category and
// client info. Every UI component in features/tasks and components/tasks
// consumes this shape, never the bare Task.
export interface TaskWithRelations extends Task {
  category: TaskCategory;
  client: TaskClient;
}

// A row from public.categories, used by the post-task category picker.
export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
}

// What PostTaskForm hands to createTask after validating/converting the raw
// form strings. budget_reference/address_approx are null (not empty string)
// when the user left them blank, matching the DB columns' nullability.
export interface CreateTaskInput {
  category_id: number;
  title: string;
  description: string;
  budget_reference: number | null;
  city: string;
  address_approx: string | null;
}

// A row for the "Publicadas" sub-tab of Mis tareas: a task the current user
// published, enriched with just enough info to avoid a second screen visit
// per row. offer_count is only meaningful while status === 'open';
// assigned_freelancer is only meaningful once status is 'assigned' or
// 'completed' — both are derived server-side by fetchMyTasks, not raw
// columns on the tasks table.
export interface MyPublishedTask extends Task {
  offer_count: number;
  assigned_freelancer: { full_name: string | null } | null;
}
