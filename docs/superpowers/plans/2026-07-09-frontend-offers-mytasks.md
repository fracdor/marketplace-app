# Frontend App — Ofertar, Aceptar Oferta, Completar Tarea y "Mis Tareas" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the core task lifecycle (open → ofertar → aceptar → completar) and replace the `(tabs)/my-tasks.tsx` placeholder with a real screen showing the user's published tasks and their offers.

**Architecture:** A new `features/offers/` module (mirroring `features/tasks/`) handles offers CRUD + the `accept_offer` RPC. `features/tasks/` gains `fetchMyTasks`/`completeTask`. A new, purely-presentational `TaskActionZone` component owns the 10-case state routing for the task-detail screen's bottom section (tested standalone, no mocks needed). `app/task/[id].tsx` wires it to the real mutations plus a native `Alert.alert` confirmation before accepting. `app/(tabs)/my-tasks.tsx` gets two local sub-tabs (Publicadas/Trabajos, `useState`, not routes).

**Tech Stack:** React Hook Form, Zod, `@tanstack/react-query`, React Native's `Alert`, Jest (jest-expo) + React Native Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-07-09-frontend-offers-mytasks-design.md](../specs/2026-07-09-frontend-offers-mytasks-design.md)

---

## Before you start

- Work from the worktree `D:\App mario y yo\.worktrees\frontend-offers-mytasks` (branch `frontend-offers-mytasks`). **Always run `npm test`/`npx tsc` from inside this worktree, never the repo root** — repo-root runs double-count nested worktree test files elsewhere in this repo.
- **Baseline, verified live moments before writing this plan: 78 tests, 17 suites, `tsc --noEmit` clean.** Each task below states an approximate expected new/running total — treat these as sanity-check estimates, not ground truth. **Trust the actual `npm test` output over this plan's arithmetic.** (This project has previously shipped a plan with a wrong baseline number that had to be corrected mid-implementation — don't repeat that. If the live count differs from this plan's prediction by an amount you can't explain by re-reading the diff, stop and investigate; if it's just off by one and you can see why, note it and move on.)
- **Docker/Supabase local is still down.** Nothing in this plan needs it — every new test mocks `@/features/offers/api`, `@/features/offers/hooks`, `@/features/tasks/api`, `@/features/tasks/hooks`, or `@/features/auth/useAuth`, never a live database.
- **`jest` stays on `^29`.** No new npm packages are needed anywhere in this plan.
- **`@testing-library/react-native` v14's `render` and `fireEvent.press`/`fireEvent.changeText` are effectively async in this stack** (RN 0.86 + React 19 + RNTL v14) — every test below uses `await render(...)` and `await fireEvent.press(...)`, and wraps user-visible-after-a-promise assertions in `waitFor(...)`. This is the established, required pattern in this codebase (see `LoginForm.test.tsx`, and the `frontend-post-task` sub-project's `hooks.test.tsx`/`PostTaskForm.test.tsx`) — not a workaround.
- **`completeTask` needs no new RPC.** The `enforce_task_status_transitions` trigger (`supabase/migrations/20260702000003_create_tasks.sql`) already allows `assigned → completed` via a plain `UPDATE`, protected by the existing `tasks_update_own` RLS policy. Task 4 below is a plain Supabase `update`, not a `.rpc()` call.
- **`MyOfferWithTask.task` is nullable — this is a real RLS interaction, not defensive over-engineering.** `tasks_select_visible` RLS is `status = 'open' OR client_id = auth.uid() OR assigned_freelancer_id = auth.uid()`. If a freelancer's offer gets rejected because a *different* freelancer won the task, that freelancer can no longer see the task row at all (they're not the client, not the assigned freelancer, and it's no longer `open`) — but they can still see their own now-`rejected` offer via `offers_select_related` (`freelancer_id = auth.uid()`). So `fetchMyOffers`'s task join can legitimately come back empty for that row. `MyOfferRow` must render a fallback, not crash.
- **The non-null assertion `session!.user.id` in `useMyTasks`/`useMyOffers` is safe**, matching the existing pattern already used by the merged `useCreateTask`. Traced end-to-end: `app/index.tsx`'s root gate only ever navigates to `/(tabs)` after its `useEffect` sees `loading === false` (`if (loading) return;`), so by the time any `(tabs)/*` screen mounts, `session` is guaranteed resolved (either present, or `app/(tabs)/_layout.tsx`'s own `if (!loading && !session) return <Redirect .../>` has already sent the user to `/login` instead of rendering the tab content). No test needs to cover a "session is null" case for these two hooks — it cannot happen in practice.
- **`TaskActionZone` is a new, plain presentational component** (`task`, `offers`, `myId`, and callback props — no hooks of its own). This lets Task 10 test all 10 state-routing cases with zero mocking, and keeps `app/task/[id].tsx` itself focused on data-fetching + the `Alert.alert` confirmation wiring.
- **Query key reuse:** `features/offers/hooks.ts` imports `taskKeys` from `@/features/tasks/hooks` (offers naturally depends on tasks, not the reverse) to invalidate `taskKeys.detail`/`taskKeys.lists()` after `accept_offer` succeeds.
- `Alert` is a React Native core module — jest-expo's preset already provides it in the test environment; no extra mock setup needed beyond `jest.spyOn(Alert, 'alert')` inside the specific test that needs it.

---

### Task 1: `features/offers/types.ts` + `features/offers/schemas.ts` (TDD for schema)

**Files:**
- Create: `features/offers/types.ts`, `features/offers/schemas.ts`, `features/offers/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// features/offers/__tests__/schemas.test.ts
import { createOfferSchema } from '@/features/offers/schemas';

describe('createOfferSchema', () => {
  it('accepts a valid price with a message', () => {
    expect(createOfferSchema.safeParse({ price: '85000', message: 'Puedo empezar mañana' }).success).toBe(true);
  });

  it('accepts a valid price with an empty message', () => {
    expect(createOfferSchema.safeParse({ price: '85000', message: '' }).success).toBe(true);
  });

  it('rejects an empty price', () => {
    expect(createOfferSchema.safeParse({ price: '', message: '' }).success).toBe(false);
  });

  it('rejects a non-numeric price', () => {
    expect(createOfferSchema.safeParse({ price: 'abc', message: '' }).success).toBe(false);
  });

  it('rejects a zero price', () => {
    expect(createOfferSchema.safeParse({ price: '0', message: '' }).success).toBe(false);
  });

  it('trims whitespace around the price before validating', () => {
    expect(createOfferSchema.safeParse({ price: '  85000  ', message: '' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/offers/__tests__/schemas.test.ts`
Expected: FAIL — cannot find module `@/features/offers/schemas`.

- [ ] **Step 3: Create the types file**

```typescript
// features/offers/types.ts
import type { TaskStatus } from '@/features/tasks/types';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

// The raw shape of a row in public.offers.
export interface Offer {
  id: string;
  task_id: string;
  freelancer_id: string;
  price: number;
  message: string | null;
  status: OfferStatus;
  created_at: string;
}

export interface OfferFreelancer {
  full_name: string | null;
  avatar_url: string | null;
}

// What the task owner sees: an offer plus who made it.
export interface OfferWithFreelancer extends Offer {
  freelancer: OfferFreelancer;
}

// Minimal task info needed to render a row in "Trabajos". Nullable: RLS
// (tasks_select_visible) can hide the task from a freelancer whose offer was
// rejected once the task is assigned to someone else and no longer open —
// the offer itself stays visible (offers_select_related: freelancer_id =
// auth.uid()), but the joined task can come back null. See "Before you
// start" in the plan for the full trace.
export interface OfferTaskSummary {
  id: string;
  title: string;
  city: string;
  status: TaskStatus;
}

export interface MyOfferWithTask extends Offer {
  task: OfferTaskSummary | null;
}

export interface CreateOfferInput {
  task_id: string;
  price: number;
  message: string | null;
}
```

- [ ] **Step 4: Implement the schema**

```typescript
// features/offers/schemas.ts
import { z } from 'zod';

export const createOfferSchema = z.object({
  price: z.string().trim().refine(
    (v) => /^\d+$/.test(v) && Number(v) > 0,
    { message: 'El precio debe ser un número entero mayor a cero' },
  ),
  message: z.string(),
});
export type CreateOfferFormValues = z.infer<typeof createOfferSchema>;
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- features/offers/__tests__/schemas.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 78 prior + 6 new = **84**.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add offers types and createOfferSchema validation"
```

---

### Task 2: `features/offers/api.ts`

**Files:**
- Create: `features/offers/api.ts`

- [ ] **Step 1: Implement the data layer**

```typescript
// features/offers/api.ts
import { supabase } from '@/lib/supabase';
import type { CreateOfferInput, MyOfferWithTask, Offer, OfferWithFreelancer } from '@/features/offers/types';

const OFFER_SELECT = 'id, task_id, freelancer_id, price, message, status, created_at';

// See features/tasks/api.ts's attachClients for why this is a second query
// rather than an embed: profiles_public is a view (no FK of its own), and
// embedding the underlying profiles table directly would apply
// profiles_select_own RLS (auth.uid() = id) per row.
async function attachFreelancers(offers: Offer[]): Promise<OfferWithFreelancer[]> {
  const freelancerIds = [...new Set(offers.map((o) => o.freelancer_id))];
  if (freelancerIds.length === 0) return [];

  const { data: freelancers, error } = await supabase
    .from('profiles_public')
    .select('id, full_name, avatar_url')
    .in('id', freelancerIds);
  if (error) throw error;

  const byId = new Map((freelancers ?? []).map((f) => [f.id, f]));
  return offers.map((o) => ({
    ...o,
    freelancer: byId.get(o.freelancer_id) ?? { full_name: null, avatar_url: null },
  }));
}

// offers_select_related RLS returns every offer on this task when the caller
// is the task's owner, or only the caller's own offer(s) otherwise — this
// function doesn't need to know which case it's in, RLS already scoped it.
export async function fetchOffersForTask(taskId: string): Promise<OfferWithFreelancer[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(OFFER_SELECT)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachFreelancers((data ?? []) as Offer[]);
}

// task:tasks(...) can legitimately come back null for a given row — see
// "Before you start" in the plan (MyOfferWithTask.task nullability).
export async function fetchMyOffers(freelancerId: string): Promise<MyOfferWithTask[]> {
  const { data, error } = await supabase
    .from('offers')
    .select(`${OFFER_SELECT}, task:tasks(id, title, city, status)`)
    .eq('freelancer_id', freelancerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MyOfferWithTask[];
}

// freelancer_id has no DB default — the caller supplies it, same reasoning
// as createTask's clientId parameter.
export async function createOffer(freelancerId: string, input: CreateOfferInput): Promise<void> {
  const { error } = await supabase.from('offers').insert({
    task_id: input.task_id,
    freelancer_id: freelancerId,
    price: input.price,
    message: input.message,
  });
  if (error) throw error;
}

export async function withdrawOffer(offerId: string): Promise<void> {
  const { error } = await supabase.from('offers').update({ status: 'withdrawn' }).eq('id', offerId);
  if (error) throw error;
}

export async function acceptOffer(offerId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated unit test for this file — same precedent as `fetchOpenTasks`/`fetchTaskById`/`createTask`: correctness rests on the RLS reasoning above, verified live once Docker is fixed. Task 3 mocks this whole module to exercise the hook-level contract.)

Run: `npm test`
Expected: all pass, same total as Task 1 (**84**) — no new tests in this task.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add offers data layer (fetch, create, withdraw, accept)"
```

---

### Task 3: `features/offers/hooks.ts` (TDD)

**Files:**
- Create: `features/offers/hooks.ts`, `features/offers/__tests__/hooks.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// features/offers/__tests__/hooks.test.tsx
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOffersForTask, useMyOffers, useCreateOffer, useWithdrawOffer, useAcceptOffer } from '@/features/offers/hooks';
import type { CreateOfferInput, MyOfferWithTask, OfferWithFreelancer } from '@/features/offers/types';

jest.mock('@/features/offers/api', () => ({
  fetchOffersForTask: jest.fn(),
  fetchMyOffers: jest.fn(),
  createOffer: jest.fn(),
  withdrawOffer: jest.fn(),
  acceptOffer: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { fetchOffersForTask, fetchMyOffers, createOffer, withdrawOffer, acceptOffer } from '@/features/offers/api';
import { useAuth } from '@/features/auth/useAuth';

function renderWithClient(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

const sampleOffer: OfferWithFreelancer = {
  id: 'o1',
  task_id: 't1',
  freelancer_id: 'u2',
  price: 85000,
  message: null,
  status: 'pending',
  created_at: '2026-07-09T10:00:00.000Z',
  freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
};

const sampleMyOffer: MyOfferWithTask = {
  ...sampleOffer,
  task: { id: 't1', title: 'Arreglar fuga', city: 'Bogotá', status: 'open' },
};

const sampleInput: CreateOfferInput = { task_id: 't1', price: 85000, message: null };

function OffersForTaskProbe({ taskId }: { taskId: string }) {
  const { data, isPending } = useOffersForTask(taskId);
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} ofertas</Text>;
}

function MyOffersProbe() {
  const { data, isPending } = useMyOffers();
  if (isPending) return <Text>loading</Text>;
  return <Text>{data?.length ?? 0} mis ofertas</Text>;
}

function CreateOfferProbe() {
  const mutation = useCreateOffer();
  if (mutation.isSuccess) return <Text>created</Text>;
  return <Text onPress={() => mutation.mutate(sampleInput)}>submit</Text>;
}

function WithdrawOfferProbe() {
  const mutation = useWithdrawOffer();
  if (mutation.isSuccess) return <Text>withdrawn</Text>;
  return <Text onPress={() => mutation.mutate({ offerId: 'o1', taskId: 't1' })}>withdraw</Text>;
}

function AcceptOfferProbe() {
  const mutation = useAcceptOffer();
  if (mutation.isSuccess) return <Text>accepted</Text>;
  return <Text onPress={() => mutation.mutate({ offerId: 'o1', taskId: 't1' })}>accept</Text>;
}

describe('useOffersForTask', () => {
  it('resolves with the offers returned by fetchOffersForTask', async () => {
    (fetchOffersForTask as jest.Mock).mockResolvedValue([sampleOffer]);
    renderWithClient(<OffersForTaskProbe taskId="t1" />);
    await waitFor(() => expect(screen.getByText('1 ofertas')).toBeTruthy());
    expect(fetchOffersForTask).toHaveBeenCalledWith('t1');
  });
});

describe('useMyOffers', () => {
  it('resolves with the offers returned by fetchMyOffers for the current user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    (fetchMyOffers as jest.Mock).mockResolvedValue([sampleMyOffer]);
    renderWithClient(<MyOffersProbe />);
    await waitFor(() => expect(screen.getByText('1 mis ofertas')).toBeTruthy());
    expect(fetchMyOffers).toHaveBeenCalledWith('u2');
  });
});

describe('useCreateOffer', () => {
  it('calls createOffer with the current session user id and the input', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    (createOffer as jest.Mock).mockResolvedValue(undefined);
    const { getByText } = renderWithClient(<CreateOfferProbe />);
    getByText('submit').props.onPress();
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(createOffer).toHaveBeenCalledWith('u2', sampleInput);
  });

  it('invalidates offers-for-task and my-offers on success', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    (createOffer as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { getByText } = renderWithClient(<CreateOfferProbe />, client);
    getByText('submit').props.onPress();
    await waitFor(() => expect(screen.getByText('created')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'task', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'mine'] });
  });
});

describe('useWithdrawOffer', () => {
  it('calls withdrawOffer with the offer id', async () => {
    (withdrawOffer as jest.Mock).mockResolvedValue(undefined);
    const { getByText } = renderWithClient(<WithdrawOfferProbe />);
    getByText('withdraw').props.onPress();
    await waitFor(() => expect(screen.getByText('withdrawn')).toBeTruthy());
    expect(withdrawOffer).toHaveBeenCalledWith('o1');
  });

  it('invalidates offers-for-task and my-offers on success', async () => {
    (withdrawOffer as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { getByText } = renderWithClient(<WithdrawOfferProbe />, client);
    getByText('withdraw').props.onPress();
    await waitFor(() => expect(screen.getByText('withdrawn')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'task', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'mine'] });
  });
});

describe('useAcceptOffer', () => {
  it('calls acceptOffer with the offer id', async () => {
    (acceptOffer as jest.Mock).mockResolvedValue(undefined);
    const { getByText } = renderWithClient(<AcceptOfferProbe />);
    getByText('accept').props.onPress();
    await waitFor(() => expect(screen.getByText('accepted')).toBeTruthy());
    expect(acceptOffer).toHaveBeenCalledWith('o1');
  });

  it('invalidates offers-for-task, task detail, and task lists on success', async () => {
    (acceptOffer as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { getByText } = renderWithClient(<AcceptOfferProbe />, client);
    getByText('accept').props.onPress();
    await waitFor(() => expect(screen.getByText('accepted')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['offers', 'task', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list'] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/offers/__tests__/hooks.test.tsx`
Expected: FAIL — cannot find module `@/features/offers/hooks`.

- [ ] **Step 3: Implement the hooks**

```typescript
// features/offers/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOffersForTask, fetchMyOffers, createOffer, withdrawOffer, acceptOffer } from '@/features/offers/api';
import { useAuth } from '@/features/auth/useAuth';
import { taskKeys } from '@/features/tasks/hooks';
import type { CreateOfferInput } from '@/features/offers/types';

export const offerKeys = {
  all: ['offers'] as const,
  forTask: (taskId: string) => [...offerKeys.all, 'task', taskId] as const,
  mine: () => [...offerKeys.all, 'mine'] as const,
};

export function useOffersForTask(taskId: string) {
  return useQuery({
    queryKey: offerKeys.forTask(taskId),
    queryFn: () => fetchOffersForTask(taskId),
  });
}

export function useMyOffers() {
  const { session } = useAuth();
  return useQuery({
    queryKey: offerKeys.mine(),
    // Safe non-null assertion: only mounted inside (tabs)/* screens, which
    // never render before the session is resolved. See "Before you start".
    queryFn: () => fetchMyOffers(session!.user.id),
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (input: CreateOfferInput) => {
      if (!session) throw new Error('No hay sesión activa');
      return createOffer(session.user.id, input);
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: offerKeys.forTask(input.task_id) });
      queryClient.invalidateQueries({ queryKey: offerKeys.mine() });
    },
  });
}

export function useWithdrawOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId }: { offerId: string; taskId: string }) => withdrawOffer(offerId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: offerKeys.forTask(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: offerKeys.mine() });
    },
  });
}

export function useAcceptOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId }: { offerId: string; taskId: string }) => acceptOffer(offerId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: offerKeys.forTask(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(variables.taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/offers/__tests__/hooks.test.tsx`
Expected: PASS (8 assertions: `useOffersForTask` 1, `useMyOffers` 1, `useCreateOffer` 2, `useWithdrawOffer` 2, `useAcceptOffer` 2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 84 prior + 8 new = **92**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add offers hooks (offerKeys factory, queries, mutations)"
```

---

### Task 4: `features/tasks/types.ts` + `features/tasks/api.ts` — my published tasks and completing a task

**Files:**
- Modify: `features/tasks/types.ts`
- Modify: `features/tasks/api.ts`

- [ ] **Step 1: Add `MyPublishedTask` to types.ts**

Append at the end of `features/tasks/types.ts`:

```typescript
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
```

- [ ] **Step 2: Add `fetchMyTasks` and `completeTask` to api.ts**

Update the top import line of `features/tasks/api.ts` to:

```typescript
import type { CategoryRow, CreateTaskInput, MyPublishedTask, Task, TaskWithRelations } from '@/features/tasks/types';
```

Append at the end of the file:

```typescript
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated unit test for `fetchMyTasks`/`completeTask` — same precedent as the rest of `api.ts`. Task 5's mocked hook tests exercise the hook-level contract.)

Run: `npm test`
Expected: all pass, same total as Task 3 (**92**) — no new tests in this task.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add fetchMyTasks and completeTask to the tasks data layer"
```

---

### Task 5: `features/tasks/hooks.ts` — `useMyTasks`, `useCompleteTask` (TDD)

**Files:**
- Modify: `features/tasks/hooks.ts`
- Modify: `features/tasks/__tests__/hooks.test.tsx`

- [ ] **Step 1: Write the failing tests (replaces the whole test file)**

```tsx
// features/tasks/__tests__/hooks.test.tsx
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useOpenTasks, useTask, useCategories, useCreateTask, useMyTasks, useCompleteTask } from '@/features/tasks/hooks';
import type { CreateTaskInput, MyPublishedTask, TaskWithRelations } from '@/features/tasks/types';

jest.mock('@/features/tasks/api', () => ({
  fetchOpenTasks: jest.fn(),
  fetchTaskById: jest.fn(),
  fetchCategories: jest.fn(),
  createTask: jest.fn(),
  fetchMyTasks: jest.fn(),
  completeTask: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask, fetchMyTasks, completeTask } from '@/features/tasks/api';
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

describe('useMyTasks', () => {
  it('resolves with the tasks returned by fetchMyTasks for the current user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } });
    (fetchMyTasks as jest.Mock).mockResolvedValue([sampleMyTask]);
    renderWithClient(<MyTasksProbe />);
    await waitFor(() => expect(screen.getByText('1 mis tareas')).toBeTruthy());
    expect(fetchMyTasks).toHaveBeenCalledWith('u1');
  });
});

describe('useCompleteTask', () => {
  it('calls completeTask with the task id', async () => {
    (completeTask as jest.Mock).mockResolvedValue(undefined);
    const { getByText } = renderWithClient(<CompleteTaskProbe />);
    getByText('complete').props.onPress();
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(completeTask).toHaveBeenCalledWith('t1');
  });

  it('invalidates the task detail and my-tasks list queries on success', async () => {
    (completeTask as jest.Mock).mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const { getByText } = renderWithClient(<CompleteTaskProbe />, client);
    getByText('complete').props.onPress();
    await waitFor(() => expect(screen.getByText('completed')).toBeTruthy());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'detail', 't1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tasks', 'list', 'mine'] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: FAIL — `useMyTasks`/`useCompleteTask` are not exported from `@/features/tasks/hooks`.

- [ ] **Step 3: Implement the updated hooks.ts**

Update the top import line of `features/tasks/hooks.ts` to:

```typescript
import { fetchOpenTasks, fetchTaskById, fetchCategories, createTask, fetchMyTasks, completeTask } from '@/features/tasks/api';
```

Append at the end of the file:

```typescript
export function useMyTasks() {
  const { session } = useAuth();
  return useQuery({
    queryKey: taskKeys.list('mine'),
    // Safe non-null assertion: only mounted inside (tabs)/* screens, which
    // never render before the session is resolved. See "Before you start".
    queryFn: () => fetchMyTasks(session!.user.id),
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => completeTask(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskKeys.list('mine') });
    },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/tasks/__tests__/hooks.test.tsx`
Expected: PASS (8 assertions: `useOpenTasks` 1, `useTask` 1, `useCategories` 1, `useCreateTask` 2, `useMyTasks` 1, `useCompleteTask` 2 — the file went from 5 to 8, a net +3).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 92 prior + 3 net-new = **95**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add useMyTasks and useCompleteTask hooks"
```

---

### Task 6: `components/offers/OfferForm.tsx` (TDD)

**Files:**
- Create: `components/offers/OfferForm.tsx`, `components/offers/__tests__/OfferForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/offers/__tests__/OfferForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OfferForm } from '@/components/offers/OfferForm';

describe('OfferForm', () => {
  it('blocks submit and shows an error when price is empty', async () => {
    const onSubmit = jest.fn();
    await render(<OfferForm taskId="t1" onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText('Enviar oferta'));
    await waitFor(() =>
      expect(screen.getByText('El precio debe ser un número entero mayor a cero')).toBeTruthy(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the converted payload with a valid price and no message', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OfferForm taskId="t1" onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('price-input'), '85000');
    await fireEvent.press(screen.getByText('Enviar oferta'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ task_id: 't1', price: 85000, message: null }),
    );
  });

  it('submits the message when provided', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<OfferForm taskId="t1" onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('price-input'), '85000');
    fireEvent.changeText(screen.getByTestId('message-input'), 'Puedo empezar mañana');
    await fireEvent.press(screen.getByText('Enviar oferta'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ task_id: 't1', price: 85000, message: 'Puedo empezar mañana' }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/offers/__tests__/OfferForm.test.tsx`
Expected: FAIL — cannot find module `@/components/offers/OfferForm`.

- [ ] **Step 3: Implement the form**

```tsx
// components/offers/OfferForm.tsx
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createOfferSchema, type CreateOfferFormValues } from '@/features/offers/schemas';
import { mapAuthError } from '@/features/auth/errors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { CreateOfferInput } from '@/features/offers/types';

interface OfferFormProps {
  taskId: string;
  onSubmit: (input: CreateOfferInput) => Promise<void>;
}

export function OfferForm({ taskId, onSubmit }: OfferFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<CreateOfferFormValues>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: { price: '', message: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit({
        task_id: taskId,
        price: Number(values.price),
        message: values.message.trim() === '' ? null : values.message,
      });
    } catch (e) {
      setSubmitError(e instanceof Error ? mapAuthError(e.message) : 'Error al enviar la oferta');
    }
  });

  return (
    <ScrollView>
      <Controller
        control={control}
        name="price"
        render={({ field, fieldState }) => (
          <Input
            label="Precio ($COP)"
            testID="price-input"
            keyboardType="numeric"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="message"
        render={({ field, fieldState }) => (
          <Input
            label="Mensaje (opcional)"
            testID="message-input"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
            multiline
          />
        )}
      />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Enviar oferta" onPress={submit} loading={formState.isSubmitting} />
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/offers/__tests__/OfferForm.test.tsx`
Expected: PASS (3 test cases).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 95 prior + 3 new = **98**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add OfferForm (price + message)"
```

---

### Task 7: `components/offers/OfferListItem.tsx` (TDD)

**Files:**
- Create: `components/offers/OfferListItem.tsx`, `components/offers/__tests__/OfferListItem.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/offers/__tests__/OfferListItem.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OfferListItem } from '@/components/offers/OfferListItem';
import type { OfferWithFreelancer } from '@/features/offers/types';

const offer: OfferWithFreelancer = {
  id: 'o1',
  task_id: 't1',
  freelancer_id: 'u2',
  price: 85000,
  message: 'Puedo empezar mañana',
  status: 'pending',
  created_at: new Date().toISOString(),
  freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
};

describe('OfferListItem', () => {
  it('renders the freelancer name, price, and message', async () => {
    await render(<OfferListItem offer={offer} onAccept={jest.fn()} />);
    expect(screen.getByText('Carlos Ruiz · $85.000')).toBeTruthy();
    expect(screen.getByText('Puedo empezar mañana')).toBeTruthy();
  });

  it('falls back to Anónimo when the freelancer has no name', async () => {
    const anon = { ...offer, freelancer: { full_name: null, avatar_url: null } };
    await render(<OfferListItem offer={anon} onAccept={jest.fn()} />);
    expect(screen.getByText('Anónimo · $85.000')).toBeTruthy();
  });

  it('calls onAccept when the Aceptar button is pressed', async () => {
    const onAccept = jest.fn();
    await render(<OfferListItem offer={offer} onAccept={onAccept} />);
    await fireEvent.press(screen.getByText('Aceptar'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('disables the Aceptar button when disabled is true', async () => {
    await render(<OfferListItem offer={offer} onAccept={jest.fn()} disabled />);
    expect(screen.getByTestId('accept-offer-button').props.accessibilityState?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/offers/__tests__/OfferListItem.test.tsx`
Expected: FAIL — cannot find module `@/components/offers/OfferListItem`.

- [ ] **Step 3: Implement the component**

```tsx
// components/offers/OfferListItem.tsx
import { Pressable, Text, View } from 'react-native';
import { formatBudget } from '@/features/tasks/format';
import type { OfferWithFreelancer } from '@/features/offers/types';

interface OfferListItemProps {
  offer: OfferWithFreelancer;
  onAccept: () => void;
  disabled?: boolean;
}

export function OfferListItem({ offer, onAccept, disabled }: OfferListItemProps) {
  return (
    <View
      testID="offer-list-item"
      className="bg-slate-50 rounded-2xl p-3 mb-2 flex-row justify-between items-center"
    >
      <View className="flex-1 pr-2">
        <Text className="text-slate-900 font-bold text-sm">
          {offer.freelancer.full_name ?? 'Anónimo'} · {formatBudget(offer.price)}
        </Text>
        {offer.message ? <Text className="text-slate-500 text-xs mt-1">{offer.message}</Text> : null}
      </View>
      <Pressable
        testID="accept-offer-button"
        accessibilityRole="button"
        onPress={onAccept}
        disabled={disabled}
        className={disabled ? 'bg-slate-300 px-3 py-2 rounded-xl' : 'bg-brand px-3 py-2 rounded-xl'}
      >
        <Text className="text-white font-bold text-xs">Aceptar</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/offers/__tests__/OfferListItem.test.tsx`
Expected: PASS (4 test cases).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 98 prior + 4 new = **102**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add OfferListItem (owner's view of a received offer)"
```

---

### Task 8: `components/offers/MyOfferRow.tsx` (TDD)

**Files:**
- Create: `components/offers/MyOfferRow.tsx`, `components/offers/__tests__/MyOfferRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// components/offers/__tests__/MyOfferRow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { MyOfferRow } from '@/components/offers/MyOfferRow';
import type { MyOfferWithTask } from '@/features/offers/types';

const baseOffer: Omit<MyOfferWithTask, 'status' | 'task'> = {
  id: 'o1',
  task_id: 't1',
  freelancer_id: 'u2',
  price: 85000,
  message: null,
  created_at: new Date().toISOString(),
};

describe('MyOfferRow', () => {
  it('shows the task title, price, and Pendiente status with a Retirar oferta button', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'open' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('Pintar sala')).toBeTruthy();
    expect(screen.getByText('$85.000 · Pendiente')).toBeTruthy();
    expect(screen.getByText('Retirar oferta')).toBeTruthy();
  });

  it('hides the Retirar oferta button once the offer is accepted', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'accepted',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'assigned' },
    };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('$85.000 · Aceptada')).toBeTruthy();
    expect(screen.queryByText('Retirar oferta')).toBeNull();
  });

  it('falls back to a placeholder when the task is no longer visible', async () => {
    const offer: MyOfferWithTask = { ...baseOffer, status: 'rejected', task: null };
    await render(<MyOfferRow offer={offer} onWithdraw={jest.fn()} />);
    expect(screen.getByText('Tarea ya no disponible')).toBeTruthy();
  });

  it('calls onWithdraw when the Retirar oferta button is pressed', async () => {
    const offer: MyOfferWithTask = {
      ...baseOffer,
      status: 'pending',
      task: { id: 't1', title: 'Pintar sala', city: 'Bogotá', status: 'open' },
    };
    const onWithdraw = jest.fn();
    await render(<MyOfferRow offer={offer} onWithdraw={onWithdraw} />);
    await fireEvent.press(screen.getByText('Retirar oferta'));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/offers/__tests__/MyOfferRow.test.tsx`
Expected: FAIL — cannot find module `@/components/offers/MyOfferRow`.

- [ ] **Step 3: Implement the component**

```tsx
// components/offers/MyOfferRow.tsx
import { Pressable, Text, View } from 'react-native';
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
}

export function MyOfferRow({ offer, onWithdraw }: MyOfferRowProps) {
  return (
    <View testID="my-offer-row" className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <Text className="text-slate-900 font-bold text-sm">{offer.task?.title ?? 'Tarea ya no disponible'}</Text>
      <Text className="text-slate-500 text-xs mt-1">
        {formatBudget(offer.price)} · {STATUS_LABEL[offer.status]}
      </Text>
      {offer.status === 'pending' ? (
        <Pressable
          testID="withdraw-offer-button"
          accessibilityRole="button"
          onPress={onWithdraw}
          className="mt-3 bg-red-500 px-3 py-2 rounded-xl self-start"
        >
          <Text className="text-white font-bold text-xs">Retirar oferta</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/offers/__tests__/MyOfferRow.test.tsx`
Expected: PASS (4 test cases).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 102 prior + 4 new = **106**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add MyOfferRow (freelancer's view of their own offer)"
```

---

### Task 9: `components/tasks/PublishedTaskRow.tsx` (TDD)

**Files:**
- Create: `components/tasks/PublishedTaskRow.tsx`, `components/tasks/__tests__/PublishedTaskRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

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

describe('PublishedTaskRow', () => {
  it('shows the offer count for an open task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 3,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Arreglar fuga')).toBeTruthy();
    expect(screen.getByText('Abierta · 3 ofertas recibidas')).toBeTruthy();
  });

  it('uses singular wording for exactly one offer', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 1,
      assigned_freelancer: null,
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Abierta · 1 oferta recibida')).toBeTruthy();
  });

  it('shows the assigned freelancer for an assigned task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'assigned',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Asignada a Carlos Ruiz')).toBeTruthy();
  });

  it('shows the freelancer name for a completed task', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'completed',
      assigned_freelancer_id: 'u2',
      offer_count: 0,
      assigned_freelancer: { full_name: 'Carlos Ruiz' },
    };
    await render(<PublishedTaskRow task={task} onPress={jest.fn()} />);
    expect(screen.getByText('Completada · Carlos Ruiz')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const task: MyPublishedTask = {
      ...baseTask,
      status: 'open',
      assigned_freelancer_id: null,
      offer_count: 0,
      assigned_freelancer: null,
    };
    const onPress = jest.fn();
    await render(<PublishedTaskRow task={task} onPress={onPress} />);
    await fireEvent.press(screen.getByText('Arreglar fuga'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/tasks/__tests__/PublishedTaskRow.test.tsx`
Expected: FAIL — cannot find module `@/components/tasks/PublishedTaskRow`.

- [ ] **Step 3: Implement the component**

```tsx
// components/tasks/PublishedTaskRow.tsx
import { Pressable, Text, View } from 'react-native';
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
}

export function PublishedTaskRow({ task, onPress }: PublishedTaskRowProps) {
  return (
    <Pressable
      testID="published-task-row"
      onPress={onPress}
      className="bg-white border border-slate-200 rounded-2xl p-4 mb-3"
    >
      <Text className="text-slate-900 font-bold text-sm">{task.title}</Text>
      <Text className="text-slate-500 text-xs mt-1">{statusLine(task)}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/tasks/__tests__/PublishedTaskRow.test.tsx`
Expected: PASS (5 test cases).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 106 prior + 5 new = **111**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PublishedTaskRow (client's view of a published task)"
```

---

### Task 10: `components/tasks/TaskActionZone.tsx` (TDD) — the 10-case state machine

**Files:**
- Create: `components/tasks/TaskActionZone.tsx`, `components/tasks/__tests__/TaskActionZone.test.tsx`

- [ ] **Step 1: Write the failing tests**

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

const noop = { onAccept: jest.fn(), onWithdraw: jest.fn(), onComplete: jest.fn(), onOffer: jest.fn() };
const flags = { accepting: false, withdrawing: false, completing: false };

describe('TaskActionZone', () => {
  it('Case A: owner, open, no offers', async () => {
    await render(<TaskActionZone task={baseTask} offers={[]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Aún no has recibido ofertas para esta tarea.')).toBeTruthy();
  });

  it('Case B: owner, open, with offers - lists them with an Aceptar button', async () => {
    await render(<TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Carlos Ruiz · $85.000')).toBeTruthy();
    expect(screen.getByText('Aceptar')).toBeTruthy();
  });

  it('Case B: pressing Aceptar calls onAccept with the offer id, freelancer name, and price', async () => {
    const onAccept = jest.fn();
    await render(
      <TaskActionZone task={baseTask} offers={[offer({})]} myId="owner-1" {...flags} {...noop} onAccept={onAccept} />,
    );
    await fireEvent.press(screen.getByText('Aceptar'));
    expect(onAccept).toHaveBeenCalledWith('o1', 'Carlos Ruiz', 85000);
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

  it('Case J: owner, cancelled - shows a cancelled message', async () => {
    const task = { ...baseTask, status: 'cancelled' as const };
    await render(<TaskActionZone task={task} offers={[]} myId="owner-1" {...flags} {...noop} />);
    expect(screen.getByText('Tarea cancelada.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/tasks/__tests__/TaskActionZone.test.tsx`
Expected: FAIL — cannot find module `@/components/tasks/TaskActionZone`.

- [ ] **Step 3: Implement the component**

```tsx
// components/tasks/TaskActionZone.tsx
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
  onAccept: (offerId: string, freelancerName: string, price: number) => void;
  onWithdraw: (offerId: string) => void;
  onComplete: () => void;
  onOffer: () => void;
}

export function TaskActionZone({
  task,
  offers,
  myId,
  accepting,
  withdrawing,
  completing,
  onAccept,
  onWithdraw,
  onComplete,
  onOffer,
}: TaskActionZoneProps) {
  const isOwner = task.client_id === myId;
  const isAssignedFreelancer = task.assigned_freelancer_id !== null && task.assigned_freelancer_id === myId;

  if (isOwner) {
    if (task.status === 'open') {
      if (offers.length === 0) {
        return (
          <Text className="text-slate-500 text-sm text-center">
            Aún no has recibido ofertas para esta tarea.
          </Text>
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
        </View>
      );
    }
    if (task.status === 'assigned') {
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
    if (task.status === 'completed') {
      const winner = offers.find((o) => o.status === 'accepted');
      return (
        <Text className="text-slate-500 text-sm text-center">
          Tarea completada{winner?.freelancer.full_name ? ` · ${winner.freelancer.full_name}` : ''}
        </Text>
      );
    }
    return <Text className="text-slate-400 text-sm text-center">Tarea cancelada.</Text>;
  }

  if (isAssignedFreelancer) {
    if (task.status === 'assigned') {
      return (
        <Text className="text-slate-500 text-sm text-center">
          Te asignaron esta tarea. Contacta al cliente para coordinar.
        </Text>
      );
    }
    return <Text className="text-slate-500 text-sm text-center">Trabajo completado.</Text>;
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
  return <Text className="text-slate-400 text-sm text-center">Ya no puedes ofertar en esta tarea.</Text>;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- components/tasks/__tests__/TaskActionZone.test.tsx`
Expected: PASS (17 test cases covering all 10 states A-J plus interaction checks for B, C, G, H).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 111 prior + 17 new = **128**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add TaskActionZone (10-case state routing for task detail)"
```

---

### Task 11: Wire `app/task/[id].tsx` to the real offers/accept/withdraw/complete flow

**Files:**
- Modify: `app/task/[id].tsx`
- Modify: `app/task/__tests__/task-detail.test.tsx`

- [ ] **Step 1: Write the failing/updated tests (replaces the whole test file)**

The current test file mocks only `useTask` and asserts a static `'Ofertar (próximamente)'` button — that text no longer exists once the bottom section is dynamic. Replace the whole file:

```tsx
// app/task/__tests__/task-detail.test.tsx
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import TaskDetailScreen from '@/app/task/[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ push: jest.fn() }),
  Stack: { Screen: () => null },
}));

jest.mock('@/features/tasks/hooks', () => ({
  useTask: jest.fn(),
  useCompleteTask: jest.fn(),
}));

jest.mock('@/features/offers/hooks', () => ({
  useOffersForTask: jest.fn(),
  useAcceptOffer: jest.fn(),
  useWithdrawOffer: jest.fn(),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

import { useTask, useCompleteTask } from '@/features/tasks/hooks';
import { useOffersForTask, useAcceptOffer, useWithdrawOffer } from '@/features/offers/hooks';
import { useAuth } from '@/features/auth/useAuth';

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

function mockActionDefaults() {
  (useCompleteTask as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useAcceptOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
}

describe('TaskDetailScreen', () => {
  beforeEach(() => {
    mockActionDefaults();
  });

  it('renders the task fields and an Ofertar button for a freelancer browsing an open task', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [] });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.getByText('Arreglar fuga en la cocina')).toBeTruthy();
    expect(screen.getByText('Plomería')).toBeTruthy();
    expect(screen.getByText('$80.000')).toBeTruthy();
    expect(screen.getByText('Hay una fuga debajo del lavaplatos.')).toBeTruthy();
    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Ofertar')).toBeTruthy();
  });

  it('shows a loading state while pending, not the task content', async () => {
    (useTask as jest.Mock).mockReturnValue({ data: undefined, isPending: true, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: undefined });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.queryByText('Arreglar fuga en la cocina')).toBeNull();
  });

  it('shows a retry button on error, and pressing it calls refetch', async () => {
    const refetch = jest.fn();
    (useTask as jest.Mock).mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: undefined });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u2' } } });
    await render(<TaskDetailScreen />);
    expect(screen.getByText('No pudimos cargar esta tarea.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Reintentar'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before accepting an offer, and calls acceptOffer when confirmed', async () => {
    const receivedOffer = {
      id: 'o1',
      task_id: 't1',
      freelancer_id: 'u2',
      price: 85000,
      message: 'Puedo empezar mañana',
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      freelancer: { full_name: 'Carlos Ruiz', avatar_url: null },
    };
    (useTask as jest.Mock).mockReturnValue({ data: task, isPending: false, isError: false });
    (useOffersForTask as jest.Mock).mockReturnValue({ data: [receivedOffer] });
    (useAuth as jest.Mock).mockReturnValue({ session: { user: { id: 'u1' } } }); // owner
    const acceptOffer = jest.fn().mockResolvedValue(undefined);
    (useAcceptOffer as jest.Mock).mockReturnValue({ mutateAsync: acceptOffer, isPending: false });

    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((b) => b.text === 'Aceptar');
      confirmButton?.onPress?.();
    });

    await render(<TaskDetailScreen />);
    await fireEvent.press(screen.getByText('Aceptar'));

    expect(alertSpy).toHaveBeenCalled();
    await waitFor(() => expect(acceptOffer).toHaveBeenCalledWith({ offerId: 'o1', taskId: 't1' }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- app/task/__tests__/task-detail.test.tsx`
Expected: FAIL — the current screen still renders the static `'Ofertar (próximamente)'` text/no dynamic wiring exists yet, so the new assertions don't match.

- [ ] **Step 3: Implement the updated screen**

Replace the entire content of `app/task/[id].tsx`:

```tsx
// app/task/[id].tsx
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTask, useCompleteTask } from '@/features/tasks/hooks';
import { useOffersForTask, useAcceptOffer, useWithdrawOffer } from '@/features/offers/hooks';
import { useAuth } from '@/features/auth/useAuth';
import { formatBudget, formatRelativeTime } from '@/features/tasks/format';
import { mapAuthError } from '@/features/auth/errors';
import { TaskActionZone } from '@/components/tasks/TaskActionZone';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { data: task, isPending, isError, refetch } = useTask(id);
  const { data: offers } = useOffersForTask(id);
  const { mutateAsync: acceptOffer, isPending: accepting } = useAcceptOffer();
  const { mutateAsync: withdrawOffer, isPending: withdrawing } = useWithdrawOffer();
  const { mutateAsync: completeTask, isPending: completing } = useCompleteTask();
  const [actionError, setActionError] = useState<string | null>(null);

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
              onAccept={handleAccept}
              onWithdraw={handleWithdraw}
              onComplete={handleComplete}
              onOffer={() => router.push({ pathname: '/offer/create', params: { taskId: task.id } })}
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
Expected: PASS (4 test cases — the file went from 3 to 4, a net +1).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 128 prior + 1 net-new = **129**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire task detail screen to offers, accept, withdraw, and complete"
```

---

### Task 12: Wire `app/offer/create.tsx`

**Files:**
- Create: `app/offer/create.tsx`

- [ ] **Step 1: Implement the screen**

```tsx
// app/offer/create.tsx
import { View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { OfferForm } from '@/components/offers/OfferForm';
import { useCreateOffer } from '@/features/offers/hooks';
import type { CreateOfferInput } from '@/features/offers/types';

export default function CreateOfferScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const router = useRouter();
  const { mutateAsync } = useCreateOffer();

  const onSubmit = async (input: CreateOfferInput) => {
    await mutateAsync(input);
    router.back();
  };

  return (
    <View className="flex-1 bg-white px-5 pt-4">
      <Stack.Screen options={{ headerShown: true, title: 'Ofertar' }} />
      <Text className="text-xl font-extrabold text-slate-900 mb-4">Enviar oferta</Text>
      <OfferForm taskId={taskId} onSubmit={onSubmit} />
    </View>
  );
}
```

`router.back()` (not `push`/`replace`) is correct here: this screen is always reached by navigating forward from `task/[id].tsx` (via `TaskActionZone`'s "Ofertar" button), so going back returns to that same task's detail screen, which refetches its offers (`useOffersForTask`) and now shows the freelancer's new pending offer without any extra invalidation wiring needed beyond what `useCreateOffer` already does.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (No dedicated test — same precedent as `app/(tabs)/post-task.tsx`: thin glue over already-tested `OfferForm`/`useCreateOffer`.)

Run: `npm test`
Expected: all pass, same total as Task 11 (**129**) — no new tests in this task.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add the offer creation screen"
```

---

### Task 13: Wire `app/(tabs)/my-tasks.tsx` (TDD)

**Files:**
- Modify: `app/(tabs)/my-tasks.tsx`
- Create: `app/(tabs)/__tests__/my-tasks.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// app/(tabs)/__tests__/my-tasks.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import MyTasks from '@/app/(tabs)/my-tasks';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/features/tasks/hooks', () => ({
  useMyTasks: jest.fn(),
}));

jest.mock('@/features/offers/hooks', () => ({
  useMyOffers: jest.fn(),
  useWithdrawOffer: jest.fn(),
}));

import { useMyTasks } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';

const publishedTask = {
  id: 't1',
  client_id: 'u1',
  category_id: 1,
  title: 'Arreglar fuga',
  description: 'desc',
  budget_reference: 80000,
  city: 'Bogotá',
  address_approx: null,
  status: 'open' as const,
  assigned_freelancer_id: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  offer_count: 2,
  assigned_freelancer: null,
};

const myOffer = {
  id: 'o1',
  task_id: 't2',
  freelancer_id: 'u1',
  price: 90000,
  message: null,
  status: 'pending' as const,
  created_at: new Date().toISOString(),
  task: { id: 't2', title: 'Pintar sala', city: 'Bogotá', status: 'open' as const },
};

function mockDefaults() {
  (useMyTasks as jest.Mock).mockReturnValue({ data: [publishedTask], isPending: false, isError: false, refetch: jest.fn() });
  (useMyOffers as jest.Mock).mockReturnValue({ data: [myOffer], isPending: false, isError: false, refetch: jest.fn() });
  (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
}

describe('MyTasks', () => {
  beforeEach(() => {
    mockDefaults();
  });

  it('shows the Publicadas list by default', async () => {
    await render(<MyTasks />);
    expect(screen.getByText('Arreglar fuga')).toBeTruthy();
    expect(screen.queryByText('Pintar sala')).toBeNull();
  });

  it('switches to the Trabajos list when that sub-tab is pressed', async () => {
    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Trabajos'));
    await waitFor(() => expect(screen.getByText('Pintar sala')).toBeTruthy());
    expect(screen.queryByText('Arreglar fuga')).toBeNull();
  });

  it('shows the empty state for Publicadas when there are no tasks', async () => {
    (useMyTasks as jest.Mock).mockReturnValue({ data: [], isPending: false, isError: false, refetch: jest.fn() });
    await render(<MyTasks />);
    expect(screen.getByText('Aún no has publicado ninguna tarea.')).toBeTruthy();
  });

  it('calls withdraw when Retirar oferta is pressed in Trabajos', async () => {
    const withdraw = jest.fn();
    (useWithdrawOffer as jest.Mock).mockReturnValue({ mutateAsync: withdraw });
    await render(<MyTasks />);
    await fireEvent.press(screen.getByText('Trabajos'));
    await waitFor(() => expect(screen.getByText('Retirar oferta')).toBeTruthy());
    await fireEvent.press(screen.getByText('Retirar oferta'));
    expect(withdraw).toHaveBeenCalledWith({ offerId: 'o1', taskId: 't2' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- "app/(tabs)/__tests__/my-tasks.test.tsx"`
Expected: FAIL — the current placeholder screen doesn't render sub-tabs or lists.

- [ ] **Step 3: Implement the screen**

Replace the entire content of `app/(tabs)/my-tasks.tsx`:

```tsx
// app/(tabs)/my-tasks.tsx
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PublishedTaskRow } from '@/components/tasks/PublishedTaskRow';
import { MyOfferRow } from '@/components/offers/MyOfferRow';
import { useMyTasks } from '@/features/tasks/hooks';
import { useMyOffers, useWithdrawOffer } from '@/features/offers/hooks';
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
          onPress={() => setSubTab('published')}
          className={`flex-1 items-center py-3 border-b-2 ${subTab === 'published' ? 'border-brand' : 'border-transparent'}`}
        >
          <Text className={subTab === 'published' ? 'text-brand font-bold' : 'text-slate-500'}>Publicadas</Text>
        </Pressable>
        <Pressable
          testID="sub-tab-jobs"
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
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      data={data}
      keyExtractor={(item: MyPublishedTask) => item.id}
      renderItem={({ item }) => (
        <PublishedTaskRow task={item} onPress={() => router.push(`/task/${item.id}`)} />
      )}
      ListEmptyComponent={
        <View className="items-center justify-center py-20">
          <Text className="text-slate-500">Aún no has publicado ninguna tarea.</Text>
        </View>
      }
    />
  );
}

function JobsList() {
  const { data, isPending, isError, refetch } = useMyOffers();
  const { mutateAsync: withdraw } = useWithdrawOffer();

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
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      data={data}
      keyExtractor={(item: MyOfferWithTask) => item.id}
      renderItem={({ item }) => (
        <MyOfferRow offer={item} onWithdraw={() => withdraw({ offerId: item.id, taskId: item.task_id })} />
      )}
      ListEmptyComponent={
        <View className="items-center justify-center py-20">
          <Text className="text-slate-500">Aún no has hecho ninguna oferta.</Text>
        </View>
      }
    />
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- "app/(tabs)/__tests__/my-tasks.test.tsx"`
Expected: PASS (4 test cases).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 129 prior + 4 new = **133**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire my-tasks screen with Publicadas/Trabajos sub-tabs"
```

---

### Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass. Approximate total: **133** (78 pre-existing + 6 Task 1 + 8 Task 3 + 3 Task 5 + 3 Task 6 + 4 Task 7 + 4 Task 8 + 5 Task 9 + 17 Task 10 + 1 Task 11 + 4 Task 13). Zero failures. **Trust the live count over this arithmetic** — if it differs, read the actual suite/test breakdown before assuming something is wrong.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the bundler builds**

Run: `npx expo export --platform ios` (self-terminating; produces a real bundle rather than just waiting for the CLI banner).
Expected: bundles with no red errors. Delete the resulting `dist/` afterward (`rm -rf dist`) — it's gitignored but keep the tree clean.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for offers/mytasks sub-project" --allow-empty
```

---

## Notes for the executor

- **No live backend:** every test mocks `@/features/offers/api`, `@/features/offers/hooks`, `@/features/tasks/api`, `@/features/tasks/hooks`, or `@/features/auth/useAuth` — nothing hits a real Supabase instance. When Docker/`npx supabase start` is available again, manually verify end-to-end: a freelancer can offer on someone else's open task but not their own (`offer_insert_is_valid`'s `freelancer_id <> client_id` check), a client can accept exactly one offer and the rest flip to `rejected` (already covered by the backend's own pgTAP suite for `accept_offer`, including its concurrency test), and a client can mark an `assigned` task `completed` but not skip straight from `open`.
- **Deferred, per the design spec:** cancelling an open task, editing a sent offer, push/realtime updates, real reputation data.
- **`mapAuthError`** is reused across all four new mutation error paths (`createOffer`, `withdrawOffer`, `acceptOffer`, `completeTask`) as the codebase's general-purpose Supabase-error-to-Spanish fallback — consistent with its existing reuse in `PostTaskForm`/`ProfileForm`.
