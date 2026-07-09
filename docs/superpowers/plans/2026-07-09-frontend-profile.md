# Frontend App — Perfil Propio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `(tabs)/profile.tsx` placeholder with a real view/edit screen for the current user's own profile (name, city — phone and avatar stay read-only).

**Architecture:** `ProfileForm` (already built, used by onboarding) gains two optional props (`initialValues`, `submitLabel`) so it can be reused here without touching onboarding's call site. `app/(tabs)/profile.tsx` gets a local `mode: 'view' | 'edit'` toggle — no new route, no new hooks, no new backend. Saving calls the existing `saveProfile` then `refreshProfile()` from `useAuth()`.

**Tech Stack:** React Hook Form, Zod (already wired into `ProfileForm`), Jest (jest-expo) + React Native Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-07-09-frontend-profile-design.md](../specs/2026-07-09-frontend-profile-design.md)

---

## Before you start

- Work from the worktree `D:\App mario y yo\.worktrees\frontend-profile` (branch `frontend-profile`). **Always run `npm test`/`npx tsc` from inside this worktree, never the repo root.**
- **Baseline, verified live moments before writing this plan: 136 tests, 25 suites, `tsc --noEmit` clean.** Treat the per-task running totals below as sanity-check estimates, not ground truth — trust the actual `npm test` output.
- **Docker/Supabase local is still down.** Not needed — every test mocks `@/features/auth/actions` and/or `@/features/auth/useAuth`, never a live database. `saveProfile`/`fetchProfile` (`features/auth/actions.ts`) are pre-existing, unmodified, and already have no dedicated unit test — same precedent continues here.
- **`jest` stays on `^29`.** No new npm packages needed anywhere in this plan.
- **Await every `fireEvent.*` call, including `changeText`, not just `press`.** This was a real, independently-reproduced bug found in the `frontend-offers-mytasks` sub-project: in this exact stack (RN 0.86 + React 19.2 + RNTL v14.0.1), an unawaited `fireEvent.changeText` corrupts React's `act()`-tracking state and can break a *later* test in the same file. `ProfileForm.test.tsx` already exists with 2 tests that do NOT await their `fireEvent` calls — Task 1 below retrofits them while adding new tests, since a 3rd/4th test being added to that exact file is exactly the scenario that already broke `PostTaskForm.test.tsx` once.
- **`ProfileForm`'s new props are additive and optional** (`initialValues?: ProfileInput`, `submitLabel?: string`, both defaulting to onboarding's current behavior) — confirmed via `grep` that `app/(auth)/onboarding.tsx` calls `<ProfileForm onSubmit={...} />` with no other props, so onboarding's behavior is unaffected by this plan. No onboarding files are touched.
- **The view-mode screen never needs to handle "no phone" / "empty name" / "unverified" states.** `features/auth/gate.ts`'s `needsOnboarding()` already guarantees nobody reaches `(tabs)` without `phone_verified === true` and non-empty `full_name`/`city` — the app's root gate (`app/index.tsx`) redirects to onboarding otherwise. Don't add defensive fallback UI for these — they're unreachable once inside `(tabs)`.
- **Phone display format:** `+57 {profile.phone}` (raw stored digits, Colombian country code prefix) + a separate "✓ Verificado" badge. No new phone-formatting utility — this is the minimal, already-decided format, not an open design question.

---

### Task 1: `features/auth/ProfileForm.tsx` — `initialValues` and `submitLabel` props (TDD)

**Files:**
- Modify: `features/auth/ProfileForm.tsx`
- Modify: `features/auth/__tests__/ProfileForm.test.tsx`

- [ ] **Step 1: Write the failing tests (replaces the whole test file)**

```tsx
// features/auth/__tests__/ProfileForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileForm } from '@/features/auth/ProfileForm';

describe('ProfileForm', () => {
  it('blocks submit and shows errors when empty', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm onSubmit={onSubmit} />);
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('El nombre es obligatorio')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits name and city', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<ProfileForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('name-input'), 'Ana Ruiz');
    await fireEvent.changeText(screen.getByTestId('city-input'), 'Bogotá');
    await fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ full_name: 'Ana Ruiz', city: 'Bogotá' }));
  });

  it('prefills the fields when initialValues is provided', async () => {
    const onSubmit = jest.fn();
    await render(
      <ProfileForm onSubmit={onSubmit} initialValues={{ full_name: 'Ana Ruiz', city: 'Bogotá' }} />,
    );
    expect(screen.getByDisplayValue('Ana Ruiz')).toBeTruthy();
    expect(screen.getByDisplayValue('Bogotá')).toBeTruthy();
  });

  it('uses a custom submit label when provided', async () => {
    const onSubmit = jest.fn();
    await render(<ProfileForm onSubmit={onSubmit} submitLabel="Guardar" />);
    expect(screen.getByText('Guardar')).toBeTruthy();
    expect(screen.queryByText('Continuar')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/ProfileForm.test.tsx`
Expected: FAIL — `initialValues`/`submitLabel` props don't exist yet, so the last two tests fail (`getByDisplayValue` finds nothing / `getByText('Guardar')` finds nothing, still shows `'Continuar'`).

- [ ] **Step 3: Implement the updated component**

Replace the entire content of `features/auth/ProfileForm.tsx`:

```tsx
// features/auth/ProfileForm.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type ProfileInput } from '@/features/auth/schemas';
import { mapAuthError } from '@/features/auth/errors';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface ProfileFormProps {
  onSubmit: (input: ProfileInput) => Promise<void>;
  initialValues?: ProfileInput;
  submitLabel?: string;
}

export function ProfileForm({ onSubmit, initialValues, submitLabel = 'Continuar' }: ProfileFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: initialValues ?? { full_name: '', city: '' },
  });
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setSubmitError(e instanceof Error ? mapAuthError(e.message) : 'Error');
    }
  });
  return (
    <View>
      <Controller
        control={control}
        name="full_name"
        render={({ field, fieldState }) => (
          <Input
            label="Nombre completo"
            testID="name-input"
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
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label={submitLabel} onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/auth/__tests__/ProfileForm.test.tsx`
Expected: PASS (4 test cases; the file went from 2 to 4, a net +2).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 136 prior + 2 net-new = **138**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add initialValues and submitLabel props to ProfileForm"
```

---

### Task 2: Wire `app/(tabs)/profile.tsx` (TDD)

**Files:**
- Modify: `app/(tabs)/profile.tsx`
- Create: `app/(tabs)/__tests__/profile.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// app/(tabs)/__tests__/profile.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileTab from '@/app/(tabs)/profile';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('@/features/auth/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/auth/actions', () => ({
  saveProfile: jest.fn(),
  signOut: jest.fn(),
}));

import { useAuth } from '@/features/auth/useAuth';
import { saveProfile, signOut } from '@/features/auth/actions';

const profile = {
  id: 'u1',
  full_name: 'Ana Ruiz',
  city: 'Bogotá',
  phone: '3001234567',
  phone_verified: true,
  avatar_url: null,
};

let refreshProfile: jest.Mock;

function mockDefaults() {
  refreshProfile = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({
    session: { user: { id: 'u1' } },
    profile,
    refreshProfile,
  });
}

describe('ProfileTab', () => {
  beforeEach(() => {
    mockDefaults();
    (saveProfile as jest.Mock).mockResolvedValue(undefined);
    (signOut as jest.Mock).mockResolvedValue(undefined);
  });

  it('shows the current profile in view mode', async () => {
    await render(<ProfileTab />);
    expect(screen.getByText('Ana Ruiz')).toBeTruthy();
    expect(screen.getByText('Bogotá')).toBeTruthy();
    expect(screen.getByText('★ nuevo')).toBeTruthy();
    expect(screen.getByText('+57 3001234567')).toBeTruthy();
    expect(screen.getByText('✓ Verificado')).toBeTruthy();
    expect(screen.getByText('Editar perfil')).toBeTruthy();
  });

  it('shows the prefilled form when Editar perfil is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Editar perfil'));
    expect(screen.getByDisplayValue('Ana Ruiz')).toBeTruthy();
    expect(screen.getByDisplayValue('Bogotá')).toBeTruthy();
    expect(screen.getByText('Guardar')).toBeTruthy();
    expect(screen.getByText('Cancelar')).toBeTruthy();
  });

  it('returns to view mode without saving when Cancelar is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Editar perfil'));
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(screen.getByText('Editar perfil')).toBeTruthy();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('saves changes and returns to view mode when Guardar is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Editar perfil'));
    await fireEvent.changeText(screen.getByTestId('name-input'), 'Ana María Ruiz');
    await fireEvent.press(screen.getByText('Guardar'));
    await waitFor(() =>
      expect(saveProfile).toHaveBeenCalledWith('u1', { full_name: 'Ana María Ruiz', city: 'Bogotá' }),
    );
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Editar perfil')).toBeTruthy());
  });

  it('signs out when Cerrar sesión is pressed', async () => {
    await render(<ProfileTab />);
    await fireEvent.press(screen.getByText('Cerrar sesión'));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- "app/(tabs)/__tests__/profile.test.tsx"`
Expected: FAIL — the current placeholder screen doesn't render any of this content.

- [ ] **Step 3: Implement the screen**

Replace the entire content of `app/(tabs)/profile.tsx`:

```tsx
// app/(tabs)/profile.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';
import { saveProfile, signOut } from '@/features/auth/actions';
import { ProfileForm } from '@/features/auth/ProfileForm';
import { Button } from '@/components/ui/Button';
import type { ProfileInput } from '@/features/auth/schemas';

type Mode = 'view' | 'edit';

export default function ProfileTab() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const [mode, setMode] = useState<Mode>('view');

  // Guarded by the app's own root gate (app/index.tsx / app/(tabs)/_layout.tsx):
  // this screen only ever mounts once session+profile are resolved.
  if (!session || !profile) return null;

  const handleSave = async (input: ProfileInput) => {
    await saveProfile(session.user.id, input);
    await refreshProfile();
    setMode('view');
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/'); // back through the gate, consistent with signIn/signUp
  };

  return (
    <View className="flex-1 bg-white px-6 pt-8">
      {mode === 'view' ? (
        <View className="items-center">
          <View className="w-16 h-16 rounded-full bg-slate-200 mb-3" />
          <Text className="text-lg font-bold text-slate-900">{profile.full_name}</Text>
          <Text className="text-slate-500 text-sm">{profile.city}</Text>
          <Text className="text-slate-400 text-xs mt-1">★ nuevo</Text>

          <View className="w-full border-t border-slate-100 mt-6 pt-4 items-center">
            <Text className="text-slate-500 text-sm">
              +57 {profile.phone}
            </Text>
            <Text className="text-brand text-xs mt-1">✓ Verificado</Text>
          </View>

          <View className="w-full mt-6 gap-3">
            <Button label="Editar perfil" onPress={() => setMode('edit')} />
            <Button label="Cerrar sesión" variant="ghost" onPress={handleSignOut} />
          </View>
        </View>
      ) : (
        <View>
          <ProfileForm
            onSubmit={handleSave}
            initialValues={{ full_name: profile.full_name ?? '', city: profile.city ?? '' }}
            submitLabel="Guardar"
          />
          <Button label="Cancelar" variant="ghost" onPress={() => setMode('view')} />
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- "app/(tabs)/__tests__/profile.test.tsx"`
Expected: PASS (5 test cases).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all pass. Approximate total: 138 prior + 5 new = **143**.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire the profile screen with a view/edit toggle"
```

---

### Task 3: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass. Approximate total: **143** (136 pre-existing + 2 net-new from Task 1 + 5 from Task 2). Zero failures. **Trust the live count over this arithmetic.**

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the bundler builds**

Run: `npx expo export --platform ios` (self-terminating; produces a real bundle rather than just waiting for the CLI banner).
Expected: bundles with no red errors. Delete the resulting `dist/` afterward (`rm -rf dist`) — it's gitignored but keep the tree clean.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for profile sub-project" --allow-empty
```

---

## Notes for the executor

- **No live backend:** every test mocks `@/features/auth/useAuth` and/or `@/features/auth/actions` — nothing hits a real Supabase instance. When Docker/`npx supabase start` is available again, manually verify: editing name/city actually persists (`saveProfile`), and the updated values show up immediately after saving without a manual app restart (`refreshProfile` doing its job).
- **Deferred, per the design spec:** editing phone number (would need to reopen the OTP flow), avatar upload (needs Supabase Storage, not integrated anywhere in the app yet), real reputation (stays as the "★ nuevo" placeholder already used elsewhere).
- **`mapAuthError`** is reused inside `ProfileForm`'s own error handling — unchanged, already established.
