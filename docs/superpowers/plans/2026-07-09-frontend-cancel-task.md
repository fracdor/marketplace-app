# Cancelar Tarea Abierta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a task owner cancel their own `open` task (status → `cancelled`, irreversible), from both the task detail screen and the "Mis tareas > Publicadas" row, with confirmation and correct handling of any orphaned pending offers.

**Architecture:** `cancelTask(taskId)` mirrors `completeTask` exactly (plain `UPDATE`, no RPC — the trigger already permits `open → cancelled`). `useCancelTask()` mirrors `useCompleteTask()` but invalidates `taskKeys.lists()` (not just `list('mine')`) since a cancelled task also leaves the open feed. `TaskActionZone` and `PublishedTaskRow` both gain a "Cancelar"/"Cancelar tarea" button, gated on `status === 'open'`. `MyOfferRow` gains awareness that a `pending` offer can sit on a task that's since been `cancelled` (nothing in the `offers` table transitions automatically) and shows "Tarea cancelada" instead.

**Tech Stack:** `@tanstack/react-query`, React Native's `Alert`, Jest (jest-expo) + React Native Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-07-09-frontend-cancel-task-design.md](../specs/2026-07-09-frontend-cancel-task-design.md)

---

## Before you start

- Work from the worktree `D:\App mario y yo\.worktrees\frontend-cancel-task` (branch `frontend-cancel-task`). **Always run `npm test`/`npx tsc` from inside this worktree, never the repo root.**
- **Baseline, verified live moments before writing this plan: 144 tests, 26 suites, `tsc --noEmit` clean.** Treat each task's running total below as a sanity-check estimate, not ground truth — trust the actual `npm test` output.
- **Docker/Supabase local is still down.** Not needed — every test mocks `@/features/tasks/api`/`@/features/tasks/hooks`/`@/features/offers/hooks`/`@/features/auth/useAuth`, never a live database. `cancelTask` (like `completeTask`) has no dedicated unit test — same established precedent.
- **`jest` stays on `^29`.** No new npm packages needed anywhere in this plan.
- **Await every `fireEvent.press`/`fireEvent.changeText` call** — this codebase's established RNTL v14 + React 19.2 requirement (an unawaited call can corrupt `act()` tracking and break a *later* test in the same file). The one documented exception already in this codebase: `features/tasks/__tests__/hooks.test.tsx`'s mutation-probe tests use a bare `fireEvent.press(screen.getByText(...))` (unawaited) followed by `await waitFor(...)` — that specific pattern is already proven safe in that exact file (it triggers `.mutate()` via a direct prop press, not a text-input change) and Task 1 below preserves it exactly, don't "fix" it by adding `await`.
- **Button styling for both new "cancel" buttons reuses the existing destructive/red pattern verbatim** — `TaskActionZone`'s "Cancelar tarea" mirrors its own existing "Retirar oferta" button (`bg-red-500 rounded-xl h-11 items-center justify-center`, white bold sm text); `PublishedTaskRow`'s "Cancelar" mirrors `MyOfferRow`'s existing withdraw button (`mt-3 bg-red-500 px-3 py-2 rounded-xl self-start`, white bold xs text). Not a new design decision — reusing what's already approved.
- **Confirmation dialog button labels are `'Volver'` (dismiss) / `'Sí, cancelar'` (confirm)** — deliberately NOT `'Cancelar'` for the dismiss button, since that would read as two buttons both saying some form of "Cancelar" next to each other (confusing). This is decided, not open for reinterpretation.
- **Confirmation message has three forms** depending on how many pending offers exist on the task, matching the singular/plural convention `PublishedTaskRow.statusLine` already established for offer counts:
  - 0 offers: `'¿Cancelar esta tarea? No podrás reabrirla.'`
  - 1 offer: `'¿Cancelar esta tarea? Se cancelará también 1 oferta recibida. No podrás reabrirla.'`
  - 2+ offers: `` `¿Cancelar esta tarea? Se cancelarán también las ${offerCount} ofertas recibidas. No podrás reabrirla.` ``
- **`PublishedTaskRow`'s restructure avoids the nested-`Pressable` problem entirely, not just works around it.** The new "Cancelar" button is a *sibling* of the navigation `Pressable`, both inside a plain `View` — not nested inside it. So no `stopPropagation()` or similar workaround is needed (unlike the bug fixed in an earlier sub-project's category-picker modal, which involved genuine nesting).

---

### Task 1: `features/tasks/api.ts` + `features/tasks/hooks.ts` — `cancelTask` + `useCancelTask` (TDD)

**Files:**
- Modify: `features/tasks/api.ts`
- Modify: `features/tasks/hooks.ts`
- Modify: `features/tasks/__tests__/hooks.test.tsx`

- [ ] **Step 1: Write the failing tests (replaces the whole test file)**

```tsx
// features/tasks/__tests__/hooks.test.tsx
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOpenTasks, useTask, useCategories, useCreateTask, useMyTasks, useCompleteTask, useCancelTask } from '@/features/tasks/hooks';
import type { CreateTaskInput, MyPublishedTask, TaskWithRelations } from '@/features/tasks/types';

jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
  fetchCategories: jest.fn(),
  createTask: jest.fn(),
  fetchMyTasks: jest.fn(),
  completeTask: jest.fn(),
  cancelTask: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask, fetchMyTasks, completeTask, cancelTask } from '@/features/tasks/api';
import { useAuth } from '@/features/auth/useAuth';

// RNTL 14: render is async; queries come off the global `screen`, not the
// render() return value (see LoginForm.test.tsx / ProfileForm.test.tsx for
// the established pattern in this codebase).
async function renderWithClient(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  await render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
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

const sampleMyTask: MyPublishedTask = {
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
  created_at: '2026-07-09T10:00:00.000Z',
  updated_at: '2026-07-09T10:00:00.000Z',
  offer_count: 2,
  assigned_freelancer: null,
};

function MyTasksProbe() {
  const { data, isPending } = useMyTasks();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} mis tareas</Text>;
}

function CompleteTaskProbe() {
  const mutation = useCompleteTask();
  if (mutation.isSuccess) return <Text>completed</Text>;
  return <Text onPress={() => mutation.mutate('t1')}>complete</Text>;
}

function CancelTaskProbe() {
  const mutation = useCancelTask();
  if (mutation.isSuccess) return <Text>cancelled</Text>;
  return <Text onPress={() => mutation.mutate('t1')}>cancel</Text>;
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

describe('useCategories', () => {
  it('resolves with the categories returned by fetchCategories', async () => {
    (fetchCategories as jest.Mock).mockResolvedValue([
      { id: 1, name: 'Limpieza del hogar', slug: 'limpieza-hogar' },
      { id: 3, name: 'Plomería', slug: 'plomeria' },
    ]);
    await renderWithClient(<CategoriesProbe />);
    await waitFor(() => expect(screen.getByText('2 categorías')).toBeTruthy());
  });
});

describe('useCreateTask', () => {
  it('calls createTask with the current session user id and the input', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (createTask as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<CreateTaskProbe />);
    fireEvent.press(screen.getByText('submit'));
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(createTask).toHaveBeenCalledWith('u1', sampleInput);
  });

  it('invalidates the open-tasks list query on success', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (createTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<CreateTaskProbe />, client);
    fireEvent.press(screen.getByText('submit'));
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] });
  });
});

describe('useMyTasks', () => {
  it('resolves with the tasks returned by fetchMyTasks for the current user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (fetchMyTasks as jest.Mock).mockResolvedValue([sampleMyTask]);
    await renderWithClient(<MyTasksProbe />);
    await waitFor(() => expect(screen.getByText('1 mis tareas')).toBeTruthy());
    expect(fetchMyTasks).toHaveBeenCalledWith('u1');
  });
});

describe('useCompleteTask', () => {
  it('calls completeTask with the task id', async () => {
    (completeTask as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<CompleteTaskProbe />);
    fireEvent.press(screen.getByText('complete'));
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(completeTask).toHaveBeenCalledWith('t1');
  });

  it('invalidates the task detail and my-tasks list queries on success', async () => {
    (completeTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<CompleteTaskProbe />, client);
    fireEvent.press(screen.getByText('complete'));
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list', 'mine'] });
  });
});

describe('useCancelTask', () => {
  it('calls cancelTask with the task id', async () => {
    (cancelTask as jest.Mock).mockResolvedValue(undefined);
    await renderWithClient(<CancelTaskProbe />);
    fireEvent.press(screen.getByText('cancel'));
    await waitFor(() => expect(screen.getByText('cancelled')).toBeTruthy());
    expect(cancelTask).toHaveBeenCalledWith('t1');
  });

  it('invalidates the task detail and all task lists on success', async () => {
    (cancelTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<CancelTaskProbe />, client);
    fireEvent.press(screen.getByText('cancel'));
    await waitFor(() => expect(screen.getByText('cancelled')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: FAIL — `useCancelTask` is not exported from `@/features/tasks/hooks`, and `cancelTask` is not exported from `@/features/tasks/api`.

- [ ] **Step 3: Implement `cancelTask` in api.ts**

Append at the end of `features/tasks/api.ts` (after `completeTask`):

```typescript
// No RPC needed — enforce_task_status_transitions already allows
// open -> cancelled via a plain update, protected by tasks_update_own.
export async function cancelTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status: 'cancelled' }).eq('id', taskId);
  if (error) throw error;
}
```

- [ ] **Step 4: Implement `useCancelTask` in hooks.ts**

Update the top import line of `features/tasks/hooks.ts` to:

```typescript
import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask, fetchMyTasks, completeTask, cancelTask } from '@/features/tasks/api';
```

Append at the end of the file:

```typescript
export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => cancelTask(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: PASS (10 assertions: the file went from 8 to 10, a net +2).

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 144 prior + 2 net-new = **146**.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add cancelTask and useCancelTask"
```

---

### Task 2: `components/offers/MyOfferRow.tsx` — "Tarea cancelada" awareness (TDD)

**Files:**
- Modify: `components/offers/MyOfferRow.tsx`
- Modify: `components/offers/__tests__/MyOfferRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Append this test case inside the existing `describe('MyOfferRow', ...)` block in `components/offers/__tests__/MyOfferRow.test.tsx` (after the last existing test, before the closing `});`):

```tsx
  it("shows Tarea cancelada and hides the withdraw button when a pending offer's task was cancelled", async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'cancelled' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('$85.000 · Tarea cancelada')).toBeTruthy();
    expect(screen.queryByText('Retirar oferta')).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/offers/__tests__/MyOfferRow.test.tsx`
Expected: FAIL — currently renders `$85.000 · Pendiente` and shows the withdraw button, since the component doesn't yet check `offer.task?.status`.

- [ ] **Step 3: Implement the component**

Replace the entire content of `components/offers/MyOfferRow.tsx`:

```tsx
// components/offers/MyOfferRow.tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { formatBudget } from '@/features/tasks/format';
import type { MyOfferWithTask } from '@/features/offers/types';

const STATUS_LABEL: Record<MyOfferWithTask['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  withdrawn: 'Retirada',
};

interface MyOfferRowProps {
  offer: MyOfferWithTask;
  onWithdraw: () => void;
  disabled?: boolean;
}

export function MyOfferRow({ offer, onWithdraw, disabled }: MyOfferRowProps) {
  // A pending offer's task can be cancelled without anything transitioning
  // the offer itself — offers has no trigger/RPC for this, see the plan's
  // "Before you start" and the design spec. Surface it here instead.
  const isOrphanedByCancelledTask = offer.status === 'pending' && offer.task?.status === 'cancelled';
  const statusText = isOrphanedByCancelledTask ? 'Tarea cancelada' : STATUS_LABEL[offer.status];

  return (
    <View testID="my-offer-row" className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <Text className="text-slate-900 font-bold text-sm">{offer.task?.title ?? 'Tarea ya no disponible'}</Text>
      <Text className="text-slate-500 text-xs mt-1">
        {formatBudget(offer.price)} · {statusText}
      </Text>
      {offer.status === 'pending' && !isOrphanedByCancelledTask ? (
        <Pressable
          testID="withdraw-offer-button"
          accessibilityRole="button"
          onPress={onWithdraw}
          disabled={disabled}
          className="mt-3 bg-red-500 px-3 py-2 rounded-xl self-start"
        >
          {disabled ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-xs">Retirar oferta</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/offers/__tests__/MyOfferRow.test.tsx`
Expected: PASS (6 test cases; the file went from 5 to 6, a net +1).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 146 prior + 1 new = **147**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: show Tarea cancelada in MyOfferRow for orphaned pending offers"
```

---

### Task 3: `components/tasks/TaskActionZone.tsx` — "Cancelar tarea" button (TDD)

**Files:**
- Modify: `components/tasks/TaskActionZone.tsx`
- Modify: `components/tasks/__tests__/TaskActionZone.test.tsx`

- [ ] **Step 1: Write the failing tests (replaces the whole test file)**

```tsx
// components/tasks/__tests__/TaskActionZone.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TaskActionZone } from '@/components/tasks/TaskActionZone';
import type { TaskWithRelations } from '@/features/tasks/types';
import type { OfferWithFreelancer } from '@/features/offers/types';

const baseTask: TaskWithRelations = {
  id: 't1',
  client_id: 'owner-1',
  category_id: 1,
  title: 'Arreglar fuga',
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

function offer(overrides: Partial<OfferWithFreelancer>): OfferWithFreelancer {
  return {
    id: 'o1',
    task_id: 't1',
    freelancer_id: 'freelancer-1',
    price: 85000,
    message: null,
    status: 'pending',
    created_at: new Date().toISOString(),
    freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    ...overrides,
  };
}

const noop = { onAccept: jest.fn(), onWithdraw: jest.fn(), onComplete: jest.fn(), onOffer: jest.fn(), onCancel: jest.fn() };
const flags = { accepting: false, withdrawing: false, completing: false, cancelling: false };

describe('TaskActionZone', () => {
  it('Case A: owner, open, no offers - shows a Cancelar tarea button', async () => {
    await render(<TaskActionZone task={baseTask} offers={[]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Aún no has recibido ofertas para esta tarea.')).toBeTruthy();
    expect(screen.getByText('Cancelar tarea')).toBeTruthy();
  });

  it('Case A: pressing Cancelar tarea calls onCancel', async () => {
    const onCancel = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[]} myId="owner-1" {...flags} {...noop} onCancel={onCancel} />,
    );
    await fireEvent.press(screen.getByText('Cancelar tarea'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Case B: owner, open, with offers - lists them with an Aceptar button and a Cancelar tarea button', async () => {
    await render(<TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Carlos Ruiz · $85.000')).toBeTruthy();
    expect(screen.getByText('Aceptar')).toBeTruthy();
    expect(screen.getByText('Cancelar tarea')).toBeTruthy();
  });

  it('Case B: pressing Aceptar calls onAccept with the offer id, freelancer name, and price', async () => {
    const onAccept = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} onAccept={onAccept} />,
    );
    await fireEvent.press(screen.getByText('Aceptar'));
    expect(onAccept).toHaveBeenCalledWith('o1', 'Carlos Ruiz', 85000);
  });

  it('Case B: pressing Cancelar tarea calls onCancel even when offers exist', async () => {
    const onCancel = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} onCancel={onCancel} />,
    );
    await fireEvent.press(screen.getByText('Cancelar tarea'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Case C: owner, assigned - shows the winner and a Marcar como completada button', async () => {
    const task = { ...baseTask, status: 'assigned' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone task={task} offers={[offer({ status: 'accepted' })]} myId="owner-1" {...flags} {...noop} />,
    );
    expect(screen.getByText('Asignada a Carlos Ruiz')).toBeTruthy();
    expect(screen.getByText('Marcar como completada')).toBeTruthy();
  });

  it('Case C: pressing Marcar como completada calls onComplete', async () => {
    const task = { ...baseTask, status: 'assigned' as const, assigned_freelancer_id: 'freelancer-1' };
    const onComplete = jest.fn();
    await render(
      <TaskActionZone
        task={task}
        offers={[offer({ status: 'accepted' })]}
        myId="owner-1"
        {...flags}
        {...noop}
        onComplete={onComplete}
      />,
    );
    await fireEvent.press(screen.getByText('Marcar como completada'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('Case D: owner, completed - shows the completed message with the winner name, no action', async () => {
    const task = { ...baseTask, status: 'completed' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone task={task} offers={[offer({ status: 'accepted' })]} myId="owner-1" {...flags} {...noop} />,
    );
    expect(screen.getByText('Tarea completada · Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByText('Marcar como completada')).toBeNull();
  });

  it('Case E: assigned freelancer, assigned - shows an informative message, no action', async () => {
    const task = { ...baseTask, status: 'assigned' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone
        task={task}
        offers={[offer({ status: 'accepted' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Te asignaron esta tarea. Contacta al cliente para coordinar.')).toBeTruthy();
  });

  it('Case F: assigned freelancer, completed - shows a completed message', async () => {
    const task = { ...baseTask, status: 'completed' as const, assigned_freelancer_id: 'freelancer-1' };
    await render(
      <TaskActionZone
        task={task}
        offers={[offer({ status: 'accepted' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Trabajo completado.')).toBeTruthy();
  });

  it('Case G: not owner, not assigned, open, no offer yet - shows an Ofertar button', async () => {
    await render(<TaskActionZone task={baseTask} offers={[]} myId="freelancer-1" {...flags} {...noop} />);
    expect(screen.getByText('Ofertar')).toBeTruthy();
  });

  it('Case G: pressing Ofertar calls onOffer', async () => {
    const onOffer = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[]} myId="freelancer-1" {...flags} {...noop} onOffer={onOffer} />,
    );
    await fireEvent.press(screen.getByText('Ofertar'));
    expect(onOffer).toHaveBeenCalledTimes(1);
  });

  it('Case H: not owner, my offer is pending - shows the price and a Retirar oferta button', async () => {
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'pending' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Ya ofertaste $85.000 · Pendiente')).toBeTruthy();
    expect(screen.getByText('Retirar oferta')).toBeTruthy();
  });

  it('Case H: pressing Retirar oferta calls onWithdraw with the offer id', async () => {
    const onWithdraw = jest.fn();
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'pending' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
        onWithdraw={onWithdraw}
      />,
    );
    await fireEvent.press(screen.getByText('Retirar oferta'));
    expect(onWithdraw).toHaveBeenCalledWith('o1');
  });

  it('Case I: not owner, my offer was withdrawn - shows a blocked message, no button', async () => {
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'withdrawn' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Ya no puedes ofertar en esta tarea.')).toBeTruthy();
    expect(screen.queryByText('Retirar oferta')).toBeNull();
  });

  it('Case I: not owner, my offer was rejected - shows the same blocked message', async () => {
    await render(
      <TaskActionZone
        task={baseTask}
        offers={[offer({ freelancer_id: 'freelancer-1', status: 'rejected' })]}
        myId="freelancer-1"
        {...flags}
        {...noop}
      />,
    );
    expect(screen.getByText('Ya no puedes ofertar en esta tarea.')).toBeTruthy();
  });

  it('Case J: owner, cancelled - shows a cancelled message, no Cancelar tarea button', async () => {
    const task = { ...baseTask, status: 'cancelled' as const };
    await render(<TaskActionZone task={task} offers={[]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Tarea cancelada.')).toBeTruthy();
    expect(screen.queryByText('Cancelar tarea')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/tasks/__tests__/TaskActionZone.test.tsx`
Expected: FAIL — `TaskActionZoneProps` doesn't have `cancelling`/`onCancel` yet, and cases A/B don't render a "Cancelar tarea" button.

- [ ] **Step 3: Implement the component**

Replace the entire content of `components/tasks/TaskActionZone.tsx`:

```tsx
// components/tasks/TaskActionZone.tsx
import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { OfferListItem } from '@/components/offers/OfferListItem';
import { formatBudget } from '@/features/tasks/format';
import type { TaskWithRelations } from '@/features/tasks/types';
import type { OfferWithFreelancer } from '@/features/offers/types';

interface TaskActionZoneProps {
  task: TaskWithRelations;
  offers: OfferWithFreelancer[];
  myId: string | undefined;
  accepting: boolean;
  withdrawing: boolean;
  completing: boolean;
  cancelling: boolean;
  onAccept: (offerId: string, freelancerName: string, price: number) => void;
  onWithdraw: (offerId: string) => void;
  onComplete: () => void;
  onOffer: () => void;
  onCancel: () => void;
}

function CancelTaskButton({ cancelling, onCancel }: { cancelling: boolean; onCancel: () => void }) {
  return (
    <Pressable
      testID="cancel-task-button"
      accessibilityRole="button"
      onPress={onCancel}
      disabled={cancelling}
      className="mt-3 bg-red-500 rounded-xl h-11 items-center justify-center"
    >
      {cancelling ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <Text className="text-white font-bold text-sm">Cancelar tarea</Text>
      )}
    </Pressable>
  );
}

// Explicit `: ReactElement` return type + a switch with no `default` case is
// what makes this exhaustive over TaskStatus: if a 5th status is ever added,
// tsc fails with "not all code paths return a value" until every branch
// below handles it. Matches the technique PublishedTaskRow.statusLine uses.
function renderOwnerZone(
  task: TaskWithRelations,
  offers: OfferWithFreelancer[],
  accepting: boolean,
  completing: boolean,
  cancelling: boolean,
  onAccept: (offerId: string, freelancerName: string, price: number) => void,
  onComplete: () => void,
  onCancel: () => void,
): ReactElement {
  switch (task.status) {
    case 'open': {
      if (offers.length === 0) {
        return (
          <View>
            <Text className="text-slate-500 text-sm text-center">
              Aún no has recibido ofertas para esta tarea.
            </Text>
            <CancelTaskButton cancelling={cancelling} onCancel={onCancel} />
          </View>
        );
      }
      return (
        <View>
          {offers.map((offer) => (
            <OfferListItem
              key={offer.id}
              offer={offer}
              disabled={accepting}
              onAccept={() => onAccept(offer.id, offer.freelancer.full_name ?? 'Anónimo', offer.price)}
            />
          ))}
          <CancelTaskButton cancelling={cancelling} onCancel={onCancel} />
        </View>
      );
    }
    case 'assigned': {
      const winner = offers.find((o) => o.status === 'accepted');
      return (
        <View>
          <Text className="text-slate-500 text-sm mb-3">
            Asignada a {winner?.freelancer.full_name ?? 'freelancer'}
          </Text>
          <Pressable
            testID="complete-task-button"
            accessibilityRole="button"
            onPress={onComplete}
            disabled={completing}
            className="bg-brand rounded-xl h-11 items-center justify-center"
          >
            {completing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-bold text-sm">Marcar como completada</Text>
            )}
          </Pressable>
        </View>
      );
    }
    case 'completed': {
      // winner should always be found here: enforce_task_status_transitions()
      // (supabase/migrations/20260702000003_create_tasks.sql) only allows
      // completed to be reached from assigned, and assigned_freelancer_id is
      // only ever set together with an open->assigned transition performed by
      // accept_offer() — which accepts the winning offer in the same
      // transaction. The `?? ''` fallback is defensive only.
      const winner = offers.find((o) => o.status === 'accepted');
      return (
        <Text className="text-slate-500 text-sm text-center">
          Tarea completada{winner?.freelancer.full_name ? ` · ${winner.freelancer.full_name}` : ''}
        </Text>
      );
    }
    case 'cancelled':
      return <Text className="text-slate-400 text-sm text-center">Tarea cancelada.</Text>;
  }
}

function renderAssignedFreelancerZone(task: TaskWithRelations): ReactElement | null {
  switch (task.status) {
    case 'assigned':
      return (
        <Text className="text-slate-500 text-sm text-center">
          Te asignaron esta tarea. Contacta al cliente para coordinar.
        </Text>
      );
    case 'completed':
      return <Text className="text-slate-500 text-sm text-center">Trabajo completado.</Text>;
    case 'open':
    case 'cancelled':
      // Unreachable in practice: assigned_freelancer_id only changes together
      // with an open->assigned transition via accept_offer() (see
      // enforce_task_status_transitions() in
      // supabase/migrations/20260702000003_create_tasks.sql), so a caller who
      // is the assigned_freelancer can only ever observe 'assigned' or
      // 'completed' here — never the pre-assignment 'open' or a 'cancelled'
      // task (cancellation is only reachable from 'open', before assignment).
      return null;
  }
}

export function TaskActionZone({
  task,
  offers,
  myId,
  accepting,
  withdrawing,
  completing,
  cancelling,
  onAccept,
  onWithdraw,
  onComplete,
  onOffer,
  onCancel,
}: TaskActionZoneProps) {
  const isOwner = task.client_id === myId;
  const isAssignedFreelancer = task.assigned_freelancer_id !== null && task.assigned_freelancer_id === myId;

  if (isOwner) {
    return renderOwnerZone(task, offers, accepting, completing, cancelling, onAccept, onComplete, onCancel);
  }

  if (isAssignedFreelancer) {
    return renderAssignedFreelancerZone(task);
  }

  const myOffer = offers.find((o) => o.freelancer_id === myId);
  if (!myOffer) {
    return (
      <Pressable
        testID="offer-button"
        accessibilityRole="button"
        onPress={onOffer}
        className="bg-brand rounded-xl h-11 items-center justify-center"
      >
        <Text className="text-white font-bold text-sm">Ofertar</Text>
      </Pressable>
    );
  }
  if (myOffer.status === 'pending') {
    return (
      <View>
        <Text className="text-slate-500 text-sm mb-3">
          Ya ofertaste {formatBudget(myOffer.price)} · Pendiente
        </Text>
        <Pressable
          testID="withdraw-offer-button"
          accessibilityRole="button"
          onPress={() => onWithdraw(myOffer.id)}
          disabled={withdrawing}
          className="bg-red-500 rounded-xl h-11 items-center justify-center"
        >
          {withdrawing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-sm">Retirar oferta</Text>
          )}
        </Pressable>
      </View>
    );
  }
  // Covers 'rejected' and 'withdrawn', plus the technically-unreachable
  // 'accepted': accept_offer() sets assigned_freelancer_id to the accepted
  // offer's freelancer_id in the same transaction, so a caller whose own
  // offer is 'accepted' would already be isAssignedFreelancer above and never
  // reach this branch. offer_insert_is_valid/offers_insert_own (see
  // supabase/migrations/20260702000004_create_offers.sql) also guarantee
  // client_id <> freelancer_id, so isOwner and isAssignedFreelancer can never
  // both be true for the same task.
  return <Text className="text-slate-400 text-sm text-center">Ya no puedes ofertar en esta tarea.</Text>;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/tasks/__tests__/TaskActionZone.test.tsx`
Expected: PASS (17 test cases; the file went from 15 to 17, a net +2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 147 prior + 2 new = **149**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add a Cancelar tarea button to TaskActionZone's owner+open cases"
```

---

### Task 4: `components/tasks/PublishedTaskRow.tsx` — restructure + "Cancelar" button (TDD)

**Files:**
- Modify: `components/tasks/PublishedTaskRow.tsx`
- Modify: `components/tasks/__tests__/PublishedTaskRow.test.tsx`

- [ ] **Step 1: Write the failing tests (replaces the whole test file)**

```tsx
// components/tasks/__tests__/PublishedTaskRow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PublishedTaskRow } from '@/components/tasks/PublishedTaskRow';
import type { MyPublishedTask } from '@/features/tasks/types';

const baseTask: Omit<MyPublishedTask, 'status' | 'assigned_freelancer_id' | 'offer_count' | 'assigned_freelancer'> = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const noop = { onPress: jest.fn(), onCancel: jest.fn() };

describe('PublishedTaskRow', () => {
  it('shows the offer count and a Cancelar button for an open task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 3,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Arreglar fuga')).toBeTruthy();
    expect(screen.getByText('Abierta · 3 ofertas recibidas')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });

  it('uses singular wording for exactly one offer', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 1,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Abierta · 1 oferta recibida')).toBeTruthy();
  });

  it('shows the assigned freelancer for an assigned task, and hides Cancelar', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'assigned',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Asignada a Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('shows the freelancer name for a completed task, and hides Cancelar', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'completed',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} cancelling={false} {...noop} />);
    expect(screen.getByText('Completada · Carlos Ruiz')).toBeTruthy();
    expect(screen.queryByText('Cancelar')).toBeNull();
  });

  it('calls onPress when the row content is tapped', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    const onPress = jest.fn();
    await render(<PublishedTaskRow task={task} cancelling={false} onPress={onPress} onCancel={jest.fn()} />);
    await fireEvent.press(screen.getByText('Arreglar fuga'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel (not onPress) when Cancelar is tapped', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    const onPress = jest.fn();
    const onCancel = jest.fn();
    await render(<PublishedTaskRow task={task} cancelling={false} onPress={onPress} onCancel={onCancel} />);
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disables the Cancelar button when cancelling is true', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} cancelling {...noop} />);
    expect(screen.getByTestId('cancel-task-row-button').props.accessibilityState?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/tasks/__tests__/PublishedTaskRow.test.tsx`
Expected: FAIL — `onCancel`/`cancelling` props don't exist yet, no "Cancelar" button is rendered.

- [ ] **Step 3: Implement the component**

Replace the entire content of `components/tasks/PublishedTaskRow.tsx`:

```tsx
// components/tasks/PublishedTaskRow.tsx
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { MyPublishedTask } from '@/features/tasks/types';

function statusLine(task: MyPublishedTask): string {
  switch (task.status) {
    case 'open':
      return task.offer_count === 1
        ? 'Abierta · 1 oferta recibida'
        : `Abierta · ${task.offer_count} ofertas recibidas`;
    case 'assigned':
      return task.assigned_freelancer?.full_name
        ? `Asignada a ${task.assigned_freelancer.full_name}`
        : 'Asignada';
    case 'completed':
      return task.assigned_freelancer?.full_name
        ? `Completada · ${task.assigned_freelancer.full_name}`
        : 'Completada';
    case 'cancelled':
      return 'Cancelada';
  }
}

interface PublishedTaskRowProps {
  task: MyPublishedTask;
  onPress: () => void;
  onCancel: () => void;
  cancelling: boolean;
}

export function PublishedTaskRow({ task, onPress, onCancel, cancelling }: PublishedTaskRowProps) {
  return (
    <View testID="published-task-row" className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <Pressable testID="published-task-row-content" accessibilityRole="button" onPress={onPress}>
        <Text className="text-slate-900 font-bold text-sm">{task.title}</Text>
        <Text className="text-slate-500 text-xs mt-1">{statusLine(task)}</Text>
      </Pressable>
      {task.status === 'open' ? (
        <Pressable
          testID="cancel-task-row-button"
          accessibilityRole="button"
          onPress={onCancel}
          disabled={cancelling}
          className="mt-3 bg-red-500 px-3 py-2 rounded-xl self-start"
        >
          {cancelling ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-white font-bold text-xs">Cancelar</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/tasks/__tests__/PublishedTaskRow.test.tsx`
Expected: PASS (7 test cases; the file went from 5 to 7, a net +2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 149 prior + 2 new = **151**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add an inline Cancelar button to PublishedTaskRow"
```

---

### Task 5: Wire `app/task/[id].tsx` — `handleCancel` + confirmation (TDD)

**Files:**
- Modify: `app/task/[id].tsx`
- Modify: `app/task/__tests__/task-detail.test.tsx`

- [ ] **Step 1: Write the failing tests**

Update the mocks and add two new test cases to `app/task/__tests__/task-detail.test.tsx`. Update the `jest.mock('@/features/tasks/hooks', ...)` factory to add `useCancelTask: jest.fn()`:

```tsx
jest.mock('@/features/tasks/hooks', () => ({
  useTask: jest.fn(),
  useCompleteTask: jest.fn(),
  useCancelTask: jest.fn(),
}));
```

Update the import line accordingly:

```tsx
import { useTask, useCompleteTask, useCancelTask } from '@/features/tasks/hooks';
```

Update `mockActionDefaults` to include the new hook:

```tsx
function mockActionDefaults() {
  (useCompleteTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useAcceptOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
}
```

Add these two test cases at the end of the `describe('TaskDetailScreen', ...)` block, before the closing `});`:

```tsx
  it('asks for confirmation before cancelling a task with no offers, and calls cancelTask when confirmed', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    const cancelTask = jest.fn().mockResolvedValue(undefined);
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: cancelTask, isPending: false });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toBe('¿Cancelar esta tarea? No podrás reabrirla.');
      const confirmButton = buttons?.find((b) => b.text === 'Sí, cancelar');
      confirmButton?.onPress?.();
    });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Cancelar tarea'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith('t1'));
  });

  it('includes the offer count in the cancel confirmation message when there is a pending offer', async () => {
    const receivedOffer = {
      id: 'o1',
      task_id: 't1',
      freelancer_id: 'u2',
      price: 85000,
      message: null,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    };
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [receivedOffer], isPending: false, isError: false });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message) => {
      expect(message).toBe('¿Cancelar esta tarea? Se cancelará también 1 oferta recibida. No podrás reabrirla.');
    });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Cancelar tarea'));

    expect(alertSpy).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/task/__tests__/task-detail.test.tsx`
Expected: FAIL — `useCancelTask` mock exists but the screen doesn't call it or render a "Cancelar tarea" button yet.

- [ ] **Step 3: Implement the updated screen**

Replace the entire content of `app/task/[id].tsx`:

```tsx
// app/task/[id].tsx
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTask, useCompleteTask, useCancelTask } from '@/features/tasks/hooks';
import { useOffersForTask, useAcceptOffer, useWithdrawOffer } from '@/features/offers/hooks';
import { useAuth } from '@/features/auth/useAuth';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';
import { mapAuthError } from '@/features/auth/errors';
import { TaskActionZone } from '@/components/tasks/TaskActionZone';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { data: task, isPending: taskPending, isError: taskError, refetch: refetchTask } = useTask(id);
  const {
    data: offers,
    isPending: offersPending,
    isError: offersError,
    refetch: refetchOffers,
  } = useOffersForTask(id);
  const { mutateAsync: acceptOffer, isPending: accepting } = useAcceptOffer();
  const { mutateAsync: withdrawOffer, isPending: withdrawing } = useWithdrawOffer();
  const { mutateAsync: completeTask, isPending: completing } = useCompleteTask();
  const { mutateAsync: cancelTask, isPending: cancelling } = useCancelTask();
  const [actionError, setActionError] = useState<string | null>(null);

  const isPending = taskPending || offersPending;
  const isError = taskError || offersError;
  const refetch = () => {
    refetchTask();
    refetchOffers();
  };

  const confirmAccept = async (offerId: string) => {
    setActionError(null);
    try {
      await acceptOffer({ offerId, taskId: id });
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al aceptar la oferta');
    }
  };

  const handleAccept = (offerId: string, freelancerName: string, price: number) => {
    Alert.alert(
      'Aceptar oferta',
      `¿Aceptar la oferta de ${freelancerName} por ${formatBudget(price)}? Se rechazarán las demás ofertas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar', onPress: () => confirmAccept(offerId) },
      ],
    );
  };

  const handleWithdraw = async (offerId: string) => {
    setActionError(null);
    try {
      await withdrawOffer({ offerId, taskId: id });
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al retirar la oferta');
    }
  };

  const handleComplete = async () => {
    setActionError(null);
    try {
      await completeTask(id);
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al completar la tarea');
    }
  };

  const confirmCancel = async () => {
    setActionError(null);
    try {
      await cancelTask(id);
    } catch (e) {
      setActionError(e instanceof Error ? mapAuthError(e.message) : 'Error al cancelar la tarea');
    }
  };

  const handleCancel = () => {
    const offerCount = offers?.length ?? 0;
    const message =
      offerCount === 0
        ? '¿Cancelar esta tarea? No podrás reabrirla.'
        : offerCount === 1
          ? '¿Cancelar esta tarea? Se cancelará también 1 oferta recibida. No podrás reabrirla.'
          : `¿Cancelar esta tarea? Se cancelarán también las ${offerCount} ofertas recibidas. No podrás reabrirla.`;
    Alert.alert('Cancelar tarea', message, [
      { text: 'Volver', style: 'cancel' },
      { text: 'Sí, cancelar', onPress: () => confirmCancel() },
    ]);
  };

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
          <Text className="text-slate-500 text-center mb-4">No pudimos cargar esta tarea.</Text>
          <Pressable onPress={() => refetch()} className="bg-brand px-4 py-2 rounded-xl">
            <Text className="text-white font-bold">Reintentar</Text>
          </Pressable>
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
            {actionError ? <Text className="text-xs text-red-500 mb-2">{actionError}</Text> : null}
            <TaskActionZone
              task={task}
              offers={offers ?? []}
              myId={session?.user.id}
              accepting={accepting}
              withdrawing={withdrawing}
              completing={completing}
              cancelling={cancelling}
              onAccept={handleAccept}
              onWithdraw={handleWithdraw}
              onComplete={handleComplete}
              onOffer={() => router.push({ pathname: '/offer/create', params: { taskId: task.id } })}
              onCancel={handleCancel}
            />
          </View>
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- app/task/__tests__/task-detail.test.tsx`
Expected: PASS (9 test cases; the file went from 7 to 9, a net +2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 151 prior + 2 new = **153**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire task detail screen to cancelTask with confirmation"
```

---

### Task 6: Wire `app/(tabs)/my-tasks.tsx` — inline cancel from Publicadas (TDD)

**Files:**
- Modify: `app/(tabs)/my-tasks.tsx`
- Modify: `app/(tabs)/__tests__/my-tasks.test.tsx`

- [ ] **Step 1: Write the failing tests**

Update `app/(tabs)/__tests__/my-tasks.test.tsx`: add the `Alert` import, update the `@/features/tasks/hooks` mock to include `useCancelTask`, import it, and add two new test cases.

Update the top of the file:

```tsx
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import MyTasks from '@/app/(tabs)/my-tasks';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/features/tasks/hooks', () => ({
  useMyTasks: jest.fn(),
  useCancelTask: jest.fn(),
}));

jest.mock('@/features/offers/hooks', () => ({
  useMyOffers: jest.fn(),
  useWithdrawOffer: jest.fn(),
}));

import { useMyTasks, useCancelTask } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';
```

Update `mockDefaults`:

```tsx
function mockDefaults() {
  (useMyTasks as jest.Mock).mockReturnValue({ data: [publishedTask], isPending: false, isError: false, refetch: jest.fn() });
  (useMyOffers as jest.Mock).mockReturnValue({ data: [myOffer], isPending: false, isError: false, refetch: jest.fn() });
  (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
}
```

Add these two test cases at the end of `describe('MyTasks', ...)`, before the closing `});`:

```tsx
  it('asks for confirmation before cancelling a task from Publicadas, and calls cancelTask when confirmed', async () => {
    const cancelTask = jest.fn().mockResolvedValue(undefined);
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: cancelTask, isPending: false });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, message, buttons) => {
      expect(message).toBe('¿Cancelar esta tarea? Se cancelarán también las 2 ofertas recibidas. No podrás reabrirla.');
      const confirmButton = buttons?.find((b) => b.text === 'Sí, cancelar');
      confirmButton?.onPress?.();
    });

    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Cancelar'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(cancelTask).toHaveBeenCalledWith('t1'));
  });

  it('shows an error message when cancelling a task fails', async () => {
    const cancelTask = jest.fn().mockRejectedValue(new Error('network error'));
    (useCancelTask as jest.Mock).mockReturnValue({ mutateAsync: cancelTask, isPending: false });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Sí, cancelar');
      confirmButton?.onPress?.();
    });

    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Cancelar'));

    await waitFor(() => expect(screen.getByText('Algo salió mal. Intenta de nuevo.')).toBeTruthy());
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- my-tasks.test.tsx`
Expected: FAIL — `PublishedTaskRow` (used by `PublishedTasksList`) requires `onCancel`/`cancelling` props that `my-tasks.tsx` doesn't pass yet, and there's no "Cancelar" button wiring.

- [ ] **Step 3: Implement the screen**

Replace the entire content of `app/(tabs)/my-tasks.tsx`:

```tsx
// app/(tabs)/my-tasks.tsx
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublishedTaskRow } from '@/components/tasks/PublishedTaskRow';
import { MyOfferRow } from '@/components/offers/MyOfferRow';
import { useMyTasks, useCancelTask } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';
import { mapAuthError } from '@/features/auth/errors';
import type { MyPublishedTask } from '@/features/tasks/types';
import type { MyOfferWithTask } from '@/features/offers/types';

type SubTab = 'published' | 'jobs';

export default function MyTasks() {
  const [subTab, setSubTab] = useState<SubTab>('published');

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row border-b border-slate-200">
        <Pressable
          testID="sub-tab-published"
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'published' }}
          onPress={() => setSubTab('published')}
          className={`flex-1 items-center py-3 border-b-2 ${subTab === 'published' ? 'border-brand' : 'border-transparent'}`}
        >
          <Text className={subTab === 'published' ? 'text-brand font-bold' : 'text-slate-500'}>Publicadas</Text>
        </Pressable>
        <Pressable
          testID="sub-tab-jobs"
          accessibilityRole="tab"
          accessibilityState={{ selected: subTab === 'jobs' }}
          onPress={() => setSubTab('jobs')}
          className={`flex-1 items-center py-3 border-b-2 ${subTab === 'jobs' ? 'border-brand' : 'border-transparent'}`}
        >
          <Text className={subTab === 'jobs' ? 'text-brand font-bold' : 'text-slate-500'}>Trabajos</Text>
        </Pressable>
      </View>
      {subTab === 'published' ? <PublishedTasksList /> : <JobsList />}
    </View>
  );
}

function PublishedTasksList() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useMyTasks();
  const { mutateAsync: cancelTask, isPending: cancelling } = useCancelTask();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const confirmCancel = async (taskId: string) => {
    setCancelError(null);
    try {
      await cancelTask(taskId);
    } catch (e) {
      setCancelError(e instanceof Error ? mapAuthError(e.message) : 'Error al cancelar la tarea');
    }
  };

  const handleCancel = (taskId: string, offerCount: number) => {
    const message =
      offerCount === 0
        ? '¿Cancelar esta tarea? No podrás reabrirla.'
        : offerCount === 1
          ? '¿Cancelar esta tarea? Se cancelará también 1 oferta recibida. No podrás reabrirla.'
          : `¿Cancelar esta tarea? Se cancelarán también las ${offerCount} ofertas recibidas. No podrás reabrirla.`;
    Alert.alert('Cancelar tarea', message, [
      { text: 'Volver', style: 'cancel' },
      { text: 'Sí, cancelar', onPress: () => confirmCancel(taskId) },
    ]);
  };

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-slate-500 text-center mb-4">No pudimos cargar tus tareas.</Text>
        <Pressable onPress={() => refetch()} className="bg-brand px-4 py-2 rounded-xl">
          <Text className="text-white font-bold">Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="flex-1">
      {cancelError ? (
        <Text className="text-xs text-red-500 text-center mt-2">{cancelError}</Text>
      ) : null}
      <FlatList
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        data={data}
        keyExtractor={(item: MyPublishedTask) => item.id}
        renderItem={({ item }) => (
          <PublishedTaskRow
            task={item}
            onPress={() => router.push(`/task/${item.id}`)}
            onCancel={() => handleCancel(item.id, item.offer_count)}
            cancelling={cancelling}
          />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Text className="text-slate-500">Aún no has publicado ninguna tarea.</Text>
          </View>
        }
      />
    </View>
  );
}

function JobsList() {
  const { data, isPending, isError, refetch } = useMyOffers();
  const { mutateAsync: withdraw, isPending: withdrawing } = useWithdrawOffer();
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const handleWithdraw = async (offerId: string, taskId: string) => {
    setWithdrawError(null);
    try {
      await withdraw({ offerId, taskId });
    } catch (e) {
      setWithdrawError(e instanceof Error ? mapAuthError(e.message) : 'Error al retirar la oferta');
    }
  };

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (isError) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-slate-500 text-center mb-4">No pudimos cargar tus ofertas.</Text>
        <Pressable onPress={() => refetch()} className="bg-brand px-4 py-2 rounded-xl">
          <Text className="text-white font-bold">Reintentar</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View className="flex-1">
      {withdrawError ? (
        <Text className="text-xs text-red-500 text-center mt-2">{withdrawError}</Text>
      ) : null}
      <FlatList
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
        data={data}
        keyExtractor={(item: MyOfferWithTask) => item.id}
        renderItem={({ item }) => (
          <MyOfferRow
            offer={item}
            onWithdraw={() => handleWithdraw(item.id, item.task_id)}
            disabled={withdrawing}
          />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <Text className="text-slate-500">Aún no has hecho ninguna oferta.</Text>
          </View>
        }
      />
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- my-tasks.test.tsx`
Expected: PASS (7 test cases; the file went from 5 to 7, a net +2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 153 prior + 2 new = **155**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire inline task cancellation from Mis tareas > Publicadas"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass. Approximate total: **155** (144 pre-existing + 2 Task 1 + 1 Task 2 + 2 Task 3 + 2 Task 4 + 2 Task 5 + 2 Task 6). Zero failures. **Trust the live count over this arithmetic.**

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the bundler builds**

Run: `npx expo export --platform ios` (self-terminating; produces a real bundle rather than just waiting for the CLI banner).
Expected: bundles with no red errors. Delete the resulting `dist/` afterward (`rm -rf dist`) — it's gitignored but keep the tree clean.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for cancel-task sub-project" --allow-empty
```

---

## Notes for the executor

- **No live backend:** every test mocks `@/features/tasks/api`/`@/features/tasks/hooks`/`@/features/offers/hooks`/`@/features/auth/useAuth` — nothing hits a real Supabase instance. When Docker/`npx supabase start` is available again, manually verify: cancelling actually flips `status` to `'cancelled'` (not deleted), a cancelled task disappears from the open feed, a freelancer's pending offer on that task shows the orphaned state correctly, and the RLS trigger genuinely rejects any attempt to transition a task OUT of `'cancelled'` (already covered by the backend's own pgTAP suite, but worth a live sanity check).
- **Deferred, per the design spec:** permanent deletion (`tasks_delete_own_open` RLS exists but unused here); any transition out of `'cancelled'`; actively notifying freelancers whose offers got orphaned.
- **`mapAuthError`** is reused for the two new mutation error paths (`cancelTask` in both `task/[id].tsx` and `my-tasks.tsx`) — consistent with every other mutation in this app.
