# Migrar a `supabase gen types` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Type the Supabase client fully against the real Postgres schema (`createClient<Database>`), so `tsc` catches query mistakes at the 5 files that call it directly, and derive the 4 raw-row types (`Profile`, `Task`, `CategoryRow`, `Offer`) from the generated schema instead of hand-maintaining them.

**Architecture:** `lib/database.types.ts` (generated, not hand-edited) feeds `createClient<Database>` in `lib/supabase.ts`. This is an atomic, all-or-nothing change — `tsc` will surface every mismatch across all 5 call-site files the moment it lands, not incrementally. Raw-row types become aliases of `Database['public']['Tables'][...]['Row']`; composed/derived types (`TaskWithRelations`, `CreateTaskInput`, etc.) stay hand-written, just extending the new aliases.

**Tech Stack:** `@supabase/supabase-js` v2, `supabase` CLI (`npx supabase gen types typescript --local`).

**Spec:** `docs/superpowers/specs/2026-07-16-supabase-gen-types-design.md`

---

## Before you start — read this, it changes how this plan is written

This sub-project doesn't follow the TDD write-failing-test-first shape every other sub-project this session used. There's no new runtime behavior — this is a types-only change — so there's no failing test to write. The closest equivalent is `tsc --noEmit`, already this project's standing check. **Tasks 2-5 cannot give you exact "before" code for every fix**, because the exact `tsc` errors depend on what `supabase gen types` actually outputs from the live schema, and that requires Docker (down as this plan is written). Instead, each of those tasks gives you: (a) the mechanical change that's certain, (b) specific, high-confidence hypotheses about what will break and why (derived from reading the actual migration SQL, not guessed), and (c) a checklist to work through systematically. Report the ACTUAL errors you see and how you fixed them — don't assume the hypotheses are exhaustive or even all correct.

**Two concrete, high-confidence predictions, from reading the migrations directly (not from running the generator):**

1. **`tasks.status` and `offers.status` are `text not null ... check (status in (...))`** (`supabase/migrations/20260702000003_create_tasks.sql:11`, `20260702000004_create_offers.sql:8`) — **not** native Postgres enums. `supabase gen types` reflects the raw column type; CHECK constraints listing allowed values are not turned into TypeScript literal unions. Expect the generated `Database['public']['Tables']['tasks']['Row']['status']` (and `offers`) to be plain `string`, not `TaskStatus`/`OfferStatus`. **Approved resolution** (already decided, not an open question): when deriving `Task`/`Offer` in Task 5, override just that field back to the literal union: `Omit<Database['public']['Tables']['tasks']['Row'], 'status'> & { status: TaskStatus }` (same pattern for `Offer`/`OfferStatus`). This preserves the exhaustive-switch-without-`default` compile-time guarantee documented in `CLAUDE.md` — the DB already enforces the invariant via CHECK + the `enforce_task_status_transitions` trigger, so telling TypeScript about it is a legitimate narrowing, not a false claim.
2. **`tasks.budget_reference` and `offers.price` are `numeric(12,2)`** (`20260702000003_create_tasks.sql:8`, `20260702000004_create_offers.sql:6`). Many `supabase gen types` versions map Postgres `numeric`/`decimal` to TypeScript `string` (to avoid silent precision loss), not `number`. The current hand-written types use `number` for both. **If this happens** (verify — don't assume, this varies by CLI version): cast back to `number` at the read boundary in `features/tasks/api.ts`/`features/offers/api.ts` (e.g. `Number(row.budget_reference)`), keeping `Task.budget_reference`/`Offer.price` as `number` in the app-facing types — matches the existing convention (`format.ts`'s `formatBudget`, any arithmetic/comparisons) and avoids threading string-money through the whole app. **If it's already `number`**, no action needed, don't add a cast that isn't required.

**Verify test/tsc baseline live before starting** — expect roughly 186 tests / 30 suites, `tsc --noEmit` clean, but confirm, don't trust this number.

---

### Task 1: Generate `Database` type + npm script

**Files:**
- Create: `lib/database.types.ts` (generated, not hand-edited)
- Modify: `package.json`

This task is fully deterministic — no exploration needed.

- [ ] **Step 1: Confirm Docker/local Supabase is up**

Run: `docker ps` — expect to see the `supabase_db_backend-supabase-schema` container (and siblings) listed as `Up ... (healthy)`. If Docker is down, STOP and report BLOCKED — do not proceed with the rest of this plan, there is no meaningful way to do this task without it.

- [ ] **Step 2: Generate the types file**

Run: `npx supabase gen types typescript --local > lib/database.types.ts`

Expected: a large generated TypeScript file (a `Database` interface covering `public.Tables`, `public.Views`, `public.Functions`, etc.). Confirm it's not an error JSON blob (a prior attempt in this session got `{"_tag":"Error",...}` written to the file when Docker was down — if you see that, Docker isn't actually healthy, stop and report it).

- [ ] **Step 3: Add the regeneration script**

In `package.json`, add to `"scripts"` (alongside the existing `"typecheck": "tsc --noEmit"` line):

```json
    "gen:types": "supabase gen types typescript --local > lib/database.types.ts",
```

(Uses the project's existing convention of invoking the CLI via `npx` implicitly — `npm run` scripts already resolve `supabase` through `npx`-equivalent PATH resolution when it's not a local devDependency; if this doesn't resolve for you, use `"gen:types": "npx supabase gen types typescript --local > lib/database.types.ts"` instead and note that in your report.)

- [ ] **Step 4: Commit**

```bash
git add lib/database.types.ts package.json
git commit -m "feat: generate Database types from local Supabase schema"
```

No `tsc`/test impact expected yet — this file isn't imported anywhere. Confirm anyway: `npx tsc --noEmit` clean, `npm test` unchanged from baseline.

---

### Task 2: Wire `createClient<Database>` + fix the `auth` module

**Files:**
- Modify: `lib/supabase.ts`
- Modify (only if `tsc` actually requires it): `features/auth/AuthProvider.tsx`, `features/auth/OtpService.ts`, `features/auth/actions.ts`

Current `lib/supabase.ts` (relevant lines — the file is longer, this is the part that changes):
```ts
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
```
...
```ts
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 1: Wire the type**

Add the import and the generic parameter:
```ts
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getEnv } from '@/lib/env';
```
...
```ts
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 2: Run `npx tsc --noEmit` and record the FULL error count and list**

This is the "big bang" moment — errors can appear in any of the 5 call-site files at once, not just `auth`. **Record the full list before touching anything** (paste it into your report). This task's job is ONLY the 3 `auth` module files (`AuthProvider.tsx`, `OtpService.ts`, `actions.ts`) — errors in `features/tasks/api.ts`/`features/offers/api.ts` are EXPECTED to still be present after this task and are Tasks 3/4's job, not yours. Don't touch those two files.

- [ ] **Step 3: Fix errors in the 3 auth-module files, if any**

Prediction (not certain, verify): `AuthProvider.tsx` only calls `supabase.auth.getSession()`/`supabase.auth.onAuthStateChange(...)` — Auth methods aren't schema-typed by the `Database` generic at all, so this file likely has zero new errors. `OtpService.ts` only calls `supabase.functions.invoke(...)` — Functions aren't schema-typed either, likely zero new errors there too. `actions.ts` is the one actually touching `public.profiles` (`.from('profiles').update(...)`/`.select('*')...`) — this is where an error is plausible, most likely around `fetchProfile`'s `return data as Profile;` (the cast might become redundant, which is not an error, just dead code) or `verifyPhoneCode`/`saveProfile`'s `.update({...})` calls (should be fine if the fields you're setting are real matching columns — verify).

If you find an actual error, fix it minimally (the correct fix is almost always: match the exact shape `.select()`/`.update()`/`.insert()` now expects, or add/remove a cast — NOT changing what the function returns or does). If you're unsure whether a fix is correct vs. papering over a real bug, stop and report NEEDS_CONTEXT rather than guessing.

- [ ] **Step 4: Verify and commit**

Run `npx tsc --noEmit` — confirm zero errors remain in `AuthProvider.tsx`, `OtpService.ts`, `actions.ts` specifically (errors in `features/tasks/api.ts`/`features/offers/api.ts` are fine, expected, not yours to fix). Run `npm test` — confirm unchanged from baseline (this is a types-only change, no test should need updating; if one does, stop and report why before "fixing" it).

```bash
git add lib/supabase.ts features/auth/AuthProvider.tsx features/auth/OtpService.ts features/auth/actions.ts
git commit -m "feat: enable typed Supabase client, fix auth module"
```

(Only `git add` the auth files if you actually changed them — don't stage untouched files.)

---

### Task 3: Fix `features/tasks/api.ts`

**Files:**
- Modify (only if `tsc` requires it): `features/tasks/api.ts`

By this point `createClient<Database>` is already active (Task 2). Run `npx tsc --noEmit` and address every remaining error in `features/tasks/api.ts` specifically — errors in `features/offers/api.ts` are Task 4's job, not yours.

**Known context to read before you start** (don't re-derive this, it's already figured out): the comment above `TaskWithCategory`/`attachClients` in this file already anticipates that a raw select-string embed (`category:categories(name, slug)`) can't be inferred as a to-one relation by the typed client, and already casts through `unknown` for exactly that reason (`as unknown as TaskWithCategory[]`) — this was written defensively in an earlier sub-project, before `Database` typing existed. It's plausible this cast already fully absorbs the type change and `fetchOpenTasks`/`fetchTaskById` need no further changes — verify, don't assume either way.

**Watch specifically for** (see "Before you start" at the top of this plan for the full reasoning):
- `status` fields: `fetchMyTasks`'s return object literal (`t.status` flowing into a `MyPublishedTask`), `completeTask`/`cancelTask`'s `.update({status: '...'})` calls. A `TaskStatus`-typed value flowing INTO a now-`string`-typed column is fine (no error); the risk is the other direction, reading a raw `string` and treating it as `TaskStatus` without a cast — likely surfaces where `Task`/`MyPublishedTask` objects get constructed from raw query results, if at all before Task 5's type-alias change lands (some of this may not actually surface until Task 5, since right now `Task`/`CategoryRow` are still the OLD hand-written types with `status: TaskStatus`, and the casts like `as Task[]` may already suppress any error at this stage — if so, this becomes visible only in Task 5, which is fine, just note it in your report so Task 5's implementer isn't surprised).
- `budget_reference`: same reasoning — may or may not surface yet depending on where casts already exist.

Fix errors minimally and correctly (match what the typed client now expects; don't change return shapes or behavior). If unsure, report NEEDS_CONTEXT rather than guessing.

- [ ] Run `npx tsc --noEmit`, fix `features/tasks/api.ts`'s errors, confirm zero remain in this file (others may still have errors — not yours).
- [ ] Run `npm test`, confirm unchanged from baseline.
- [ ] Commit: `git add features/tasks/api.ts && git commit -m "fix: resolve typed-client errors in features/tasks/api.ts"` (skip this task's commit if there was nothing to fix — note that in your report instead).

---

### Task 4: Fix `features/offers/api.ts`

**Files:**
- Modify (only if `tsc` requires it): `features/offers/api.ts`

Same process as Task 3, scoped to this file. `acceptOffer`'s `supabase.rpc('accept_offer', {p_offer_id: offerId})` call is worth a specific check — once typed, `.rpc()` validates the function name and argument shape against `Database['public']['Functions']`; confirm this still compiles (the RPC already exists and is unit-tested at the SQL level, so this should just be a type-shape check, not a behavior question).

Same `status`/`price` watch-list as Task 3 (see "Before you start").

- [ ] Run `npx tsc --noEmit`, fix `features/offers/api.ts`'s errors, confirm zero remain in this file.
- [ ] Run `npm test`, confirm unchanged from baseline.
- [ ] Commit: `git add features/offers/api.ts && git commit -m "fix: resolve typed-client errors in features/offers/api.ts"` (skip if nothing to fix, note it).

---

### Task 5: Derive `Profile`, `Task`, `CategoryRow`, `Offer` from `Database`

**Files:**
- Modify: `features/auth/types.ts`
- Modify: `features/tasks/types.ts`
- Modify: `features/offers/types.ts`
- Modify (only if new errors surface): `features/tasks/api.ts`, `features/offers/api.ts`, `features/auth/actions.ts`, and any component/hook file that constructs or reads these types

Current `features/auth/types.ts` (relevant part):
```ts
export interface Profile {
  id: string;
  full_name: string | null;
  city: string | null;
  phone: string | null;
  phone_verified: boolean;
  avatar_url: string | null;
}
```
Change to:
```ts
import type { Database } from '@/lib/database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
```
(Verify the resulting shape still has exactly these 6 fields, same nullability — if the real schema has more/fewer columns than this hand-written version assumed, that's real drift this migration is specifically meant to catch. Report what you find.)

Current `features/tasks/types.ts` (relevant part):
```ts
export type TaskStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
...
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
...
// A row from public.categories, used by the post-task category picker.
export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
}
```
Change `Task` to (status override per "Before you start" — approved, not optional):
```ts
import type { Database } from '@/lib/database.types';

export type TaskStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
...
// The raw shape of a row in public.tasks, with `status` narrowed from the
// DB's raw `text` column to the literal union the app relies on for
// exhaustive switches — the DB enforces the invariant via CHECK + the
// enforce_task_status_transitions trigger, this just tells TypeScript.
export type Task = Omit<Database['public']['Tables']['tasks']['Row'], 'status'> & { status: TaskStatus };
```
Change `CategoryRow` to:
```ts
export type CategoryRow = Database['public']['Tables']['categories']['Row'];
```
(`TaskWithRelations`, `MyPublishedTask`, `CreateTaskInput`, `TaskCategory`, `TaskClient` stay exactly as currently written — they already `extends Task`/reference these types, no changes needed to their own bodies, only whatever `tsc` errors their now-different base type surfaces.)

Current `features/offers/types.ts` (relevant part):
```ts
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
```
Change `Offer` to (same status-override pattern):
```ts
import type { Database } from '@/lib/database.types';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export type Offer = Omit<Database['public']['Tables']['offers']['Row'], 'status'> & { status: OfferStatus };
```

- [ ] **Step 1: Apply the 4 type changes above** (`Profile`, `Task`, `CategoryRow`, `Offer`).
- [ ] **Step 2: Run `npx tsc --noEmit`** across the whole project. This may surface NEW errors beyond Tasks 2-4's fixes — e.g. if `budget_reference`/`price` turn out to be `string` in the real generated schema (see "Before you start" prediction #2) and weren't already cast, this is where it would show up, since `Task`/`Offer` now flow the real column type through instead of the old hand-written `number`. Fix by casting to `number` at the read boundary in `features/tasks/api.ts`/`features/offers/api.ts` if and only if this actually happens — don't add speculative casts for a mismatch that didn't occur.
- [ ] **Step 3: Check every consumer that does `extends Task`/`extends Offer` or destructures these types** (`TaskWithRelations`, `MyPublishedTask`, `CreateTaskInput`, `OfferWithFreelancer`, `MyOfferWithTask`, `CreateOfferInput`, and anywhere in `components/`/`app/` that reads a `Task`/`Offer`/`Profile` field) — confirm no new errors, fix minimally if any appear.
- [ ] **Step 4: Run `npm test`** — confirm unchanged from baseline. This is still a types-only change; if a test needs an actual behavior change to pass, stop and report why before touching it.
- [ ] **Step 5: Commit**

```bash
git add features/auth/types.ts features/tasks/types.ts features/offers/types.ts
# plus any other files you had to touch to fix newly-surfaced errors — list them explicitly in your report
git commit -m "feat: derive Profile/Task/CategoryRow/Offer from generated Database types"
```

---

### Task 6: Final verification

- [ ] Run the full suite: `npm test` (or `npx jest --testPathIgnorePatterns "/node_modules/|/\.claude/"` if another worktree exists under `.claude/worktrees/`). Expected: all green, same count as the pre-task-1 baseline (this was never meant to add or remove tests — if the count changed, that's worth explaining, not just reporting).
- [ ] Run `npx tsc --noEmit`. Expected: clean, zero errors, project-wide.
- [ ] Confirm `lib/database.types.ts` is committed and `package.json`'s `gen:types` script works (`npm run gen:types` — requires Docker up; if Docker happens to be down at this exact moment, it's fine to skip re-running it since Task 1 already proved the command works, just don't claim you re-verified it if you didn't).
- [ ] Commit: `git commit --allow-empty -m "chore: final verification for supabase gen types migration"` with a message body noting the live test count, `tsc` status, and a summary of what actually broke/got fixed across Tasks 2-5 vs. what this plan predicted in "Before you start" (useful for the final holistic review and for future memory — note which predictions were right, which were wrong, and anything unexpected).
