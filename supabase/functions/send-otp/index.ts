// supabase/functions/send-otp/index.ts
// Thin Deno HTTP wrapper, live-verified via `supabase functions serve` +
// curl on 2026-07-16. All real logic lives in ../_shared/twilioOtp.ts,
// which is unit-tested with Jest.
// Requires an authenticated Supabase JWT by default (verify_jwt not disabled),
// so an anonymous caller can't trigger SMS sends at the project owner's expense
// — confirmed live: a request with no Authorization header gets a 401 before
// this handler ever runs.
//
// Always responds HTTP 200, success or handled failure alike — the client
// (TwilioOtpService) reads the specific OtpErrorCode from the response BODY,
// not the HTTP status. See the implementation plan's Task 6 note for why.
import { startVerification } from '../_shared/twilioOtp.ts';

Deno.serve(async (req: Request) => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifyServiceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  // Fail fast on a misconfigured deploy rather than letting an `undefined`
  // credential reach Twilio, where it comes back as a 400/404 that
  // twilioOtp.ts would otherwise map to a misleading invalid_phone/
  // invalid_code — live-confirmed happening (a missing verifyServiceSid
  // produced a 404 from Twilio that looked exactly like "wrong code").
  if (!accountSid || !authToken || !verifyServiceSid) {
    console.error('send-otp: missing one or more TWILIO_* secrets');
    return new Response(JSON.stringify({ sent: false, error: 'unknown' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { phone } = await req.json();
  const result = await startVerification(fetch, { accountSid, authToken, verifyServiceSid }, phone);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
