// Pure module: no Deno-specific imports (Deno.serve/Deno.env), fetch injected
// as a parameter. This lets it be unit-tested with Jest/Node — this project
// has no Deno runtime available. The thin Deno HTTP wrappers that call these
// functions live in ../send-otp/index.ts and ../verify-otp/index.ts and are
// NOT covered by this test suite (a later task in this sub-project).
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
