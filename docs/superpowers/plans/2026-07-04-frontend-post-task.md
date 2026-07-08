# Frontend App — Post Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `(tabs)/post-task.tsx` placeholder with a real "publicar tarea" form that inserts into `tasks` and refreshes the feed.

**Architecture:** A Zod schema validates the form. `features/tasks/api.ts` gains `fetchCategories()`/`createTask(clientId, input)` (thin Supabase wrappers, same precedent as `fetchOpenTasks`/`fetchTaskById`). `features/tasks/hooks.ts` gains a `taskKeys` query-key factory (replacing the existing plain keys), `useCategories()`, and `useCreateTask()` (a mutation that reads the current user from `useAuth()` and invalidates the feed's query on success). `PostTaskForm` follows the same react-hook-form + Zod pattern as `LoginForm`/`ProfileForm`, with a `Pressable` + `Modal` for the category picker.

**Tech Stack:** React Hook Form, Zod, `@tanstack/react-query`, React Native's built-in `Modal`, Jest (jest-expo) + React Native Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-07-04-frontend-post-task-design.md](../specs/2026-07-04-frontend-post-task-design.md)

---

## Before you start

- Working directory is the repo root (`D:\App mario y yo`). The app currently has 109 passing tests (`npm test`) and `npx tsc --noEmit` clean on `main`.
- **Docker/Supabase local is still down.** Nothing in this plan needs it: all new tests mock `@/features/tasks/api` or `@/features/tasks/hooks` or `@/features/auth/useAuth`, never a live database. `createTask`/`fetchCategories` in `api.ts` are **not** unit-tested directly — same precedent as `fetchOpenTasks`/`fetchTaskById` — correctness rests on reading the actual RLS policy and should be manually verified against a live `npx supabase start` stack once Docker is fixed.
- **`jest` must stay on `^29`** (see the note in `jest.config.js`). No task here installs new npm packages — `react-hook-form`, `@hookform/resolvers`, `zod`, and `@tanstack/react-query` are all already installed.
- **`@testing-library/react-native` v14's `render` is async.** Every new test below `await render(...)` — established pattern (see `features/auth/__tests__/LoginForm.test.tsx`).
- **`client_id` has no database default** (`not null references public.profiles(id)`, no `default`). `createTask` therefore takes `clientId` as an explicit parameter — it cannot call `useAuth()` itself (`api.ts` contains plain async functions, not React components/hooks; hooks can only be called from other hooks or components). The current user's id is resolved in `useCreateTask()` (a hook, which legally calls `useAuth()`) and passed down to `createTask`. This mirrors `features/auth/actions.ts`'s `saveProfile(userId, input)` exactly.
- **Category IDs are NOT hardcoded client-side.** `categories.id` is `generated always as identity` — assigned by Postgres based on seed insertion order, not something safe to hardcode in the app. `fetchCategories()` queries the real table (`categories_select_all` RLS already permits any authenticated read) so the `category_id` sent on insert always matches a real row.
- **`taskKeys` factory replaces the existing plain query keys.** `useOpenTasks`/`useTask` currently use `['tasks', 'open']` / `['tasks', id]` directly (from the prior sub-project). Task 3 below migrates them to `taskKeys.list('open')` / `taskKeys.detail(id)` — read the current `features/tasks/hooks.ts` and `features/tasks/__tests__/hooks.test.tsx` before editing, since this task modifies existing files, not just adding new ones.

---

### Task 1: `features/tasks/schemas.ts` (TDD)

**Files:**
- Create: `features/tasks/schemas.ts`, `features/tasks/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// features/tasks/__tests__/schemas.test.ts
import { postTaskSchema } from '@/features/tasks/schemas';

const valid = {
  category_id: 3,
  title: 'Arreglar fuga en la cocina',
  description: 'Hay una fuga debajo del lavaplatos que necesita reparación urgente.',
  budget_reference: '80000',
  city: 'Bogotá',
  address_approx: 'Barrio Chapinero',
};

describe('postTaskSchema', () => {
  it('accepts a fully filled valid task', () => {
    expect(postTaskSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid task with empty optional fields', () => {
    expect(
      postTaskSchema.safeParse({ ...valid, budget_reference: '', address_approx: '' }).success,
    ).toBe(true);
  });

  it('rejects when no category is selected (category_id 0)', () => {
    expect(postTaskSchema.safeParse({ ...valid, category_id: 0 }).success).toBe(false);
  });

  it('rejects a title shorter than 5 characters', () => {
    expect(postTaskSchema.safeParse({ ...valid, title: 'Hola' }).success).toBe(false);
  });

  it('rejects a description shorter than 20 characters', () => {
    expect(postTaskSchema.safeParse({ ...valid, description: 'Muy corta' }).success).toBe(false);
  });

  it('rejects a non-numeric budget_reference', () => {
    expect(postTaskSchema.safeParse({ ...valid, budget_reference: 'abc' }).success).toBe(false);
  });

  it('rejects a zero budget_reference', () => {
    expect(postTaskSchema.safeParse({ ...valid, budget_reference: '0' }).success).toBe(false);
  });

  it('rejects an empty city', () => {
    expect(postTaskSchema.safeParse({ ...valid, city: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/tasks/__tests__/schemas.test.ts`
Expected: FAIL — cannot find module `@/features/tasks/schemas`.

- [ ] **Step 3: Implement the schema**

```typescript
// features/tasks/schemas.ts
import { z } from 'zod';

// category_id defaults to 0 in the form (meaning "nothing picked yet" — 0 is
// never a real category id since categories.id starts at 1), so the minimum
// is what actually enforces "you must pick one."
export const postTaskSchema = z.object({
  category_id: z.number().min(1, 'Selecciona una categoría'),
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres'),
  description: z.string().min(20, 'La descripción debe tener al menos 20 caracteres'),
  // Kept as a raw string here (matches what a numeric TextInput holds); the
  // form converts it to `number | null` before calling onSubmit. Empty is
  // valid (budget is optional); anything else must be a positive integer.
  budget_reference: z.string().refine(
    (v) => v === '' || (/^\d+$/.test(v) && Number(v) > 0),
    { message: 'El presupuesto debe ser un número entero mayor a cero' },
  ),
  city: z.string().min(1, 'La ciudad es obligatoria'),
  address_approx: z.string(),
});
export type PostTaskFormValues = z.infer<typeof postTaskSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/tasks/__tests__/schemas.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add postTaskSchema validation"
```

---

### Task 2: `features/tasks/types.ts` + `features/tasks/api.ts` — categories and task creation

**Files:**
- Modify: `features/tasks/types.ts`
- Modify: `features/tasks/api.ts`

- [ ] **Step 1: Add `CategoryRow` and `CreateTaskInput` to types.ts**

The current `features/tasks/types.ts` is:

```typescript
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
```

Append these two new exports at the end of the file:

```typescript
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
```

- [ ] **Step 2: Add `fetchCategories` and `createTask` to api.ts**

The current `features/tasks/api.ts` is:

```typescript
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
```

Add the import and the two new functions at the end of the file:

```typescript
// Add to the top import line:
import type { CategoryRow, CreateTaskInput, Task, TaskWithRelations } from '@/features/tasks/types';
```

```typescript
// Append at the end of the file:

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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated unit test for `fetchCategories`/`createTask` — same precedent as `fetchOpenTasks`/`fetchTaskById`, verified via `tsc` plus the RLS reasoning in "Before you start." `useCreateTask`/`useCategories` in Task 3 mock this whole module, exercising the hook-level contract.)

Run: `npm test`
Expected: all 109 pre-existing tests plus Task 1's 8 new tests still pass (117 total).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add fetchCategories and createTask to the tasks data layer"
```

---

### Task 3: `features/tasks/hooks.ts` — `taskKeys` factory, `useCategories`, `useCreateTask` (TDD)

**Files:**
- Modify: `features/tasks/hooks.ts`
- Modify: `features/tasks/__tests__/hooks.test.tsx`

- [ ] **Step 1: Write the failing tests (replaces the whole test file)**

The current `features/tasks/__tests__/hooks.test.tsx` tests `useOpenTasks`/`useTask` against mocked `fetchOpenTasks`/`fetchTaskById`. Replace its entire content with this (it keeps the two existing test cases unchanged in behavior — only the internal query keys they exercise change — and adds three new `describe` blocks):

```tsx
// features/tasks/__tests__/hooks.test.tsx
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOpenTasks, useTask, useCategories, useCreateTask } from '@/features/tasks/hooks';
import type { CreateTaskInput, TaskWithRelations } from '@/features/tasks/types';

jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
  fetchCategories: jest.fn(),
  createTask: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask } from '@/features/tasks/api';
import { useAuth } from '@/features/auth/useAuth';

function renderWithClient(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

const sampleTask: TaskWithRelations = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open',
  assigned_freelancer_id: null,
  created_at: '2026-07-04T10:00:00.000Z',
  updated_at: '2026-07-04T10:00:00.000Z',
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

function OpenTasksProbe() {
  const { data, isPending } = useOpenTasks();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} tareas</Text>;
}

function TaskProbe({ id }: { id: string }) {
  const { data, isPending } = useTask(id);
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.title ?? 'not found'}</Text>;
}

function CategoriesProbe() {
  const { data, isPending } = useCategories();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} categorías</Text>;
}

const sampleInput: CreateTaskInput = {
  category_id: 3,
  title: 'Arreglar fuga',
  description: 'Hay una fuga debajo del lavaplatos que necesita reparación.',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
};

function CreateTaskProbe() {
  const mutation = useCreateTask();
  if (mutation.isSuccess) return <Text>created</Text>;
  return <Text onPress={() => mutation.mutate(sampleInput)}>submit</Text>;
}

describe('useOpenTasks', () => {
  it('resolves with the tasks returned by fetchOpenTasks', async () => {
    (fetchOpenTasks as jest.Mock).mockResolvedValue([sampleTask]);
    renderWithClient(<OpenTasksProbe />);
    await waitFor(() => expect(screen.getByText('1 tareas')).toBeTruthy());
  });
});

describe('useTask', () => {
  it('resolves with the task returned by fetchTaskById', async () => {
    (fetchTaskById as jest.Mock).mockResolvedValue(sampleTask);
    renderWithClient(<TaskProbe id="t1" />);
    await waitFor(() => expect(screen.getByText('Arreglar fuga')).toBeTruthy());
  });
});

describe('useCategories', () => {
  it('resolves with the categories returned by fetchCategories', async () => {
    (fetchCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Limpieza del hogar', slug: 'limpieza-hogar' },
      { id: 3, name: 'Plomería', slug: 'plomeria' },
    ]);
    renderWithClient(<CategoriesProbe />);
    await waitFor(() => expect(screen.getByText('2 categorías')).toBeTruthy());
  });
});

describe('useCreateTask', () => {
  it('calls createTask with the current session user id and the input', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (createTask as jest.Mock).mockResolvedValue(undefined);
    const { getByText } = renderWithClient(<CreateTaskProbe />);
    getByText('submit').props.onPress();
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(createTask).toHaveBeenCalledWith('u1', sampleInput);
  });

  it('invalidates the open-tasks list query on success', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (createTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { getByText } = renderWithClient(<CreateTaskProbe />, client);
    getByText('submit').props.onPress();
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: FAIL — `useCategories`/`useCreateTask` are not exported from `@/features/tasks/hooks`, and the mock for `@/features/auth/useAuth` references a module the test imports but `hooks.ts` doesn't yet use.

- [ ] **Step 3: Implement the updated hooks.ts (replaces the whole file)**

```typescript
// features/tasks/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask } from '@/features/tasks/api';
import { useAuth } from '@/features/auth/useAuth';
import type { CreateTaskInput } from '@/features/tasks/types';

// Replaces the previous plain keys (['tasks','open'], ['tasks', id]) now that
// there's a real invalidation need (creating a task must refresh the open
// list). See the plan's design spec for why this wasn't introduced earlier.
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filter: string) => [...taskKeys.lists(), filter] as const,
  detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
};

export function useOpenTasks() {
  return useQuery({
    queryKey: taskKeys.list('open'),
    queryFn: fetchOpenTasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => fetchTaskById(id),
  });
}

// Static catalog (seeded by migration, no runtime management UI) — safe to
// treat as never-stale, avoiding a refetch every time the post-task screen
// remounts.
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: Infinity,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => {
      if (!session) throw new Error('No hay sesión activa');
      return createTask(session.user.id, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: PASS (5 assertions: the 2 pre-existing behaviors + 3 new — `useCategories` adds 1, `useCreateTask` adds 2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (117 prior + 3 net-new from this task's replaced file = 120 total; the file went from 2 to 5 assertions, a net +3).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add taskKeys factory, useCategories, and useCreateTask"
```

---

### Task 4: `components/tasks/PostTaskForm.tsx` (TDD)

**Files:**
- Create: `components/tasks/PostTaskForm.tsx`, `components/tasks/__tests__/PostTaskForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/tasks/__tests__/PostTaskForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PostTaskForm } from '@/components/tasks/PostTaskForm';

jest.mock('@/features/tasks/hooks', () => ({
  useCategories: jest.fn(),
}));

import { useCategories } from '@/features/tasks/hooks';

const categories = [
  { id: 1, name: 'Limpieza del hogar', slug: 'limpieza-hogar' },
  { id: 3, name: 'Plomería', slug: 'plomeria' },
];

beforeEach(() => {
  (useCategories as jest.Mock).mockReturnValue({ data: categories, isPending: false });
});

describe('PostTaskForm', () => {
  it('blocks submit and shows errors when required fields are empty', async () => {
    const onSubmit = jest.fn();
    await render(<PostTaskForm onSubmit={onSubmit} />);
    fireEvent.press(screen.getByText('Publicar'));
    await waitFor(() => expect(screen.getByText('Selecciona una categoría')).toBeTruthy());
    expect(screen.getByText('El título debe tener al menos 5 caracteres')).toBeTruthy();
    expect(screen.getByText('La descripción debe tener al menos 20 caracteres')).toBeTruthy();
    expect(screen.getByText('La ciudad es obligatoria')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('lets the user pick a category from the modal and submits the converted payload', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<PostTaskForm onSubmit={onSubmit} />);

    fireEvent.press(screen.getByText('Selecciona una categoría'));
    fireEvent.press(screen.getByText('Plomería'));
    expect(screen.getByText('Plomería')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('title-input'), 'Arreglar fuga en la cocina');
    fireEvent.changeText(
      screen.getByTestId('description-input'),
      'Hay una fuga debajo del lavaplatos que necesita reparación urgente.',
    );
    fireEvent.changeText(screen.getByTestId('city-input'), 'Bogotá');
    fireEvent.press(screen.getByText('Publicar'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        category_id: 3,
        title: 'Arreglar fuga en la cocina',
        description: 'Hay una fuga debajo del lavaplatos que necesita reparación urgente.',
        budget_reference: null,
        city: 'Bogotá',
        address_approx: null,
      }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/tasks/__tests__/PostTaskForm.test.tsx`
Expected: FAIL — cannot find module `@/components/tasks/PostTaskForm`.

- [ ] **Step 3: Implement the form**

```tsx
// components/tasks/PostTaskForm.tsx
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { postTaskSchema, type PostTaskFormValues } from '@/features/tasks/schemas';
import { useCategories } from '@/features/tasks/hooks';
import { mapAuthError } from '@/features/auth/errors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { CreateTaskInput } from '@/features/tasks/types';

interface PostTaskFormProps {
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

export function PostTaskForm({ onSubmit }: PostTaskFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const { data: categories } = useCategories();
  const { control, handleSubmit, formState, setValue, watch } = useForm<PostTaskFormValues>({
    resolver: zodResolver(postTaskSchema),
    defaultValues: {
      category_id: 0,
      title: '',
      description: '',
      budget_reference: '',
      city: '',
      address_approx: '',
    },
  });

  const selectedCategoryId = watch('category_id');
  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit({
        category_id: values.category_id,
        title: values.title,
        description: values.description,
        budget_reference: values.budget_reference === '' ? null : Number(values.budget_reference),
        city: values.city,
        address_approx: values.address_approx.trim() === '' ? null : values.address_approx,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? mapAuthError(e.message) : 'Error al publicar la tarea');
    }
  });

  return (
    <ScrollView>
      <Controller
        control={control}
        name="category_id"
        render={({ fieldState }) => (
          <View className="mb-3">
            <Text className="text-xs text-slate-600 mb-1">Categoría</Text>
            <Pressable
              testID="category-picker"
              onPress={() => setCategoryModalOpen(true)}
              className="h-11 rounded-xl border border-slate-200 px-3 bg-white justify-center"
            >
              <Text className={selectedCategory ? 'text-slate-900' : 'text-slate-400'}>
                {selectedCategory?.name ?? 'Selecciona una categoría'}
              </Text>
            </Pressable>
            {fieldState.error ? (
              <Text className="text-xs text-red-500 mt-1">{fieldState.error.message}</Text>
            ) : null}
          </View>
        )}
      />

      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setCategoryModalOpen(false)}>
          <View className="bg-white rounded-t-2xl p-4">
            <Text className="text-base font-bold text-slate-900 mb-3">Elige una categoría</Text>
            {(categories ?? []).map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setValue('category_id', cat.id, { shouldValidate: true });
                  setCategoryModalOpen(false);
                }}
                className="py-3 px-2"
              >
                <Text className="text-sm text-slate-800">{cat.name}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <Input
            label="Título"
            testID="title-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field, fieldState }) => (
          <Input
            label="Descripción"
            testID="description-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
            multiline
          />
        )}
      />

      <Controller
        control={control}
        name="budget_reference"
        render={({ field, fieldState }) => (
          <Input
            label="Presupuesto de referencia (opcional)"
            testID="budget-input"
            keyboardType="numeric"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="city"
        render={({ field, fieldState }) => (
          <Input
            label="Ciudad"
            testID="city-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="address_approx"
        render={({ field, fieldState }) => (
          <Input
            label="Dirección aproximada (opcional)"
            testID="address-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />

      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Publicar" onPress={submit} loading={formState.isSubmitting} />
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/tasks/__tests__/PostTaskForm.test.tsx`
Expected: PASS (2 test cases; the first asserts 5 things, the second asserts the full converted payload — both pass).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (120 prior + 2 new = 122 total).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PostTaskForm with a modal category picker"
```

---

### Task 5: Wire the post-task screen (`app/(tabs)/post-task.tsx`)

**Files:**
- Modify: `app/(tabs)/post-task.tsx`

- [ ] **Step 1: Replace the placeholder with the real screen**

The current `app/(tabs)/post-task.tsx` is:

```tsx
import { View, Text } from 'react-native';
export default function PostTask() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-slate-500">Publicar tarea (próximo sub-proyecto)</Text>
    </View>
  );
}
```

Replace it with:

```tsx
// app/(tabs)/post-task.tsx
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { PostTaskForm } from '@/components/tasks/PostTaskForm';
import { useCreateTask } from '@/features/tasks/hooks';
import type { CreateTaskInput } from '@/features/tasks/types';

export default function PostTask() {
  const router = useRouter();
  const { mutateAsync } = useCreateTask();

  const onSubmit = async (input: CreateTaskInput) => {
    await mutateAsync(input);
    router.push('/(tabs)');
  };

  return (
    <View className="flex-1 bg-white px-5 pt-4">
      <Text className="text-xl font-extrabold text-slate-900 mb-4">Publicar tarea</Text>
      <PostTaskForm onSubmit={onSubmit} />
    </View>
  );
}
```

`mutateAsync` (TanStack Query's promise-returning mutate variant) is the right choice here rather than `mutate`: `PostTaskForm`'s `onSubmit` prop is typed `Promise<void>` (matching `LoginForm`/`RegisterForm`/`ProfileForm`'s established contract), and the form's own `try/catch` around `onSubmit` (already implemented in Task 4) is what surfaces a failed mutation as `submitError` text — the same error-handling seam used by every other form in this app. If `mutateAsync` rejects, `PostTaskForm` catches it and shows the message; `router.push` never runs on failure.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated screen test — same precedent as `app/(auth)/login.tsx` and `app/(tabs)/index.tsx`: this screen is thin glue over already-tested `PostTaskForm`/`useCreateTask`, verified by typecheck plus the full suite staying green.)

Run: `npm test`
Expected: all 122 pre-existing tests still pass (no new tests in this task).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire the post-task screen to useCreateTask"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass — 122 assertions total (109 pre-existing + 8 from Task 1 + 3 net-new from Task 3 + 2 from Task 4). Zero failures.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the bundler builds**

Run: `npx expo export --platform ios` (self-terminating; produces a real bundle rather than just waiting for the CLI banner).
Expected: bundles with no red errors. Delete the resulting `dist/` afterward (`rm -rf dist`) — it's gitignored but keep the tree clean.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for post-task sub-project" --allow-empty
```

---

## Notes for the executor

- **No live backend:** every test mocks `@/features/tasks/api`, `@/features/tasks/hooks`, or `@/features/auth/useAuth` — nothing hits a real Supabase instance. When Docker/`npx supabase start` is available again, manually verify: publishing a task actually inserts a row with the correct `client_id`/`category_id`, the feed shows it after invalidation (no manual pull-to-refresh needed), and RLS genuinely blocks an attempt to insert with a spoofed `client_id` (already covered by the backend's own pgTAP suite — `tasks_insert_own` — but a live manual check closes the loop end-to-end).
- **Deferred, per the design spec:** editing/deleting own tasks, photo/attachment uploads, real geolocation for `address_approx`, and the "my tasks" tab (still waiting on the offer/accept sub-project to have any content to show).
- **`mapAuthError`** (from `features/auth/errors.ts`) is reused here even though the errors it'll actually see are task-insert failures, not auth failures — it's already the codebase's general-purpose "turn a raw Supabase error string into Spanish" fallback (see `ProfileForm.tsx`'s identical usage), not literally auth-specific in practice.
