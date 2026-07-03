# Frontend App — Scaffold + Auth + Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo/React Native app (scaffold, navigation shell, auth + onboarding) on top of the existing Supabase backend, verified by a Jest test suite, with no live-backend dependency.

**Architecture:** Expo Router with `(auth)` and `(tabs)` route groups gated by a pure routing function. A React Context `AuthProvider` holds the session/profile and listens to Supabase auth changes. Pure logic (Zod schemas, the routing gate, the OTP service) is TDD'd in isolation; screens delegate to testable form components so route files stay thin. Styling is NativeWind (Tailwind for RN); auth screens use an animated `GradientBackground` (expo-linear-gradient + Moti).

**Tech Stack:** Expo (managed), Expo Router, TypeScript, NativeWind + Tailwind, react-native-reanimated + Moti, expo-linear-gradient, @supabase/supabase-js, expo-secure-store, react-hook-form + Zod, Jest (jest-expo) + React Native Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-07-03-frontend-app-scaffold-auth-design.md](../specs/2026-07-03-frontend-app-scaffold-auth-design.md)

---

## Before you start

- **Node** is installed (v24 confirmed). Use `npx expo install <pkg>` for any package that has a native/SDK-version-sensitive counterpart — it picks versions compatible with the installed Expo SDK. Use plain `npm install -D <pkg>` only for pure dev tooling (jest matchers, types).
- **Working directory** is the repo root (`D:\App mario y yo`), which already contains `supabase/`, `docs/`, and `.git/`. The Expo app is initialized **at the root**, so a temp-dir-and-move is used in Task 1 to avoid `create-expo-app`'s non-empty-directory refusal.
- **Docker/Supabase local is down** and there is **no SMS provider**. Nothing in this plan needs either: tests mock the Supabase client, and phone OTP uses a dev-stub. `.env` holds placeholder Supabase values.
- **Reanimated's babel plugin must be listed last** in `babel.config.js`. Moti depends on Reanimated.
- **NativeWind v4** needs three wired pieces (babel preset `jsxImportSource`, metro `withNativeWind`, and `global.css` imported once). All three are in Task 2 — if any is missing, `className` silently does nothing.
- **Path alias `@/*`** is configured in `tsconfig.json`; Metro/Expo resolves it natively in SDK 50+ (no extra babel module-resolver needed).
- After each task, `npx tsc --noEmit` should pass and `npm test` should be green.

---

### Task 1: Initialize the Expo app (TypeScript) at the repo root + Expo Router

**Files:**
- Create: `package.json`, `app.json`→`app.config.ts`, `tsconfig.json`, `.gitignore` (merged), plus Expo defaults
- Create: `app/_layout.tsx`, `app/index.tsx`
- Create: `index.ts` entry note (Expo Router uses `expo-router/entry`)

- [ ] **Step 1: Scaffold Expo into a temp dir and move to root**

```bash
# From repo root. Create the app in a temp dir (create-expo-app refuses non-empty targets).
npx create-expo-app@latest .expo-init --template blank-typescript
# Move everything (including dotfiles) up to the root, then remove the temp dir.
# Do NOT overwrite the existing .git or docs/ or supabase/.
mv .expo-init/* .
mv .expo-init/.gitignore .gitignore.expo 2>/dev/null || true
rm -rf .expo-init
```

- [ ] **Step 2: Merge the Expo .gitignore into the existing one**

Append Expo's ignores to the existing `.gitignore` (which already has `.worktrees/` and `.superpowers/`), then delete the temp copy:

```bash
cat .gitignore.expo >> .gitignore
rm .gitignore.expo
```

Ensure `.gitignore` contains at least these (add any missing lines manually):

```
node_modules/
.expo/
dist/
web-build/
*.orig.*
.env
```

- [ ] **Step 3: Install Expo Router and its peer dependencies**

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

- [ ] **Step 4: Point the app entry at Expo Router and set the scheme**

Set `"main"` in `package.json`:

```json
{
  "main": "expo-router/entry"
}
```

Replace `app.json` with `app.config.ts` (delete `app.json` after creating this):

```typescript
// app.config.ts
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Marketplace',
  slug: 'marketplace-app',
  scheme: 'marketplace', // provisional; change display name/scheme here in one place
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  plugins: ['expo-router', 'expo-secure-store'],
  ios: { supportsTablet: false },
  android: {},
  experiments: { typedRoutes: true },
};

export default config;
```

```bash
rm app.json
```

- [ ] **Step 5: Create the minimal router entry so the app boots**

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// app/index.tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Marketplace app — scaffold OK</Text>
    </View>
  );
}
```

Delete the default `App.tsx` if the template created one (`rm App.tsx 2>/dev/null || true`).

- [ ] **Step 6: Verify it typechecks and boots**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx expo start` (Ctrl-C after it prints the QR / "Metro waiting"). This only confirms Metro bundles without config errors — no device needed.
Expected: bundler starts with no red errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo app with Expo Router at repo root"
```

---

### Task 2: Configure NativeWind + Tailwind

**Files:**
- Create: `tailwind.config.js`, `global.css`, `metro.config.js`, `nativewind-env.d.ts`
- Modify: `babel.config.js`

- [ ] **Step 1: Install NativeWind, Tailwind, Reanimated, Moti, and the gradient lib**

```bash
npx expo install nativewind react-native-reanimated react-native-linear-gradient expo-linear-gradient
npm install tailwindcss@^3.4.0 moti
```

(NativeWind v4 pairs with Tailwind v3. `react-native-linear-gradient` is pulled only so Moti's optional peers resolve; the app uses `expo-linear-gradient`.)

- [ ] **Step 2: Create the Tailwind config with the brand theme**

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0d9488', // teal-600 accent
          dark: '#0f766e',
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create global.css with the Tailwind directives**

```css
/* global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Wire the Babel preset for NativeWind + Reanimated**

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'], // MUST be last
  };
};
```

- [ ] **Step 5: Wire Metro for NativeWind**

```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
```

- [ ] **Step 6: Add the NativeWind TypeScript types**

```typescript
// nativewind-env.d.ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 7: Import global.css once in the root layout and use a className to verify**

```tsx
// app/_layout.tsx
import '../global.css';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```tsx
// app/index.tsx
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-brand text-lg font-bold">NativeWind OK</Text>
    </View>
  );
}
```

- [ ] **Step 8: Verify typecheck + bundle**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx expo start --clear` (Ctrl-C after "Metro waiting"). The `--clear` flushes the transformer cache so NativeWind picks up config.
Expected: bundles with no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: configure NativeWind, Tailwind, Reanimated, Moti"
```

---

### Task 3: Path alias `@/*` and the `cn()` utility (TDD)

**Files:**
- Modify: `tsconfig.json`
- Create: `lib/utils.ts`, `lib/__tests__/utils.test.ts`
- Create: `jest.config.js`, add `test` script to `package.json`

- [ ] **Step 1: Install the test tooling**

```bash
npm install -D jest-expo jest @testing-library/react-native @types/jest
```

- [ ] **Step 2: Add the `@/*` path alias to tsconfig**

```json
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"]
}
```

- [ ] **Step 3: Create the Jest config and test script**

```javascript
// jest.config.js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/react-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|moti|@supabase/.*))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "test": "jest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Write the failing test for `cn()`**

```typescript
// lib/__tests__/utils.test.ts
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('lets later Tailwind classes win on conflict', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/utils.test.ts`
Expected: FAIL — cannot find module `@/lib/utils`.

- [ ] **Step 6: Implement `cn()`**

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

Install its deps:

```bash
npm install clsx tailwind-merge
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- lib/__tests__/utils.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add @/* path alias, cn() util, and Jest setup"
```

---

### Task 4: Env config + Supabase client with SecureStore adapter

**Files:**
- Create: `lib/env.ts`, `lib/__tests__/env.test.ts`
- Create: `lib/supabase.ts`
- Create: `.env.example`, `.env`

- [ ] **Step 1: Write the failing test for env validation**

```typescript
// lib/__tests__/env.test.ts
import { readEnv } from '@/lib/env';

describe('readEnv', () => {
  it('returns url and anon key when both are present', () => {
    const env = readEnv({
      EXPO_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
    expect(env.supabaseUrl).toBe('http://localhost:54321');
    expect(env.supabaseAnonKey).toBe('anon-key');
  });

  it('throws when the url is missing', () => {
    expect(() => readEnv({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'x' })).toThrow(/SUPABASE_URL/);
  });

  it('throws when the anon key is missing', () => {
    expect(() => readEnv({ EXPO_PUBLIC_SUPABASE_URL: 'x' })).toThrow(/ANON_KEY/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- lib/__tests__/env.test.ts`
Expected: FAIL — cannot find module `@/lib/env`.

- [ ] **Step 3: Implement env reading (pure function + exported values)**

```typescript
// lib/env.ts
type RawEnv = Record<string, string | undefined>;

export interface Env {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function readEnv(raw: RawEnv): Env {
  const supabaseUrl = raw.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = raw.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return { supabaseUrl, supabaseAnonKey };
}

// Lazy + memoized: reading process.env at module load would throw in Jest
// (where EXPO_PUBLIC_* are undefined). getEnv() is only called by the real
// Supabase client, never in tests (which mock @/lib/supabase).
let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = readEnv(process.env as RawEnv);
  return cached;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- lib/__tests__/env.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Create the .env files with dev placeholders**

```bash
# .env.example  (committed)
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=replace-with-anon-key-from-`npx supabase start`
```

```bash
# .env  (gitignored — real/placeholder local values)
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=dev-placeholder-anon-key
```

- [ ] **Step 6: Create the Supabase client with a SecureStore storage adapter**

```typescript
// lib/supabase.ts
import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

const env = getEnv();

// SecureStore has a ~2KB per-value limit. Supabase sessions can exceed it,
// so we chunk large values across numbered keys.
const CHUNK_SIZE = 2000;

const SecureStoreAdapter: SupportedStorage = {
  async getItem(key) {
    const meta = await SecureStore.getItemAsync(key);
    if (meta === null) return null;
    if (!meta.startsWith('__chunks__:')) return meta;
    const count = parseInt(meta.slice('__chunks__:'.length), 10);
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(key, value) {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(key, `__chunks__:${count}`);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },
  async removeItem(key) {
    const meta = await SecureStore.getItemAsync(key);
    if (meta?.startsWith('__chunks__:')) {
      const count = parseInt(meta.slice('__chunks__:'.length), 10);
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

Install runtime deps:

```bash
npx expo install @supabase/supabase-js expo-secure-store react-native-url-polyfill
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add env config and Supabase client with chunked SecureStore adapter"
```

---

### Task 5: Zod validation schemas (TDD)

**Files:**
- Create: `features/auth/schemas.ts`, `features/auth/__tests__/schemas.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// features/auth/__tests__/schemas.test.ts
import { loginSchema, registerSchema, phoneSchema, profileSchema } from '@/features/auth/schemas';

describe('loginSchema', () => {
  it('accepts a valid email + password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'secret12' }).success).toBe(true);
  });
  it('rejects an invalid email', () => {
    expect(loginSchema.safeParse({ email: 'nope', password: 'secret12' }).success).toBe(false);
  });
  it('rejects a short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts matching passwords', () => {
    expect(
      registerSchema.safeParse({ email: 'a@b.co', password: 'secret12', confirm: 'secret12' }).success,
    ).toBe(true);
  });
  it('rejects mismatched passwords', () => {
    expect(
      registerSchema.safeParse({ email: 'a@b.co', password: 'secret12', confirm: 'other123' }).success,
    ).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('accepts a 10-digit Colombian mobile', () => {
    expect(phoneSchema.safeParse({ phone: '3001234567' }).success).toBe(true);
  });
  it('rejects a number that is not 10 digits', () => {
    expect(phoneSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });
  it('rejects non-digits', () => {
    expect(phoneSchema.safeParse({ phone: '30012abcde' }).success).toBe(false);
  });
});

describe('profileSchema', () => {
  it('accepts a full name + city', () => {
    expect(profileSchema.safeParse({ full_name: 'Ana Ruiz', city: 'Bogotá' }).success).toBe(true);
  });
  it('rejects an empty full name', () => {
    expect(profileSchema.safeParse({ full_name: '', city: 'Bogotá' }).success).toBe(false);
  });
  it('rejects an empty city', () => {
    expect(profileSchema.safeParse({ full_name: 'Ana', city: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/schemas.test.ts`
Expected: FAIL — cannot find module `@/features/auth/schemas`.

- [ ] **Step 3: Implement the schemas**

```typescript
// features/auth/schemas.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const phoneSchema = z.object({
  phone: z
    .string()
    .regex(/^\d{10}$/, 'Debe ser un celular de 10 dígitos'),
});
export type PhoneInput = z.infer<typeof phoneSchema>;

export const profileSchema = z.object({
  full_name: z.string().min(1, 'El nombre es obligatorio'),
  city: z.string().min(1, 'La ciudad es obligatoria'),
});
export type ProfileInput = z.infer<typeof profileSchema>;
```

Install Zod:

```bash
npm install zod
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/auth/__tests__/schemas.test.ts`
Expected: PASS (11 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Zod auth/profile schemas"
```

---

### Task 6: Auth routing gate (pure logic, TDD)

**Files:**
- Create: `features/auth/types.ts`
- Create: `features/auth/gate.ts`, `features/auth/__tests__/gate.test.ts`

- [ ] **Step 1: Define shared types**

```typescript
// features/auth/types.ts
export interface Profile {
  id: string;
  full_name: string | null;
  city: string | null;
  phone: string | null;
  phone_verified: boolean;
  avatar_url: string | null;
}

// Minimal shape we consume from Supabase's Session; avoids importing the SDK in pure logic.
export interface SessionLike {
  userId: string;
}

export type Route = '(auth)' | 'onboarding' | '(tabs)';
```

- [ ] **Step 2: Write the failing tests**

```typescript
// features/auth/__tests__/gate.test.ts
import { needsOnboarding, routeFor } from '@/features/auth/gate';
import type { Profile } from '@/features/auth/types';

const complete: Profile = {
  id: 'u1', full_name: 'Ana', city: 'Bogotá', phone: '3001234567',
  phone_verified: true, avatar_url: null,
};

describe('needsOnboarding', () => {
  it('is false for a complete profile', () => {
    expect(needsOnboarding(complete)).toBe(false);
  });
  it('is true when phone is not verified', () => {
    expect(needsOnboarding({ ...complete, phone_verified: false })).toBe(true);
  });
  it('is true when full_name is missing', () => {
    expect(needsOnboarding({ ...complete, full_name: null })).toBe(true);
  });
  it('is true when city is missing', () => {
    expect(needsOnboarding({ ...complete, city: '' as unknown as string })).toBe(true);
  });
  it('is true when profile is null', () => {
    expect(needsOnboarding(null)).toBe(true);
  });
});

describe('routeFor', () => {
  it('routes signed-out users to (auth)', () => {
    expect(routeFor(null, null)).toBe('(auth)');
  });
  it('routes signed-in-but-incomplete users to onboarding', () => {
    expect(routeFor({ userId: 'u1' }, { ...complete, phone_verified: false })).toBe('onboarding');
  });
  it('routes signed-in-and-complete users to (tabs)', () => {
    expect(routeFor({ userId: 'u1' }, complete)).toBe('(tabs)');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/gate.test.ts`
Expected: FAIL — cannot find module `@/features/auth/gate`.

- [ ] **Step 4: Implement the gate**

```typescript
// features/auth/gate.ts
import type { Profile, Route, SessionLike } from '@/features/auth/types';

export function needsOnboarding(profile: Profile | null): boolean {
  if (!profile) return true;
  if (!profile.phone_verified) return true;
  if (!profile.full_name) return true;
  if (!profile.city) return true;
  return false;
}

export function routeFor(session: SessionLike | null, profile: Profile | null): Route {
  if (!session) return '(auth)';
  if (needsOnboarding(profile)) return 'onboarding';
  return '(tabs)';
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- features/auth/__tests__/gate.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add pure auth routing gate"
```

---

### Task 7: OtpService (interface + dev stub, TDD)

**Files:**
- Create: `features/auth/OtpService.ts`, `features/auth/__tests__/OtpService.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// features/auth/__tests__/OtpService.test.ts
import { DevOtpService } from '@/features/auth/OtpService';

describe('DevOtpService', () => {
  it('reports a code was sent for a phone number', async () => {
    const svc = new DevOtpService();
    await expect(svc.sendCode('3001234567')).resolves.toEqual({ sent: true });
  });

  it('verifies the fixed dev code', async () => {
    const svc = new DevOtpService();
    await svc.sendCode('3001234567');
    await expect(svc.verifyCode('3001234567', '123456')).resolves.toEqual({ verified: true });
  });

  it('rejects a wrong code', async () => {
    const svc = new DevOtpService();
    await svc.sendCode('3001234567');
    await expect(svc.verifyCode('3001234567', '000000')).resolves.toEqual({ verified: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/OtpService.test.ts`
Expected: FAIL — cannot find module `@/features/auth/OtpService`.

- [ ] **Step 3: Implement the interface and dev stub**

```typescript
// features/auth/OtpService.ts
export interface OtpService {
  sendCode(phone: string): Promise<{ sent: boolean }>;
  verifyCode(phone: string, code: string): Promise<{ verified: boolean }>;
}

// Development implementation: no SMS provider wired yet. Accepts a fixed code.
// Swap for a Supabase-phone-auth / Twilio-backed impl later without touching callers.
export const DEV_OTP_CODE = '123456';

export class DevOtpService implements OtpService {
  async sendCode(_phone: string): Promise<{ sent: boolean }> {
    return { sent: true };
  }
  async verifyCode(_phone: string, code: string): Promise<{ verified: boolean }> {
    return { verified: code === DEV_OTP_CODE };
  }
}

export const otpService: OtpService = new DevOtpService();
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- features/auth/__tests__/OtpService.test.ts`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add OtpService interface and dev-stub implementation"
```

---

### Task 8: `components/ui` primitives

**Files:**
- Create: `components/ui/GradientBackground.tsx`, `components/ui/Button.tsx`, `components/ui/Input.tsx`, `components/ui/Card.tsx`
- Create: `components/ui/__tests__/primitives.test.tsx`

- [ ] **Step 1: Write the failing render tests**

```tsx
// components/ui/__tests__/primitives.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

describe('Button', () => {
  it('renders its label and fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Ingresar" onPress={onPress} />);
    fireEvent.press(screen.getByText('Ingresar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress while loading', () => {
    const onPress = jest.fn();
    render(<Button label="Ingresar" onPress={onPress} loading />);
    fireEvent.press(screen.getByTestId('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Input', () => {
  it('renders a label and an error message', () => {
    render(<Input label="Correo" value="" onChangeText={() => {}} error="Correo inválido" />);
    expect(screen.getByText('Correo')).toBeTruthy();
    expect(screen.getByText('Correo inválido')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/ui/__tests__/primitives.test.tsx`
Expected: FAIL — cannot find the modules.

- [ ] **Step 3: Implement Button**

```tsx
// components/ui/Button.tsx
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { cn } from '@/lib/utils';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}

export function Button({ label, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID="button"
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      className={cn(
        'h-12 rounded-xl items-center justify-center',
        variant === 'primary' ? 'bg-brand' : 'bg-transparent',
        isDisabled && 'opacity-60',
      )}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <View>
          <Text className={cn('font-semibold', variant === 'primary' ? 'text-white' : 'text-brand')}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 4: Implement Input**

```tsx
// components/ui/Input.tsx
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function Input({ label, error, ...props }: InputProps) {
  return (
    <View className="mb-3">
      <Text className="text-xs text-slate-600 mb-1">{label}</Text>
      <TextInput
        className={cn(
          'h-11 rounded-xl border px-3 bg-white',
          error ? 'border-red-400' : 'border-slate-200',
        )}
        placeholderTextColor="#94a3b8"
        {...props}
      />
      {error ? <Text className="text-xs text-red-500 mt-1">{error}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 5: Implement Card**

```tsx
// components/ui/Card.tsx
import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

export function Card({ className, children, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={cn('bg-white/95 rounded-2xl p-5 shadow-lg', className)} {...props}>
      {children}
    </View>
  );
}
```

- [ ] **Step 6: Implement GradientBackground (animated cross-fade)**

```tsx
// components/ui/GradientBackground.tsx
import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

const PALETTES: [string, string][] = [
  ['#2d1b69', '#11998e'],
  ['#0f3460', '#0d9488'],
  ['#134e5e', '#71b280'],
  ['#2d1b69', '#11998e'],
];

interface GradientBackgroundProps extends ViewProps {
  durationMs?: number;
}

// Cross-fades between gradient palettes by animating the opacity of a top layer
// that swaps its colors each cycle. The RN-native equivalent of the web
// framer-motion animated-background component.
export function GradientBackground({ children, durationMs = 6000, ...props }: GradientBackgroundProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % PALETTES.length), durationMs);
    return () => clearInterval(id);
  }, [durationMs]);

  const current = PALETTES[index];

  return (
    <View style={styles.fill} {...props}>
      <LinearGradient colors={PALETTES[0]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <MotiView
        key={index}
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: durationMs / 2 }}
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient colors={current} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </MotiView>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1 },
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- components/ui/__tests__/primitives.test.tsx`
Expected: PASS (3 assertions).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add components/ui primitives (GradientBackground, Button, Input, Card)"
```

---

### Task 9: AuthProvider + actions

**Files:**
- Create: `features/auth/actions.ts`
- Create: `features/auth/AuthProvider.tsx`, `features/auth/useAuth.ts`
- Create: `features/auth/__tests__/AuthProvider.test.tsx`

- [ ] **Step 1: Implement the auth actions (thin wrappers over Supabase + OtpService)**

```typescript
// features/auth/actions.ts
import { supabase } from '@/lib/supabase';
import { otpService } from '@/features/auth/OtpService';
import type { Profile } from '@/features/auth/types';

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function sendPhoneCode(phone: string) {
  return otpService.sendCode(phone);
}

export async function verifyPhoneCode(userId: string, phone: string, code: string) {
  const { verified } = await otpService.verifyCode(phone, code);
  if (!verified) throw new Error('Código incorrecto');
  const { error } = await supabase
    .from('profiles')
    .update({ phone, phone_verified: true })
    .eq('id', userId);
  if (error) throw error;
}

export async function saveProfile(userId: string, input: Pick<Profile, 'full_name' | 'city'>) {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: input.full_name, city: input.city })
    .eq('id', userId);
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data as Profile;
}
```

- [ ] **Step 2: Write the failing test for AuthProvider (Supabase mocked)**

```tsx
// features/auth/__tests__/AuthProvider.test.tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { useAuth } from '@/features/auth/useAuth';

jest.mock('@/lib/supabase', () => {
  const listeners: any[] = [];
  return {
    supabase: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: jest.fn((cb) => {
          listeners.push(cb);
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      from: jest.fn(() => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      })),
    },
  };
});

function Probe() {
  const { loading, session } = useAuth();
  return <Text>{loading ? 'loading' : session ? 'signed-in' : 'signed-out'}</Text>;
}

describe('AuthProvider', () => {
  it('resolves to signed-out when there is no session', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/AuthProvider.test.tsx`
Expected: FAIL — cannot find modules `AuthProvider` / `useAuth`.

- [ ] **Step 4: Implement the context, provider, and hook**

```tsx
// features/auth/AuthProvider.tsx
import { createContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { fetchProfile } from '@/features/auth/actions';
import type { Profile } from '@/features/auth/types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  async function loadProfile(s: Session | null) {
    setProfile(s ? await fetchProfile(s.user.id) : null);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      await loadProfile(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => loadProfile(session);

  return (
    <AuthContext.Provider value={{ loading, session, profile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
```

```typescript
// features/auth/useAuth.ts
import { useContext } from 'react';
import { AuthContext } from '@/features/auth/AuthProvider';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- features/auth/__tests__/AuthProvider.test.tsx`
Expected: PASS (1 assertion).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add AuthProvider, useAuth, and auth actions"
```

---

### Task 10: Expo Router shell + gate wiring + (tabs) placeholders

**Files:**
- Modify: `app/_layout.tsx`, `app/index.tsx`
- Create: `app/(auth)/_layout.tsx`, `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx`, `app/(tabs)/my-tasks.tsx`, `app/(tabs)/post-task.tsx`, `app/(tabs)/profile.tsx`

- [ ] **Step 1: Wrap the app in AuthProvider at the root**

```tsx
// app/_layout.tsx
import '../global.css';
import { Stack } from 'expo-router';
import { AuthProvider } from '@/features/auth/AuthProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Make the index route the gate (redirects based on routeFor)**

```tsx
// app/index.tsx
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/features/auth/useAuth';
import { routeFor } from '@/features/auth/gate';

export default function Index() {
  const { loading, session, profile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const target = routeFor(session ? { userId: session.user.id } : null, profile);
    if (target === '(auth)') router.replace('/(auth)/login');
    else if (target === 'onboarding')
      // Skip phone step if already verified; only profile details remain.
      router.replace(profile?.phone_verified ? '/(auth)/onboarding' : '/(auth)/verify-phone');
    else router.replace('/(tabs)');
  }, [loading, session, profile, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
```

- [ ] **Step 3: Create the (auth) group layout with the gradient background**

```tsx
// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';
import { GradientBackground } from '@/components/ui/GradientBackground';

export default function AuthLayout() {
  return (
    <GradientBackground>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
    </GradientBackground>
  );
}
```

- [ ] **Step 4: Create the (tabs) layout and placeholder screens**

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Feed' }} />
      <Tabs.Screen name="my-tasks" options={{ title: 'Mis tareas' }} />
      <Tabs.Screen name="post-task" options={{ title: 'Publicar' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
```

```tsx
// app/(tabs)/index.tsx
import { View, Text } from 'react-native';
export default function Feed() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-slate-500">Feed (próximo sub-proyecto)</Text>
    </View>
  );
}
```

```tsx
// app/(tabs)/my-tasks.tsx
import { View, Text } from 'react-native';
export default function MyTasks() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-slate-500">Mis tareas (próximo sub-proyecto)</Text>
    </View>
  );
}
```

```tsx
// app/(tabs)/post-task.tsx
import { View, Text } from 'react-native';
export default function PostTask() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-slate-500">Publicar tarea (próximo sub-proyecto)</Text>
    </View>
  );
}
```

```tsx
// app/(tabs)/profile.tsx
import { View, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { signOut } from '@/features/auth/actions';
export default function ProfileTab() {
  return (
    <View className="flex-1 items-center justify-center bg-white gap-4 px-6">
      <Text className="text-slate-500">Perfil (próximo sub-proyecto)</Text>
      <Button label="Cerrar sesión" variant="ghost" onPress={() => signOut()} />
    </View>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Route files referencing `/(auth)/login`, `/(auth)/verify-phone` will resolve once Task 11–12 create them; typed-routes may warn until then — that is expected and clears after Task 12.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add router shell, auth gate wiring, and (tabs) placeholders"
```

---

### Task 11: Login and Register screens

**Files:**
- Create: `features/auth/LoginForm.tsx`, `features/auth/RegisterForm.tsx`
- Create: `features/auth/__tests__/LoginForm.test.tsx`
- Create: `app/(auth)/login.tsx`, `app/(auth)/register.tsx`

- [ ] **Step 1: Write the failing test for LoginForm (validation + submit)**

```tsx
// features/auth/__tests__/LoginForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginForm } from '@/features/auth/LoginForm';

describe('LoginForm', () => {
  it('shows a validation error and does not submit on invalid input', async () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);
    fireEvent.press(screen.getByText('Ingresar'));
    await waitFor(() => expect(screen.getByText('Correo inválido')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid credentials', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<LoginForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('email-input'), 'a@b.co');
    fireEvent.changeText(screen.getByTestId('password-input'), 'secret12');
    fireEvent.press(screen.getByText('Ingresar'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a@b.co', 'secret12'));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/LoginForm.test.tsx`
Expected: FAIL — cannot find module `LoginForm`.

- [ ] **Step 3: Implement LoginForm (react-hook-form + Zod)**

```tsx
// features/auth/LoginForm.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@/features/auth/schemas';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface LoginFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values.email, values.password);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al ingresar');
    }
  });

  return (
    <View>
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Input
            label="Correo"
            testID="email-input"
            autoCapitalize="none"
            keyboardType="email-address"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Input
            label="Contraseña"
            testID="password-input"
            secureTextEntry
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Ingresar" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
```

Install form deps:

```bash
npm install react-hook-form @hookform/resolvers
```

- [ ] **Step 4: Implement RegisterForm (same pattern, register schema)**

```tsx
// features/auth/RegisterForm.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@/features/auth/schemas';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface RegisterFormProps {
  onSubmit: (email: string, password: string) => Promise<void>;
}

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirm: '' },
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSubmit(values.email, values.password);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error al crear la cuenta');
    }
  });

  return (
    <View>
      <Controller control={control} name="email" render={({ field, fieldState }) => (
        <Input label="Correo" testID="email-input" autoCapitalize="none" keyboardType="email-address"
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      <Controller control={control} name="password" render={({ field, fieldState }) => (
        <Input label="Contraseña" testID="password-input" secureTextEntry
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      <Controller control={control} name="confirm" render={({ field, fieldState }) => (
        <Input label="Confirmar contraseña" testID="confirm-input" secureTextEntry
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Crear cuenta" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
```

- [ ] **Step 5: Run the LoginForm test to verify it passes**

Run: `npm test -- features/auth/__tests__/LoginForm.test.tsx`
Expected: PASS (2 assertions).

- [ ] **Step 6: Wire the route files (thin: form + actions + navigation)**

```tsx
// app/(auth)/login.tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { LoginForm } from '@/features/auth/LoginForm';
import { signIn } from '@/features/auth/actions';

export default function LoginScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-1">Ingresar</Text>
      <Text className="text-white/80 text-center mb-6">Bienvenido de vuelta</Text>
      <Card>
        <LoginForm onSubmit={async (email, password) => { await signIn(email, password); router.replace('/'); }} />
        <Pressable onPress={() => router.push('/(auth)/register')}>
          <Text className="text-brand text-center mt-4 font-semibold">Crear cuenta</Text>
        </Pressable>
      </Card>
    </View>
  );
}
```

```tsx
// app/(auth)/register.tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { RegisterForm } from '@/features/auth/RegisterForm';
import { signUp } from '@/features/auth/actions';

export default function RegisterScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Crear cuenta</Text>
      <Card>
        <RegisterForm onSubmit={async (email, password) => { await signUp(email, password); router.replace('/'); }} />
        <Pressable onPress={() => router.back()}>
          <Text className="text-brand text-center mt-4 font-semibold">Ya tengo cuenta</Text>
        </Pressable>
      </Card>
    </View>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add login and register screens with validated forms"
```

---

### Task 12: Verify-phone and Onboarding screens

**Files:**
- Create: `features/auth/PhoneForm.tsx`, `features/auth/ProfileForm.tsx`
- Create: `features/auth/__tests__/ProfileForm.test.tsx`
- Create: `app/(auth)/verify-phone.tsx`, `app/(auth)/onboarding.tsx`

- [ ] **Step 1: Write the failing test for ProfileForm**

```tsx
// features/auth/__tests__/ProfileForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileForm } from '@/features/auth/ProfileForm';

describe('ProfileForm', () => {
  it('blocks submit and shows errors when empty', async () => {
    const onSubmit = jest.fn();
    render(<ProfileForm onSubmit={onSubmit} />);
    fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(screen.getByText('El nombre es obligatorio')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits name and city', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<ProfileForm onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByTestId('name-input'), 'Ana Ruiz');
    fireEvent.changeText(screen.getByTestId('city-input'), 'Bogotá');
    fireEvent.press(screen.getByText('Continuar'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ full_name: 'Ana Ruiz', city: 'Bogotá' }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- features/auth/__tests__/ProfileForm.test.tsx`
Expected: FAIL — cannot find module `ProfileForm`.

- [ ] **Step 3: Implement PhoneForm**

```tsx
// features/auth/PhoneForm.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { phoneSchema, type PhoneInput } from '@/features/auth/schemas';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface PhoneFormProps {
  onSubmit: (phone: string) => Promise<void>;
}

export function PhoneForm({ onSubmit }: PhoneFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<PhoneInput>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try { await onSubmit(values.phone); } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error');
    }
  });
  return (
    <View>
      <Controller control={control} name="phone" render={({ field, fieldState }) => (
        <Input label="Celular (10 dígitos)" testID="phone-input" keyboardType="number-pad"
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Enviar código" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
```

- [ ] **Step 4: Implement ProfileForm**

```tsx
// features/auth/ProfileForm.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { profileSchema, type ProfileInput } from '@/features/auth/schemas';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface ProfileFormProps {
  onSubmit: (input: ProfileInput) => Promise<void>;
}

export function ProfileForm({ onSubmit }: ProfileFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', city: '' },
  });
  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try { await onSubmit(values); } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error');
    }
  });
  return (
    <View>
      <Controller control={control} name="full_name" render={({ field, fieldState }) => (
        <Input label="Nombre completo" testID="name-input"
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      <Controller control={control} name="city" render={({ field, fieldState }) => (
        <Input label="Ciudad" testID="city-input"
          value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
      )} />
      {submitError ? <Text className="text-xs text-red-500 mb-2">{submitError}</Text> : null}
      <Button label="Continuar" onPress={submit} loading={formState.isSubmitting} />
    </View>
  );
}
```

- [ ] **Step 5: Run the ProfileForm test to verify it passes**

Run: `npm test -- features/auth/__tests__/ProfileForm.test.tsx`
Expected: PASS (2 assertions).

- [ ] **Step 6: Wire the verify-phone route (two-step: send code, then confirm)**

```tsx
// app/(auth)/verify-phone.tsx
import { useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PhoneForm } from '@/features/auth/PhoneForm';
import { useAuth } from '@/features/auth/useAuth';
import { sendPhoneCode, verifyPhoneCode } from '@/features/auth/actions';

export default function VerifyPhoneScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Verifica tu celular</Text>
      <Card>
        {!phone ? (
          <PhoneForm onSubmit={async (p) => { await sendPhoneCode(p); setPhone(p); }} />
        ) : (
          <View>
            <Input label="Código (dev: 123456)" testID="code-input" keyboardType="number-pad"
              value={code} onChangeText={setCode} error={error ?? undefined} />
            <Button label="Verificar" loading={loading} onPress={async () => {
              if (!session) return;
              setLoading(true); setError(null);
              try {
                await verifyPhoneCode(session.user.id, phone, code);
                await refreshProfile();
                router.replace('/(auth)/onboarding');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Error');
              } finally {
                setLoading(false);
              }
            }} />
          </View>
        )}
      </Card>
    </View>
  );
}
```

- [ ] **Step 7: Wire the onboarding route**

```tsx
// app/(auth)/onboarding.tsx
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { ProfileForm } from '@/features/auth/ProfileForm';
import { useAuth } from '@/features/auth/useAuth';
import { saveProfile } from '@/features/auth/actions';

export default function OnboardingScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  return (
    <View className="flex-1 justify-center px-6">
      <Text className="text-white text-2xl font-extrabold text-center mb-6">Completa tu perfil</Text>
      <Card>
        <ProfileForm onSubmit={async (input) => {
          if (!session) return;
          await saveProfile(session.user.id, input);
          await refreshProfile();
          router.replace('/(tabs)');
        }} />
      </Card>
    </View>
  );
}
```

- [ ] **Step 8: Typecheck (typed routes now fully resolve)**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add verify-phone and onboarding screens"
```

---

### Task 13: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all suites pass — `lib` (utils, env), `features/auth` (schemas, gate, OtpService, AuthProvider, LoginForm, ProfileForm), `components/ui` (primitives). Zero failures.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the bundler builds**

Run: `npx expo start --clear` (Ctrl-C after "Metro waiting").
Expected: bundles with no red errors. (Running on a device/emulator is deferred; live auth needs the Supabase local stack, which is currently down.)

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for scaffold + auth sub-project" --allow-empty
```

---

## Notes for the executor

- **No live backend:** every test mocks `@/lib/supabase`. Do not add tests that hit a real Supabase instance in this sub-project.
- **Email confirmation:** if `signUp` does not return a session (email-confirmation enabled), the gate keeps the user in `(auth)`; on Supabase local the email auto-confirms so a session appears immediately. The route files call `router.replace('/')` after auth actions, letting the gate re-decide — this handles both cases without special-casing.
- **When Docker/Supabase local returns:** put the real anon key + URL from `npx supabase start` into `.env`, run the app on a device/emulator, and manually walk register → verify-phone (code `123456`) → onboarding → tabs.
- **`react-native-linear-gradient`** is installed only to satisfy Moti's optional peer resolution; the app imports `expo-linear-gradient`. If Metro complains about the unused peer, it can be removed.
