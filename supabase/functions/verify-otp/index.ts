// supabase/functions/verify-otp/index.ts
// Thin Deno HTTP wrapper — untested here (no Deno runtime on this machine).
// All real logic lives in ../_shared/twilioOtp.ts, which IS unit-tested.
//
// Always responds HTTP 200, success or handled failure alike — see send-otp's
// comment (same contract, same rationale).
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
