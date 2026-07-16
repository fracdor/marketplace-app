# Integración real de SMS (Twilio Verify) — Design Spec

**Goal:** Replace the dev-stub `OtpService` (fixed code `123456`) with a real SMS-backed implementation using Twilio Verify, without touching any existing caller of the `OtpService` interface. Full live/E2E verification is deferred until Docker (needed for `supabase functions serve` and Twilio credentials) is available — this sub-project ships implementation + TDD-with-mocks only.

**Why now:** Both remaining roadmap items (this one, and migrating types to `supabase gen types`) are blocked on Docker being down on this machine. This sub-project is scoped so the parts that don't strictly require Docker (writing the Edge Functions' logic, the new `OtpService` implementation, error mapping, UI text) can be built and TDD'd now; only the Deno HTTP wrapper and true end-to-end Twilio calls are deferred.

**Provider:** Twilio Verify (chosen over a generic SMS API + self-managed code storage — Verify handles expiration/retries/state on Twilio's side, reducing our own code surface).

## Architecture

- **`supabase/functions/_shared/twilioOtp.ts`** — pure TypeScript module, no Deno-specific imports, `fetch` injected as a parameter. Exports two functions:
  - `startVerification(fetchImpl, credentials, phone): Promise<{ sent: true } | { sent: false; error: OtpErrorCode }>` — calls Twilio's `POST /v2/Services/{SID}/Verifications` with `Channel: sms`.
  - `checkVerification(fetchImpl, credentials, phone, code): Promise<{ verified: true } | { verified: false; error: OtpErrorCode }>` — calls Twilio's `POST /v2/Services/{SID}/VerificationChecks`.
  - `OtpErrorCode = 'invalid_phone' | 'rate_limited' | 'invalid_code' | 'unknown'` — Twilio's raw error codes/messages are parsed and normalized to this enum inside this module, so callers (and the client) never need to know Twilio's specific error shape. If Twilio changes error codes, only this file changes.
  - `credentials = { accountSid: string; authToken: string; verifyServiceSid: string }`, passed in by the caller (read from `Deno.env` in the Edge Function, never hardcoded).
- **`supabase/functions/send-otp/index.ts`** / **`supabase/functions/verify-otp/index.ts`** — thin Deno HTTP handlers. Parse the request body, read the three Twilio secrets from `Deno.env.get(...)`, call the corresponding pure function from `_shared/twilioOtp.ts` with the global `fetch`, return the result as JSON. Require an authenticated Supabase JWT (default Edge Function behavior, `verify_jwt` not disabled) so an anonymous caller can't trigger SMS sends at the project owner's expense.
- **`features/auth/OtpService.ts`** — gains `TwilioOtpService implements OtpService`, calling `supabase.functions.invoke('send-otp', { body: { phone } })` / `invoke('verify-otp', { body: { phone, code } })`. On success, returns `{ sent: true }` / `{ verified: true }` (matching the interface). On any failure (Twilio rejected the request, network error, edge function unreachable), it **throws** `new Error(code)` rather than ever resolving with `sent: false`/`verified: false` — consistent with how every other mutation in this codebase signals failure (throw, caught by the UI layer). `code` is one of the `OtpErrorCode` string values, for `mapAuthError` to translate.
  - The exported `otpService` singleton is resolved once at module load based on `process.env.EXPO_PUBLIC_OTP_PROVIDER`: `'twilio'` → `new TwilioOtpService()`, anything else (including unset) → `new DevOtpService()` (current default, unchanged).
- **Error mapping** — reuses the existing `mapAuthError(message: string): string` in `features/auth/errors.ts` rather than introducing a parallel function. `PhoneForm.tsx` (used for the phone-entry step, i.e. `sendCode` failures) already calls `mapAuthError(e.message)` in its submit handler — extending the one existing function means that call site needs no change at all. `mapAuthError`'s `RULES` array (ordered `[needle, spanish]` substring pairs, case-insensitive) gains three new entries using the exact `OtpErrorCode` enum strings as needles (chosen deliberately distinct from existing English-phrase needles, so there's no ambiguity/collision):
  - `['invalid_phone', 'Número de celular inválido.']`
  - `['rate_limited', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.']`
  - `['invalid_code', 'Código incorrecto.']`
  - `unknown` (or any unrecognized error) needs no new rule — `mapAuthError`'s existing `GENERIC` fallback ("Algo salió mal. Intenta de nuevo.") already is the intended text.
  - `TwilioOtpService` throws `new Error(code)` for `sendCode`/`verifyCode` failures, where `code` is one of the `OtpErrorCode` string values — that message flows straight into `mapAuthError`.
- **`app/(auth)/verify-phone.tsx`** — remove the `(dev: 123456)` hint from the code input's label (the `TODO(otp-provider)` comment already marks this spot); its code-verification catch block currently shows the raw `e.message` with no mapping at all (`setError(e instanceof Error ? e.message : 'Error')`) — change it to `mapAuthError(e.message)`, matching every other mutation call site in the codebase (this was already a pre-existing gap, now closed as part of this pass). No resend-button/cooldown UI in this pass (deferred, YAGNI — not asked for, adds scope).
- **`.env.example`** — add `EXPO_PUBLIC_OTP_PROVIDER=dev`.

## Data flow

1. `verify-phone.tsx` → `sendPhoneCode(phone)` (unchanged, `features/auth/actions.ts`) → `otpService.sendCode(phone)` → if Twilio-backed: `supabase.functions.invoke('send-otp', { body: { phone } })` → Edge Function → `startVerification` → Twilio Verify starts a verification → `{ sent: boolean }` bubbles back up.
2. User enters the code → `verifyPhoneCode(userId, phone, code)` (unchanged) → `otpService.verifyCode(phone, code)` → if Twilio-backed: `invoke('verify-otp', { body: { phone, code } })` → Edge Function → `checkVerification` → Twilio Verify checks the code → `{ verified: boolean }` bubbles back up.
3. If `verified`, `actions.ts` updates `profiles.phone_verified = true` for the current user **exactly as it does today** — no change to this step, still protected by the existing RLS policy on `profiles` (row must belong to `auth.uid()`).

## Error handling

Twilio-specific error interpretation is isolated inside `_shared/twilioOtp.ts` (server-side, one place to update if Twilio's error codes change). The client only ever sees the small `OtpErrorCode` enum, mapped to Spanish text at the UI layer — same separation-of-concerns already used for Supabase auth errors via `mapAuthError`.

## Testing

- `_shared/twilioOtp.ts`: TDD'd with Jest, `fetch` mocked — covers the happy path (send/verify success) and each `OtpErrorCode` branch (simulating Twilio's error response shapes).
- `TwilioOtpService` (`features/auth/OtpService.ts`): TDD'd with Jest, `supabase.functions.invoke` mocked (matches the existing `@/lib/supabase` mocking convention used throughout the codebase).
- `otpService` env-based resolution: a small test confirming `EXPO_PUBLIC_OTP_PROVIDER=twilio` resolves to `TwilioOtpService` and any other value (including unset) resolves to `DevOtpService`.
- `mapAuthError` (`features/auth/errors.ts`): 3 new test cases for the `invalid_phone`/`rate_limited`/`invalid_code` rules (existing test file, existing function — no new file).
- `verify-phone.tsx` and `PhoneForm.tsx`: **neither has a test file today** (verified by search — this was inaccurately described as "existing tests" in an earlier draft of this spec). Both gain new test files as part of this sub-project: `verify-phone.test.tsx` covering the removed dev-code hint and the code-verification catch block now using `mapAuthError`; `PhoneForm.test.tsx` covering its existing submit/validation behavior plus a case confirming a thrown `'invalid_phone'` error surfaces "Número de celular inválido." end-to-end.
- **Explicitly deferred, not part of this sub-project's TDD:** the Deno HTTP wrapper (`send-otp/index.ts`, `verify-otp/index.ts`) — thin, low-risk (parse body, read 3 env vars, call the already-tested pure function, return JSON) — and any true end-to-end call to Twilio. Both require Docker (`supabase functions serve`) and real Twilio credentials, neither available right now. Verified later, once Docker is fixed and the user has supplied real credentials via `supabase secrets set`.

## Prerequisites (user, outside Claude's scope)

- Create a Twilio account and a Verify Service.
- Obtain `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
- Set them as Supabase secrets (`supabase secrets set ...`) once Docker/the project's Supabase instance is available.

Claude cannot create third-party accounts on the user's behalf; the code is written to work correctly once real credentials are supplied, but cannot be exercised against the real Twilio API in this sub-project.

## Out of scope

- Resend-code button / cooldown UI (not requested; deferred to a later pass).
- Storing/managing OTP codes ourselves (Twilio Verify owns this).
- Any change to `profiles.phone_verified` update logic (stays exactly as-is, client-side, RLS-protected).
- Deno-based testing of the Edge Function wrappers (deferred until Docker is fixed — see Testing section).
- Live/E2E verification against real Twilio (deferred, same reason).
