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
