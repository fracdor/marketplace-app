// supabase/functions/verify-otp/index.ts
// Thin Deno HTTP wrapper, live-verified via `supabase functions serve` +
// curl on 2026-07-16. All real logic lives in ../_shared/twilioOtp.ts,
// which is unit-tested with Jest.
//
// Always responds HTTP 200, success or handled failure alike — see send-otp's
// comment (same contract, same rationale).
import { checkVerification } from '../_shared/twilioOtp.ts';

Deno.serve(async (req: Request) => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  // Fail fast — see send-otp's identical guard for why (live-confirmed a
  // missing verifyServiceSid otherwise surfaces as a misleading invalid_code).
  if (!accountSid || !authToken || !verifyServiceSid) {
    console.error('verify-otp: missing one or more TWILIO_* secrets');
    return new Response(JSON.stringify({ verified: false, error: 'unknown' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { phone, code } = await req.json();
  const result = await checkVerification(fetch, { accountSid, authToken, verifyServiceSid }, phone, code);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
