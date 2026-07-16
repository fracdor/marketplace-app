# Integración real de SMS (Twilio Verify) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dev-stub `OtpService` with a real Twilio-Verify-backed implementation, reachable through a Supabase Edge Function (never calling Twilio directly from the RN app), selected via an env var — without touching any existing caller of the `OtpService` interface.

**Architecture:** A pure, Deno-and-Node-compatible module (`supabase/functions/_shared/twilioOtp.ts`) contains all real Twilio-calling logic and is unit-tested with Jest. Two thin Deno HTTP wrappers (`supabase/functions/{send-otp,verify-otp}/index.ts`) expose it as Supabase Edge Functions; they are NOT unit-tested in this plan (no Deno runtime on this machine — see "Before you start"). The client gets a new `TwilioOtpService` (in the existing `features/auth/OtpService.ts`) that calls those Edge Functions via `supabase.functions.invoke(...)`, and the exported `otpService` singleton picks `TwilioOtpService` vs. the existing `DevOtpService` based on `process.env.EXPO_PUBLIC_OTP_PROVIDER`. Errors are normalized to a small `OtpErrorCode` enum server-side and mapped to Spanish text by extending the existing `mapAuthError` (not a new function — `PhoneForm.tsx` already calls it).

**Tech Stack:** TypeScript, Deno (Edge Functions runtime, code-only in this plan — not executed here), `@supabase/supabase-js` (`supabase.functions.invoke`), Jest + React Native Testing Library v14 for everything else.

**Spec:** `docs/superpowers/specs/2026-07-16-sms-otp-integration-design.md`

---

## Before you start

- Baseline: **156 tests, 26 suites, `tsc --noEmit` clean** on `main` — verified live 2026-07-16 after the cancel-task merge. Always re-verify live; don't trust this number after other work has landed.
- Every `fireEvent.*` call in every test you write must be `await`ed (`await fireEvent.press(...)`, `await fireEvent.changeText(...)`) — confirmed RNTL v14 + RN 0.86 + React 19 requirement; unawaited calls corrupt `act()` tracking across test boundaries in this exact stack. See `features/auth/__tests__/ProfileForm.test.tsx` for the current correct pattern (note: `features/auth/__tests__/LoginForm.test.tsx` predates this fix and still has unawaited calls — don't copy it, and don't fix it either, it's out of scope for this plan).
- **No Docker, no Deno on this machine.** Tasks 1-5 need neither (Jest/tsc only, against ordinary TypeScript). Task 6 (the Edge Function wrappers) writes real Deno code but explicitly has no test step — don't try to run `deno test`, `deno check`, or `supabase functions serve`; none will work here.
- Run `npm test` and `npx tsc --noEmit` from the repo/worktree root as usual. If another worktree exists under `.claude/worktrees/` or `.worktrees/` when you run `npm test`, add `--testPathIgnorePatterns "/node_modules/|/\.claude/"` or your count will be inflated/wrong.
- `@/*` resolves to the repo root in both `tsconfig.json` (`paths`) and `jest.config.js` (`moduleNameMapper`) — `@/supabase/functions/_shared/twilioOtp` is a valid import path for Task 1's test file, exactly like `@/features/auth/errors` elsewhere.

---

### Task 1: `_shared/twilioOtp.ts` — pure Twilio-calling logic (TDD)

**Files:**
- Create: `supabase/functions/_shared/twilioOtp.ts`
- Create: `supabase/functions/_shared/__tests__/twilioOtp.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/__tests__/twilioOtp.test.ts
import { startVerification, checkVerification } from '@/supabase/functions/_shared/twilioOtp';

const credentials = {
  accountSid: 'AC_test',
  authToken: 'token_test',
  verifyServiceSid: 'VA_test',
};

function mockFetch(status: number, body: unknown = {}) {
  return jest.fn().mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
  });
}

describe('startVerification', () => {
  it('returns sent:true on a 201 response', async () => {
    const fetchImpl = mockFetch(201);
    await expect(startVerification(fetchImpl, credentials, '3001234567')).resolves.toEqual({ sent: true });
  });

  it('maps a 400 response to invalid_phone', async () => {
    const fetchImpl = mockFetch(400);
    await expect(startVerification(fetchImpl, credentials, 'bad')).resolves.toEqual({
      sent: false,
      error: 'invalid_phone',
    });
  });

  it('maps a 429 response to rate_limited', async () => {
    const fetchImpl = mockFetch(429);
    await expect(startVerification(fetchImpl, credentials, '3001234567')).resolves.toEqual({
      sent: false,
      error: 'rate_limited',
    });
  });

  it('maps any other non-201 response to unknown', async () => {
    const fetchImpl = mockFetch(500);
    await expect(startVerification(fetchImpl, credentials, '3001234567')).resolves.toEqual({
      sent: false,
      error: 'unknown',
    });
  });

  it('sends the phone and SMS channel to Twilio with Basic auth', async () => {
    const fetchImpl = mockFetch(201);
    await startVerification(fetchImpl, credentials, '3001234567');
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://verify.twilio.com/v2/Services/VA_test/Verifications');
    expect(options.method).toBe('POST');
    expect(options.body).toBe('To=3001234567&Channel=sms');
    expect(options.headers.Authorization).toBe(`Basic ${btoa('AC_test:token_test')}`);
  });
});

describe('checkVerification', () => {
  it('returns verified:true when Twilio approves the code', async () => {
    const fetchImpl = mockFetch(200, { status: 'approved' });
    await expect(checkVerification(fetchImpl, credentials, '3001234567', '123456')).resolves.toEqual({
      verified: true,
    });
  });

  it('returns invalid_code when Twilio reports a non-approved status', async () => {
    const fetchImpl = mockFetch(200, { status: 'pending' });
    await expect(checkVerification(fetchImpl, credentials, '3001234567', '000000')).resolves.toEqual({
      verified: false,
      error: 'invalid_code',
    });
  });

  it('maps a 404 response to invalid_code (expired/not-found verification)', async () => {
    const fetchImpl = mockFetch(404);
    await expect(checkVerification(fetchImpl, credentials, '3001234567', '123456')).resolves.toEqual({
      verified: false,
      error: 'invalid_code',
    });
  });

  it('maps a 429 response to rate_limited', async () => {
    const fetchImpl = mockFetch(429);
    await expect(checkVerification(fetchImpl, credentials, '3001234567', '123456')).resolves.toEqual({
      verified: false,
      error: 'rate_limited',
    });
  });

  it('maps any other non-200 response to unknown', async () => {
    const fetchImpl = mockFetch(500);
    await expect(checkVerification(fetchImpl, credentials, '3001234567', '123456')).resolves.toEqual({
      verified: false,
      error: 'unknown',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest twilioOtp.test.ts`
Expected: FAIL — `Cannot find module '@/supabase/functions/_shared/twilioOtp'` (file doesn't exist yet).

- [ ] **Step 3: Implement**

```ts
// supabase/functions/_shared/twilioOtp.ts
// Pure module: no Deno-specific imports (Deno.serve/Deno.env), fetch injected
// as a parameter. This lets it be unit-tested with Jest/Node — this project
// has no Deno runtime available. The thin Deno HTTP wrappers that call these
// functions live in ../send-otp/index.ts and ../verify-otp/index.ts and are
// NOT covered by this test suite (see the implementation plan's "Before you
// start" section).
export type OtpErrorCode = 'invalid_phone' | 'rate_limited' | 'invalid_code' | 'unknown';

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
}

type FetchImpl = typeof fetch;

function basicAuthHeader(accountSid: string, authToken: string): string {
  return 'Basic ' + btoa(`${accountSid}:${authToken}`);
}

export async function startVerification(
  fetchImpl: FetchImpl,
  credentials: TwilioCredentials,
  phone: string,
): Promise<{ sent: true } | { sent: false; error: OtpErrorCode }> {
  const { accountSid, authToken, verifyServiceSid } = credentials;
  const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`;
  const body = new URLSearchParams({ To: phone, Channel: 'sms' });
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(accountSid, authToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (response.status === 201) return { sent: true };
  if (response.status === 400) return { sent: false, error: 'invalid_phone' };
  if (response.status === 429) return { sent: false, error: 'rate_limited' };
  return { sent: false, error: 'unknown' };
}

export async function checkVerification(
  fetchImpl: FetchImpl,
  credentials: TwilioCredentials,
  phone: string,
  code: string,
): Promise<{ verified: true } | { verified: false; error: OtpErrorCode }> {
  const { accountSid, authToken, verifyServiceSid } = credentials;
  const url = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/VerificationChecks`;
  const body = new URLSearchParams({ To: phone, Code: code });
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(accountSid, authToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (response.status === 429) return { verified: false, error: 'rate_limited' };
  if (response.status === 404) return { verified: false, error: 'invalid_code' };
  if (response.status !== 200) return { verified: false, error: 'unknown' };
  const data = (await response.json()) as { status?: string };
  if (data.status === 'approved') return { verified: true };
  return { verified: false, error: 'invalid_code' };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest twilioOtp.test.ts`
Expected: PASS, 10/10.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/twilioOtp.ts supabase/functions/_shared/__tests__/twilioOtp.test.ts
git commit -m "feat: add pure Twilio Verify request/response logic"
```

---

### Task 2: Extend `mapAuthError` with OTP error codes (TDD)

**Files:**
- Modify: `features/auth/errors.ts`
- Modify: `features/auth/__tests__/errors.test.ts`

Current `features/auth/errors.ts` (for reference — you are adding 3 lines to `RULES`, nothing else changes):
```ts
const RULES: ReadonlyArray<readonly [string, string]> = [
  ['invalid login credentials', 'Correo o contraseña incorrectos.'],
  ['user already registered', 'Ya existe una cuenta con este correo.'],
  ['email not confirmed', 'Debes confirmar tu correo antes de ingresar.'],
  ['password should be at least', 'La contraseña es demasiado débil.'],
  ['weak password', 'La contraseña es demasiado débil.'],
  ['rate limit', 'Demasiados intentos. Espera un momento e intenta de nuevo.'],
  ['you can only request this after', 'Demasiados intentos. Espera un momento e intenta de nuevo.'],
];
```

- [ ] **Step 1: Write the failing tests**

Add to `features/auth/__tests__/errors.test.ts`, inside the existing `describe('mapAuthError', ...)` block, right before the closing `});`:

```ts
  it('maps invalid_phone', () => {
    expect(mapAuthError('invalid_phone')).toBe('Número de celular inválido.');
  });

  it('maps rate_limited', () => {
    expect(mapAuthError('rate_limited')).toBe(
      'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    );
  });

  it('maps invalid_code', () => {
    expect(mapAuthError('invalid_code')).toBe('Código incorrecto.');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest errors.test.ts`
Expected: FAIL — the 3 new cases return `GENERIC` ("Algo salió mal. Intenta de nuevo.") instead of the specific Spanish text.

- [ ] **Step 3: Implement**

In `features/auth/errors.ts`, add 3 entries to the end of the `RULES` array:

```ts
  ['invalid_phone', 'Número de celular inválido.'],
  ['rate_limited', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
  ['invalid_code', 'Código incorrecto.'],
```

(`unknown` needs no rule — the function's existing `GENERIC` fallback already returns exactly "Algo salió mal. Intenta de nuevo.".)

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest errors.test.ts`
Expected: PASS, 10/10 (7 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add features/auth/errors.ts features/auth/__tests__/errors.test.ts
git commit -m "feat: map OTP error codes to Spanish text in mapAuthError"
```

---

### Task 3: `TwilioOtpService` + env-based `otpService` resolution (TDD)

**Files:**
- Modify: `features/auth/OtpService.ts`
- Modify: `features/auth/__tests__/OtpService.test.ts`
- Modify: `.env.example`

Current `features/auth/OtpService.ts` (full file, for reference):
```ts
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

Current `features/auth/__tests__/OtpService.test.ts` (full file, for reference):
```ts
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

- [ ] **Step 1: Write the failing tests**

Replace the full content of `features/auth/__tests__/OtpService.test.ts`:

```ts
import { DevOtpService } from '@/features/auth/OtpService';

jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

import { supabase } from '@/lib/supabase';
import { TwilioOtpService } from '@/features/auth/OtpService';

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

describe('TwilioOtpService', () => {
  const svc = new TwilioOtpService();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends a code via the send-otp edge function', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { sent: true }, error: null });
    await expect(svc.sendCode('3001234567')).resolves.toEqual({ sent: true });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-otp', { body: { phone: '3001234567' } });
  });

  it('throws the mapped error code when send-otp reports a handled failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { sent: false, error: 'invalid_phone' },
      error: null,
    });
    await expect(svc.sendCode('bad')).rejects.toThrow('invalid_phone');
  });

  it('throws "unknown" when send-otp is unreachable', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: new Error('network') });
    await expect(svc.sendCode('3001234567')).rejects.toThrow('unknown');
  });

  it('verifies a code via the verify-otp edge function', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { verified: true }, error: null });
    await expect(svc.verifyCode('3001234567', '123456')).resolves.toEqual({ verified: true });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('verify-otp', {
      body: { phone: '3001234567', code: '123456' },
    });
  });

  it('throws the mapped error code when verify-otp reports a handled failure', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: { verified: false, error: 'invalid_code' },
      error: null,
    });
    await expect(svc.verifyCode('3001234567', '000000')).rejects.toThrow('invalid_code');
  });

  it('throws "unknown" when verify-otp is unreachable', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: null, error: new Error('network') });
    await expect(svc.verifyCode('3001234567', '123456')).rejects.toThrow('unknown');
  });
});

describe('otpService env-based resolution', () => {
  const ORIGINAL_ENV = process.env.EXPO_PUBLIC_OTP_PROVIDER;

  afterEach(() => {
    process.env.EXPO_PUBLIC_OTP_PROVIDER = ORIGINAL_ENV;
  });

  it('resolves to TwilioOtpService when EXPO_PUBLIC_OTP_PROVIDER=twilio', async () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_OTP_PROVIDER = 'twilio';
    const mod = await import('@/features/auth/OtpService');
    expect(mod.otpService).toBeInstanceOf(mod.TwilioOtpService);
  });

  it('resolves to DevOtpService when EXPO_PUBLIC_OTP_PROVIDER is unset', async () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_OTP_PROVIDER;
    const mod = await import('@/features/auth/OtpService');
    expect(mod.otpService).toBeInstanceOf(mod.DevOtpService);
  });

  it('resolves to DevOtpService for any other value', async () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_OTP_PROVIDER = 'something-else';
    const mod = await import('@/features/auth/OtpService');
    expect(mod.otpService).toBeInstanceOf(mod.DevOtpService);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest OtpService.test.ts`
Expected: FAIL — `TwilioOtpService` doesn't exist yet (`DevOtpService` tests still pass).

- [ ] **Step 3: Implement**

Replace the full content of `features/auth/OtpService.ts`:

```ts
import { supabase } from '@/lib/supabase';

export interface OtpService {
  sendCode(phone: string): Promise<{ sent: boolean }>;
  verifyCode(phone: string, code: string): Promise<{ verified: boolean }>;
}

// Development implementation: no SMS provider wired yet. Accepts a fixed code.
export const DEV_OTP_CODE = '123456';

export class DevOtpService implements OtpService {
  async sendCode(_phone: string): Promise<{ sent: boolean }> {
    return { sent: true };
  }
  async verifyCode(_phone: string, code: string): Promise<{ verified: boolean }> {
    return { verified: code === DEV_OTP_CODE };
  }
}

// Real SMS-backed implementation. Delegates to Supabase Edge Functions
// (send-otp/verify-otp) rather than calling Twilio directly, so the Twilio
// Auth Token never ships inside the RN app bundle. On any failure (Twilio
// rejected the request, or the edge function itself is unreachable) this
// throws rather than resolving with sent:false/verified:false, matching how
// every other mutation in this codebase signals failure.
export class TwilioOtpService implements OtpService {
  async sendCode(phone: string): Promise<{ sent: boolean }> {
    const { data, error } = await supabase.functions.invoke('send-otp', { body: { phone } });
    if (error) throw new Error('unknown');
    if (data?.error) throw new Error(data.error);
    return { sent: true };
  }

  async verifyCode(phone: string, code: string): Promise<{ verified: boolean }> {
    const { data, error } = await supabase.functions.invoke('verify-otp', { body: { phone, code } });
    if (error) throw new Error('unknown');
    if (data?.error) throw new Error(data.error);
    return { verified: true };
  }
}

export const otpService: OtpService =
  process.env.EXPO_PUBLIC_OTP_PROVIDER === 'twilio' ? new TwilioOtpService() : new DevOtpService();
```

Add to `.env.example` (new line):
```
EXPO_PUBLIC_OTP_PROVIDER=dev
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest OtpService.test.ts`
Expected: PASS, 12/12 (3 `DevOtpService` + 6 `TwilioOtpService` + 3 env-resolution).

- [ ] **Step 5: Commit**

```bash
git add features/auth/OtpService.ts features/auth/__tests__/OtpService.test.ts .env.example
git commit -m "feat: add TwilioOtpService and env-based otpService selection"
```

---

### Task 4: `PhoneForm.test.tsx` — new regression test file (no source change)

**Files:**
- Create: `features/auth/__tests__/PhoneForm.test.tsx`

`PhoneForm.tsx` itself does not change in this task — it already calls `mapAuthError(e.message)` in its submit handler (see `features/auth/PhoneForm.tsx:25`), so once Task 2 lands, an `invalid_phone` error thrown by `onSubmit` already surfaces the right Spanish text with zero code changes here. This task only adds the test file that didn't exist before (confirmed by search — there is no `PhoneForm.test.tsx` anywhere in the repo today).

- [ ] **Step 1: Write the tests**

```tsx
// features/auth/__tests__/PhoneForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { PhoneForm } from '@/features/auth/PhoneForm';

describe('PhoneForm', () => {
  it('blocks submit and shows a validation error for an invalid phone', async () => {
    const onSubmit = jest.fn();
    await render(<PhoneForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '123');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByText('Debe ser un celular de 10 dígitos')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid 10-digit phone number', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    await render(<PhoneForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('3001234567'));
  });

  it('shows a mapped Spanish error when onSubmit throws an invalid_phone error', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('invalid_phone'));
    await render(<PhoneForm onSubmit={onSubmit} />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByText('Número de celular inválido.')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `npx jest PhoneForm.test.tsx`
Expected: PASS, 3/3, immediately (no source change needed — this step confirms Task 2's `mapAuthError` rule is correctly wired through `PhoneForm`'s existing, unchanged catch block. If the third test fails, Task 2 didn't actually land correctly — stop and check that first, don't touch `PhoneForm.tsx`).

- [ ] **Step 3: Commit**

```bash
git add features/auth/__tests__/PhoneForm.test.tsx
git commit -m "test: add regression coverage for PhoneForm"
```

---

### Task 5: Wire `verify-phone.tsx` to `mapAuthError`, remove dev-code hint (TDD)

**Files:**
- Modify: `app/(auth)/verify-phone.tsx`
- Create: `app/(auth)/__tests__/verify-phone.test.tsx`

Current `app/(auth)/verify-phone.tsx` (full file, for reference):
```tsx
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
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
            {/* TODO(otp-provider): remove the dev code from this label once OtpService is SMS-backed */}
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
            <Pressable onPress={() => { setPhone(null); setCode(''); setError(null); }}>
              <Text className="text-brand text-center mt-4 font-semibold">Cambiar número</Text>
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );
}
```

- [ ] **Step 1: Write the failing tests**

```tsx
// app/(auth)/__tests__/verify-phone.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import VerifyPhoneScreen from '@/app/(auth)/verify-phone';
import { useAuth } from '@/features/auth/useAuth';
import { sendPhoneCode, verifyPhoneCode } from '@/features/auth/actions';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('@/features/auth/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('@/features/auth/actions', () => ({
  sendPhoneCode: jest.fn(),
  verifyPhoneCode: jest.fn(),
}));

describe('VerifyPhoneScreen', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({
      session: { user: { id: 'u1' } },
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    (sendPhoneCode as jest.Mock).mockResolvedValue({ sent: true });
  });

  it('does not show the dev code hint in the code step', async () => {
    await render(<VerifyPhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByTestId('code-input')).toBeTruthy());
    expect(screen.queryByText('Código (dev: 123456)')).toBeNull();
    expect(screen.getByText('Código')).toBeTruthy();
  });

  it('shows a mapped Spanish error when verification fails', async () => {
    (verifyPhoneCode as jest.Mock).mockRejectedValue(new Error('invalid_code'));
    await render(<VerifyPhoneScreen />);
    await fireEvent.changeText(screen.getByTestId('phone-input'), '3001234567');
    await fireEvent.press(screen.getByText('Enviar código'));
    await waitFor(() => expect(screen.getByTestId('code-input')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('code-input'), '000000');
    await fireEvent.press(screen.getByText('Verificar'));
    await waitFor(() => expect(screen.getByText('Código incorrecto.')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest verify-phone.test.tsx`
Expected: FAIL — both tests fail (the label still says "Código (dev: 123456)", and the error path still shows the raw `Error` message "invalid_code" instead of "Código incorrecto.").

- [ ] **Step 3: Implement**

In `app/(auth)/verify-phone.tsx`:
1. Add `import { mapAuthError } from '@/features/auth/errors';`.
2. Remove the `{/* TODO(otp-provider): ... */}` comment and change the `Input`'s `label` prop from `"Código (dev: 123456)"` to `"Código"`.
3. Change the catch block from `setError(e instanceof Error ? e.message : 'Error');` to `setError(e instanceof Error ? mapAuthError(e.message) : 'Error');`.

Full resulting file:

```tsx
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { PhoneForm } from '@/features/auth/PhoneForm';
import { useAuth } from '@/features/auth/useAuth';
import { mapAuthError } from '@/features/auth/errors';
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
            <Input label="Código" testID="code-input" keyboardType="number-pad"
              value={code} onChangeText={setCode} error={error ?? undefined} />
            <Button label="Verificar" loading={loading} onPress={async () => {
              if (!session) return;
              setLoading(true); setError(null);
              try {
                await verifyPhoneCode(session.user.id, phone, code);
                await refreshProfile();
                router.replace('/(auth)/onboarding');
              } catch (e) {
                setError(e instanceof Error ? mapAuthError(e.message) : 'Error');
              } finally {
                setLoading(false);
              }
            }} />
            <Pressable onPress={() => { setPhone(null); setCode(''); setError(null); }}>
              <Text className="text-brand text-center mt-4 font-semibold">Cambiar número</Text>
            </Pressable>
          </View>
        )}
      </Card>
    </View>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest verify-phone.test.tsx`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/verify-phone.tsx app/\(auth\)/__tests__/verify-phone.test.tsx
git commit -m "feat: wire verify-phone screen to mapAuthError, remove dev-code hint"
```

---

### Task 6: Edge Function wrappers (Deno, no test — see "Before you start")

**CRITICAL CONTRACT — do not deviate:** these wrappers must always respond with HTTP 200 (never a non-2xx status), whether the result is a success OR a handled Twilio failure. The client (`TwilioOtpService`, Task 3, already merged) only reads the specific `OtpErrorCode` from the **response body** (`data.error`), because `supabase.functions.invoke()` does NOT parse a non-2xx response's body into `data` — it stashes it on `error.context` instead (confirmed by tracing `functions-js` source during Task 3's code-quality review) and `TwilioOtpService` falls back to a generic `throw new Error('unknown')` for any `error`. If a future edit "improves" this by returning e.g. `Response(..., {status: 400})` for `invalid_phone`, every specific error message silently degrades to "Algo salió mal" — a real, easy-to-introduce regression. The code below already returns a plain 200 via `new Response(JSON.stringify(result), {...})` with no `status` override (defaults to 200) — **keep it that way**, don't add status-code branching.

**Files:**
- Create: `supabase/functions/send-otp/index.ts`
- Create: `supabase/functions/verify-otp/index.ts`
- Modify: `tsconfig.json`

This task has no TDD loop. `send-otp`/`verify-otp` are thin Deno HTTP handlers with no Deno runtime available on this machine to test them against (see "Before you start" — the real logic they call, `_shared/twilioOtp.ts`, is already fully tested from Task 1). This is implementation-only, deferred-verification code, exactly as scoped in the design spec.

- [ ] **Step 1: Write `supabase/functions/send-otp/index.ts`**

```ts
// supabase/functions/send-otp/index.ts
// Thin Deno HTTP wrapper — untested here (no Deno runtime on this machine).
// All real logic lives in ../_shared/twilioOtp.ts, which IS unit-tested.
// Requires an authenticated Supabase JWT by default (verify_jwt not disabled),
// so an anonymous caller can't trigger SMS sends at the project owner's expense.
import { startVerification } from '../_shared/twilioOtp.ts';

Deno.serve(async (req: Request) => {
  const { phone } = await req.json();
  const result = await startVerification(
    fetch,
    {
      accountSid: Deno.env.get('TWILIO_ACCOUNT_SID')!,
      authToken: Deno.env.get('TWILIO_AUTH_TOKEN')!,
      verifyServiceSid: Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!,
    },
    phone,
  );
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Write `supabase/functions/verify-otp/index.ts`**

```ts
// supabase/functions/verify-otp/index.ts
// Thin Deno HTTP wrapper — untested here (no Deno runtime on this machine).
// All real logic lives in ../_shared/twilioOtp.ts, which IS unit-tested.
import { checkVerification } from '../_shared/twilioOtp.ts';

Deno.serve(async (req: Request) => {
  const { phone, code } = await req.json();
  const result = await checkVerification(
    fetch,
    {
      accountSid: Deno.env.get('TWILIO_ACCOUNT_SID')!,
      authToken: Deno.env.get('TWILIO_AUTH_TOKEN')!,
      verifyServiceSid: Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!,
    },
    phone,
    code,
  );
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 3: Exclude the two wrapper files from the app's `tsc --noEmit`**

These files reference `Deno.serve`/`Deno.env`, which don't exist as types in this project's Node/RN TypeScript setup (`tsconfig.json`'s `include` is `**/*.ts`, so without this exclude, `tsc --noEmit` would fail with `Cannot find name 'Deno'`). `_shared/twilioOtp.ts` has no Deno-specific code, so it stays included/type-checked normally.

Current `tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "types": ["jest"],
    "ignoreDeprecations": "6.0"
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "nativewind-env.d.ts"
  ]
}
```

Add an `exclude` key (new, alongside `include`):

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "types": ["jest"],
    "ignoreDeprecations": "6.0"
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "nativewind-env.d.ts"
  ],
  "exclude": [
    "supabase/functions/send-otp/**/*.ts",
    "supabase/functions/verify-otp/**/*.ts"
  ]
}
```

- [ ] **Step 4: Verify `tsc --noEmit` is clean and the full suite is unaffected**

Run: `npx tsc --noEmit`
Expected: clean, zero errors (confirms the exclude actually suppresses the `Deno`-not-found errors — if it doesn't, double check the glob patterns match the actual file paths).

Run: `npx jest`
Expected: same total as after Task 5 — these two new files aren't tests and aren't imported by any test, so the count must not change.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-otp/index.ts supabase/functions/verify-otp/index.ts tsconfig.json
git commit -m "feat: add send-otp/verify-otp Edge Function wrappers"
```

---

### Task 7: Final verification

- [ ] Run the full suite: `npm test` (or `npx jest --testPathIgnorePatterns "/node_modules/|/\.claude/"` if another worktree exists under `.claude/worktrees/`). Expected: all green. Compute the actual total live — don't assume arithmetic from the per-task counts above (10 + 3 + 12 + 3 + 2 = 30 new assertions is the estimate; 156 + 30 = 186 baseline+delta, but always trust the live number).
- [ ] Run `npx tsc --noEmit`. Expected: clean, zero errors (confirms Task 6's `exclude` works and nothing else broke).
- [ ] Confirm (by reading the two files) that `supabase/functions/send-otp/index.ts` and `verify-otp/index.ts` still exist and are syntactically what Task 6 wrote — these have no automated check, so a manual read is the only verification available in this environment.
- [ ] Commit: `git commit --allow-empty -m "chore: final verification for SMS OTP integration sub-project"` with a message body noting the live test count, `tsc` status, and that the Edge Function wrappers + live Twilio calls remain unverified pending Docker + real Twilio credentials (per the design spec's explicit deferral).

**Not done in this plan, deferred until Docker is fixed and the user has supplied real Twilio credentials (`supabase secrets set ...`):** running `supabase functions serve` locally, any real HTTP call to Twilio's API, and end-to-end testing of the phone-verification flow against a real phone number.
