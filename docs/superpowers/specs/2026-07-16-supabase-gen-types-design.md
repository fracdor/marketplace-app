# Migrar a `supabase gen types` — Design Spec

**Goal:** Replace the untyped `@supabase/supabase-js` client with one fully typed against the actual Postgres schema, so `tsc` catches query mistakes (wrong table/column names, wrong types) at the 5 call sites that talk to Supabase directly. Also remove hand-maintenance drift risk on the 4 raw-row types that mirror real tables, by deriving them from the generated schema instead.

**Why now:** Last item on the original roadmap, previously blocked by Docker being down. Docker was fixed 2026-07-16 (see memory), but crashed again mid-session while starting this sub-project's brainstorming — this spec is written now regardless, since spec/plan writing doesn't need Docker; execution (Task 1 onward) is blocked until Docker is confirmed up again.

## Scope

Exactly 5 files call the Supabase client directly today (confirmed by grep across `app/`, `features/`, `lib/`, excluding tests): `features/auth/AuthProvider.tsx`, `features/auth/OtpService.ts`, `features/auth/actions.ts`, `features/offers/api.ts`, `features/tasks/api.ts`. Exactly 4 real tables exist: `profiles`, `categories`, `tasks`, `offers` (plus one view, `profiles_public`, out of scope — see below).

## Architecture

- **`lib/database.types.ts`** (new, generated, not hand-edited): `npx supabase gen types typescript --local > lib/database.types.ts`.
- **`package.json`** gains a `gen:types` script running that exact command, for convenient manual regeneration after future migrations (no automation, no git hook — matches this project's established convention of manual regeneration, same as `CLAUDE.md`).
- **`lib/supabase.ts`**: `createClient<Database>(...)`, `import type { Database } from './database.types'`. This is an atomic, all-or-nothing change — the client is a single shared instance, so the moment this lands, `tsc` will surface every type mismatch across all 5 call-site files simultaneously, not incrementally.
- **Raw-row types derived from `Database`, extension types stay hand-written:**
  - `features/auth/types.ts`: `Profile` becomes `type Profile = Database['public']['Tables']['profiles']['Row']`.
  - `features/tasks/types.ts`: `Task` becomes `type Task = Database['public']['Tables']['tasks']['Row']`; `CategoryRow` becomes `type CategoryRow = Database['public']['Tables']['categories']['Row']`.
  - `features/offers/types.ts`: `Offer` becomes `type Offer = Database['public']['Tables']['offers']['Row']`.
  - Everything that currently `extends Task`/`extends Offer`/etc. (`TaskWithRelations`, `MyPublishedTask`, `CreateTaskInput`, `OfferWithFreelancer`, `MyOfferWithTask`, `CreateOfferInput`, and the partial-projection types `TaskCategory`, `TaskClient`, `OfferFreelancer`, `OfferTaskSummary`) stay exactly as hand-written interfaces, just now extending the derived alias instead of a manually-typed one — no shape changes, no behavior changes.

## Process (exploratory — no way to predict `tsc` errors without Docker)

This sub-project doesn't follow the TDD write-test-first shape every other sub-project this session used — there's no new runtime behavior, so no failing test to write. The closest equivalent is `tsc --noEmit`, which already exists as this project's standing check. Each task states its starting and ending `tsc` error count, discovered live rather than predicted:

1. Generate `lib/database.types.ts` + add the `gen:types` script. No `tsc` impact yet (file isn't imported anywhere).
2. Wire `createClient<Database>` into `lib/supabase.ts`. This is expected to surface `tsc` errors across some/all of the 5 call-site files — genuinely unknown how many or where until it's actually done, since Docker being down blocked generating a real schema and testing this ahead of time.
3. Fix whatever `tsc` errors appear, one feature module at a time (`auth`, `tasks`, `offers`) — likely candidates based on reading the current code: `.select('*')` queries that currently rely on `as Type` casts might get a stricter inferred shape than expected; `.update({...})` calls with a field name typo would now be caught (a good thing, but means fixing a possibly-real latent bug); nullable-vs-required mismatches between the hand-written manual types and the actual Postgres column nullability.
4. Convert the 4 raw-row types to derived aliases, adjusting the extension types' `extends` clause.
5. Final verification: `tsc --noEmit` clean, full test suite unchanged (~186 tests — verify live, don't trust this number).

## Out of scope

- `profiles_public` (a view, not a table) — not touched. The partial-projection types that happen to match its queried shape (`TaskClient`, `OfferFreelancer`) stay hand-written, not derived from `Database['public']['Views'][...]`. Could be a future enhancement, not part of this pass.
- No automation for regenerating `lib/database.types.ts` after future migrations (manual `npm run gen:types`, matching `CLAUDE.md`'s own maintenance convention).
- No behavior changes anywhere — this is types-only. If a `tsc` error reveals what looks like a genuine pre-existing runtime bug (not just an overly-loose manual type), that gets flagged during implementation and decided on a case-by-case basis rather than silently "fixed" as part of a type-only task.
- No changes to RLS policies, migrations, or any SQL.

## Docker dependency

Every step needs a running local Supabase instance (`npx supabase gen types typescript --local` connects to it directly) — this entire sub-project is blocked whenever Docker is down. Unlike the SMS OTP sub-project, there's no meaningful way to decompose this into a Docker-independent piece; the generated file is the entire starting point.
