# Frontend App — Feed + Task Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `(tabs)/index.tsx` feed placeholder with a real feed of open tasks and add a read-only task detail screen, backed by TanStack Query.

**Architecture:** A thin `features/tasks/api.ts` wraps Supabase queries; `features/tasks/hooks.ts` wraps those in `useQuery`. `TaskCard` renders one task in the feed's `FlatList`; `app/task/[id].tsx` is a new top-level dynamic route (outside `(tabs)`) showing the full detail with a disabled "Ofertar" placeholder button. Pure formatting logic (`format.ts`) is TDD'd in isolation.

**Tech Stack:** `@tanstack/react-query` v5, Expo Router (dynamic route `task/[id]`), NativeWind, `@supabase/supabase-js`, Jest (jest-expo) + React Native Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-07-04-frontend-feed-task-detail-design.md](../specs/2026-07-04-frontend-feed-task-detail-design.md)

---

## Before you start

- Working directory is the repo root (`D:\App mario y yo`). `node_modules` and the full Task-1-13 scaffold+auth app already exist and pass (`npm test` → 44/44, `npx tsc --noEmit` clean).
- **Docker/Supabase local is still down.** Nothing in this plan needs it: all new tests mock `@/features/tasks/api` or `@/lib/supabase`, never a live database. `api.ts` itself is **not** unit-tested directly (same precedent as `features/auth/actions.ts`) — its correctness rests on the RLS reasoning below, and should be manually verified against a live `npx supabase start` stack once Docker is fixed.
- **`jest` must stay on `^29`** (see the note already in `jest.config.js` — `jest-expo@57` requires it). Installing `@tanstack/react-query` must not touch `jest`.
- **`@testing-library/react-native` v14's `render` is async.** Every new test below `await render(...)` — this is already the established pattern in this codebase (see `components/ui/__tests__/primitives.test.tsx`).
- **Critical — the client's public profile CANNOT be embedded in the same Supabase query as the task.** PostgREST's automatic embedding needs a real foreign key between the two relations being joined. The FK is `tasks.client_id -> profiles.id` (the underlying table), not to `profiles_public` (a view, which has no FK of its own). Embedding straight against `profiles` would apply `profiles`'s own RLS (`profiles_select_own`: `auth.uid() = id`) per embedded row — silently returning `client: null` for every task not owned by the viewer, i.e. almost the entire feed. Task 4 below fetches categories via a safe embed (the `categories` table has no per-row RLS restriction — `categories_select_all` allows every authenticated user to read every row) and fetches client info via a **second, separate query** against `profiles_public` (which intentionally exposes public fields for any authenticated user, per the backend design), joined client-side. Do not "simplify" this into one embedded query.
- **Critical — RLS on `tasks` is broader than "open only".** `tasks_select_visible` also returns the caller's own tasks regardless of status (by design, so a future "my tasks" tab can reuse the same table). A plain `select()` on `tasks` with no status filter would leak the viewer's own non-open tasks into what's supposed to be an open-only feed. `fetchOpenTasks()` in Task 4 explicitly adds `.eq('status', 'open')` — don't rely on RLS alone for this.
- File path alias `@/*` is already configured; tests can import dynamic route files directly, e.g. `@/app/task/[id]` — the square brackets are just literal path characters, nothing special to the module resolver.

---

### Task 1: Install TanStack Query and wire the provider

**Files:**
- Modify: `package.json` (via install), `app/_layout.tsx`

- [ ] **Step 1: Install the dependency**

```bash
npm install @tanstack/react-query
```

- [ ] **Step 2: Wrap the app in a QueryClientProvider**

```tsx
// app/_layout.tsx
import '../global.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/features/auth/AuthProvider';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all 44 pre-existing tests still pass (this is a wiring change with no new tests of its own — the `QueryClientProvider` has no behavior to unit test yet; it's exercised by every test in Tasks 5, 6, and 8 below, all of which render inside a fresh `QueryClientProvider`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install TanStack Query and wrap the app in QueryClientProvider"
```

---

### Task 2: `features/tasks/types.ts`

**Files:**
- Create: `features/tasks/types.ts`

- [ ] **Step 1: Define the task types**

```typescript
// features/tasks/types.ts
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

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No test file for this task — it's pure type declarations, same precedent as `features/auth/types.ts`, which also has no dedicated test.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Task/TaskWithRelations types"
```

---

### Task 3: `features/tasks/format.ts` (pure logic, TDD)

**Files:**
- Create: `features/tasks/format.ts`, `features/tasks/__tests__/format.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// features/tasks/__tests__/format.test.ts
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';

describe('formatBudget', () => {
  it('formats a budget with thousands separators and a $ prefix', () => {
    expect(formatBudget(80000)).toBe('$80.000');
  });

  it('formats a larger budget with multiple separators', () => {
    expect(formatBudget(1500000)).toBe('$1.500.000');
  });

  it('returns a placeholder when there is no budget', () => {
    expect(formatBudget(null)).toBe('Presupuesto a convenir');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-07-04T12:00:00.000Z');

  it('shows "justo ahora" for less than a minute', () => {
    expect(formatRelativeTime('2026-07-04T11:59:40.000Z', now)).toBe('justo ahora');
  });

  it('shows minutes for less than an hour', () => {
    expect(formatRelativeTime('2026-07-04T11:45:00.000Z', now)).toBe('hace 15 min');
  });

  it('shows singular hour', () => {
    expect(formatRelativeTime('2026-07-04T11:00:00.000Z', now)).toBe('hace 1 hora');
  });

  it('shows plural hours', () => {
    expect(formatRelativeTime('2026-07-04T09:00:00.000Z', now)).toBe('hace 3 horas');
  });

  it('shows plural days', () => {
    expect(formatRelativeTime('2026-07-02T12:00:00.000Z', now)).toBe('hace 2 días');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/tasks/__tests__/format.test.ts`
Expected: FAIL — cannot find module `@/features/tasks/format`.

- [ ] **Step 3: Implement the formatters**

```typescript
// features/tasks/format.ts

// Manual thousands-separator insertion (not Intl.NumberFormat/toLocaleString)
// so this doesn't depend on the device's bundled ICU data being complete for
// es-CO — Hermes's ICU support varies by build, and this is simple enough to
// not need it.
export function formatBudget(value: number | null): string {
  if (value === null) return 'Presupuesto a convenir';
  const rounded = Math.round(value);
  const withSeparators = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${withSeparators}`;
}

export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'justo ahora';
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;

  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/tasks/__tests__/format.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add task formatting helpers (formatBudget, formatRelativeTime)"
```

---

### Task 4: `features/tasks/api.ts`

**Files:**
- Create: `features/tasks/api.ts`

- [ ] **Step 1: Implement the data-access functions**

```typescript
// features/tasks/api.ts
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
  return attachClients((data ?? []) as TaskWithCategory[]);
}

export async function fetchTaskById(id: string): Promise<TaskWithRelations | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [withClient] = await attachClients([data as TaskWithCategory]);
  return withClient;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated unit test for this file — same precedent as `features/auth/actions.ts`, which also wraps Supabase calls directly and isn't unit-tested; its correctness is verified by the RLS reasoning above and should be manually confirmed against a live Supabase stack once Docker is available. `hooks.ts` in Task 5 mocks this entire module, so its behavior is exercised indirectly there.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add tasks data-access layer (fetchOpenTasks, fetchTaskById)"
```

---

### Task 5: `features/tasks/hooks.ts` (TDD, `api.ts` mocked)

**Files:**
- Create: `features/tasks/hooks.ts`, `features/tasks/__tests__/hooks.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// features/tasks/__tests__/hooks.test.tsx
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOpenTasks, useTask } from '@/features/tasks/hooks';
import type { TaskWithRelations } from '@/features/tasks/types';

jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
}));

import { fetchOpenTasks, fetchTaskById } from '@/features/tasks/api';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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

describe('useOpenTasks', () => {
  it('resolves with the tasks returned by fetchOpenTasks', async () => {
    (fetchOpenTasks as jest.Mock).mockResolvedValue([sampleTask]);
    await renderWithClient(<OpenTasksProbe />);
    await waitFor(() => expect(screen.getByText('1 tareas')).toBeTruthy());
  });
});

describe('useTask', () => {
  it('resolves with the task returned by fetchTaskById', async () => {
    (fetchTaskById as jest.Mock).mockResolvedValue(sampleTask);
    await renderWithClient(<TaskProbe id="t1" />);
    await waitFor(() => expect(screen.getByText('Arreglar fuga')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: FAIL — cannot find module `@/features/tasks/hooks`.

- [ ] **Step 3: Implement the hooks**

```typescript
// features/tasks/hooks.ts
import { useQuery } from '@tanstack/react-query';
import { fetchOpenTasks, fetchTaskById } from '@/features/tasks/api';

export function useOpenTasks() {
  return useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: fetchOpenTasks,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => fetchTaskById(id),
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: PASS (2 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add useOpenTasks and useTask hooks"
```

---

### Task 6: `components/tasks/TaskCard.tsx` (TDD)

**Files:**
- Create: `components/tasks/TaskCard.tsx`, `components/tasks/__tests__/TaskCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/tasks/__tests__/TaskCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TaskCard } from '@/components/tasks/TaskCard';
import type { TaskWithRelations } from '@/features/tasks/types';

const task: TaskWithRelations = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga en la cocina',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open',
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

describe('TaskCard', () => {
  it('renders title, category, city, and formatted budget', async () => {
    await render(<TaskCard task={task} onPress={() => {}} />);
    expect(screen.getByText('Arreglar fuga en la cocina')).toBeTruthy();
    expect(screen.getByText('Plomería')).toBeTruthy();
    expect(screen.getByText(/Bogotá/)).toBeTruthy();
    expect(screen.getByText('$80.000')).toBeTruthy();
  });

  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<TaskCard task={task} onPress={onPress} />);
    fireEvent.press(screen.getByTestId('task-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/tasks/__tests__/TaskCard.test.tsx`
Expected: FAIL — cannot find module `@/components/tasks/TaskCard`.

- [ ] **Step 3: Implement the card**

```tsx
// components/tasks/TaskCard.tsx
import { Pressable, View, Text } from 'react-native';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';
import type { TaskWithRelations } from '@/features/tasks/types';

interface TaskCardProps {
  task: TaskWithRelations;
  onPress: () => void;
}

function firstNameAndInitial(fullName: string | null): string {
  if (!fullName) return 'Anónimo';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

export function TaskCard({ task, onPress }: TaskCardProps) {
  return (
    <Pressable
      testID="task-card"
      onPress={onPress}
      className="bg-white border border-slate-200 rounded-2xl p-4 mb-3"
    >
      <View className="flex-row justify-between items-start">
        <View className="bg-brand/10 px-2 py-1 rounded-full">
          <Text className="text-brand text-xs font-bold">{task.category.name}</Text>
        </View>
        <Text className="text-slate-400 text-xs">★ nuevo</Text>
      </View>
      <Text className="text-slate-900 text-base font-bold mt-2">{task.title}</Text>
      <Text className="text-slate-500 text-xs mt-1">
        {task.city} · {formatRelativeTime(task.created_at)}
      </Text>
      <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-100">
        <Text className="text-brand text-sm font-bold">{formatBudget(task.budget_reference)}</Text>
        <Text className="text-slate-400 text-xs">{firstNameAndInitial(task.client.full_name)}</Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/tasks/__tests__/TaskCard.test.tsx`
Expected: PASS (2 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add TaskCard component"
```

---

### Task 7: Feed screen (`app/(tabs)/index.tsx`)

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Replace the placeholder with the real feed**

```tsx
// app/(tabs)/index.tsx
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TaskCard } from '@/components/tasks/TaskCard';
import { useOpenTasks } from '@/features/tasks/hooks';
import type { TaskWithRelations } from '@/features/tasks/types';

export default function Feed() {
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useOpenTasks();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-slate-500 text-center">
          No pudimos cargar las tareas. Desliza hacia abajo para reintentar.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-white"
      contentContainerStyle={{ padding: 16 }}
      data={data}
      keyExtractor={(item: TaskWithRelations) => item.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      renderItem={({ item }) => (
        <TaskCard task={item} onPress={() => router.push(`/task/${item.id}`)} />
      )}
      ListEmptyComponent={
        <View className="items-center justify-center py-20">
          <Text className="text-slate-500">No hay tareas abiertas por ahora.</Text>
        </View>
      }
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated screen test — same precedent as the auth screens in the scaffold+auth plan, e.g. `app/(auth)/login.tsx`: the screen is thin glue over an already-tested component (`TaskCard`) and hook (`useOpenTasks`), verified here by typecheck plus the full suite staying green.)

Run: `npm test`
Expected: all pre-existing tests plus Tasks 3/5/6's new tests still pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: wire the feed screen to useOpenTasks"
```

---

### Task 8: Task detail screen (`app/task/[id].tsx`)

**Files:**
- Create: `app/task/[id].tsx`, `app/task/__tests__/task-detail.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// app/task/__tests__/task-detail.test.tsx
import { render, screen } from '@testing-library/react-native';
import TaskDetailScreen from '@/app/task/[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  Stack: { Screen: () => null },
}));

jest.mock('@/features/tasks/hooks', () => ({
  useTask: jest.fn(),
}));

import { useTask } from '@/features/tasks/hooks';

const task = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga en la cocina',
  description: 'Hay una fuga debajo del lavaplatos.',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open' as const,
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  category: { name: 'Plomería', slug: 'plomeria' },
  client: { full_name: 'Ana Ruiz', avatar_url: null },
};

describe('TaskDetailScreen', () => {
  it('renders the task fields and a disabled Ofertar button', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    await render(<TaskDetailScreen />);
    expect(screen.getByText('Arreglar fuga en la cocina')).toBeTruthy();
    expect(screen.getByText('Plomería')).toBeTruthy();
    expect(screen.getByText('$80.000')).toBeTruthy();
    expect(screen.getByText('Hay una fuga debajo del lavaplatos.')).toBeTruthy();
    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Ofertar (próximamente)')).toBeTruthy();
  });

  it('shows a loading state while pending, not the task content', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    await render(<TaskDetailScreen />);
    expect(screen.queryByText('Arreglar fuga en la cocina')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/task/__tests__/task-detail.test.tsx`
Expected: FAIL — cannot find module `@/app/task/[id]`.

- [ ] **Step 3: Implement the screen**

```tsx
// app/task/[id].tsx
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTask } from '@/features/tasks/hooks';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: task, isPending, isError } = useTask(id);

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Detalle de tarea',
          headerStyle: { backgroundColor: '#0f766e' },
          headerTintColor: '#ffffff',
        }}
      />
      {isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : isError || !task ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-slate-500 text-center">No pudimos cargar esta tarea.</Text>
        </View>
      ) : (
        <>
          <ScrollView className="flex-1 px-5 pt-4">
            <View className="bg-brand/10 px-2 py-1 rounded-full self-start">
              <Text className="text-brand text-xs font-bold">{task.category.name}</Text>
            </View>
            <Text className="text-slate-900 text-xl font-extrabold mt-3">{task.title}</Text>
            <Text className="text-slate-500 text-xs mt-2">
              {task.city} · {formatRelativeTime(task.created_at)} · ★ nuevo
            </Text>

            <View className="bg-slate-50 rounded-2xl p-4 mt-4 flex-row justify-between items-center">
              <Text className="text-slate-500 text-xs">Presupuesto de referencia</Text>
              <Text className="text-brand text-lg font-extrabold">{formatBudget(task.budget_reference)}</Text>
            </View>

            <Text className="text-slate-600 text-xs font-bold uppercase mt-5">Descripción</Text>
            <Text className="text-slate-700 text-sm mt-2 leading-5">{task.description}</Text>

            <Text className="text-slate-600 text-xs font-bold uppercase mt-5">Publicado por</Text>
            <View className="flex-row items-center gap-2 mt-2 mb-6">
              <View className="w-8 h-8 rounded-full bg-slate-200" />
              <Text className="text-slate-900 text-sm font-semibold">
                {task.client.full_name ?? 'Anónimo'}
              </Text>
            </View>
          </ScrollView>
          <View className="border-t border-slate-100 px-5 py-4">
            <View className="bg-slate-300 rounded-xl h-11 items-center justify-center">
              <Text className="text-slate-500 font-bold text-sm">Ofertar (próximamente)</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- app/task/__tests__/task-detail.test.tsx`
Expected: PASS (2 assertions).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Expo Router auto-discovers `app/task/[id].tsx` as the route `/task/[id]` — no manual registration needed anywhere else.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add task detail screen"
```

---

### Task 9: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass — the 44 pre-existing assertions plus this plan's new ones (`format.test.ts`: 8, `hooks.test.tsx`: 2, `TaskCard.test.tsx`: 2, `task-detail.test.tsx`: 2 — 58 total). Zero failures.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the bundler builds**

Run: `npx expo export --platform ios` (self-terminating; produces a real bundle rather than just waiting for the CLI banner).
Expected: bundles with no red errors. Delete the resulting `dist/` afterward (`rm -rf dist`) — it's gitignored but keep the tree clean.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for feed + task detail sub-project" --allow-empty
```

---

## Notes for the executor

- **No live backend:** every test mocks `@/features/tasks/api`, `@/features/tasks/hooks`, or `expo-router` — nothing hits a real Supabase instance. When Docker/`npx supabase start` is available again, manually verify: the feed shows only `status='open'` tasks (not the viewer's own non-open ones), each card's category/city/budget/author render correctly, tapping a card opens the matching detail screen, and pull-to-refresh actually refetches.
- **Deferred/out of scope, per the design spec:** publish-task form, offer creation/acceptance, the "my tasks" tab (no functional value until publish-task and accept-offer exist), city/category filters, pagination, `onlineManager`/`focusManager` wiring for React Query (RN-specific network/focus refetch triggers — not needed for this MVP scope, note as a future enhancement if stale data becomes an issue in practice).
- **Migrating to generated Supabase types:** `features/tasks/types.ts` (and `features/auth/types.ts` before it) are hand-written against the migrations in `supabase/migrations/`. Once Docker is fixed, `npx supabase gen types typescript --local` can generate authoritative types — tracked as a future cleanup, not blocking this plan.
