// supabase/functions/send-otp/index.ts
// Thin Deno HTTP wrapper — untested here (no Deno runtime on this machine).
// All real logic lives in ../_shared/twilioOtp.ts, which IS unit-tested.
// Requires an authenticated Supabase JWT by default (verify_jwt not disabled),
// so an anonymous caller can't trigger SMS sends at the project owner's expense.
//
// Always responds HTTP 200, success or handled failure alike — the client
// (TwilioOtpService) reads the specific OtpErrorCode from the response BODY,
// not the HTTP status. See the implementation plan's Task 6 note for why.
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
