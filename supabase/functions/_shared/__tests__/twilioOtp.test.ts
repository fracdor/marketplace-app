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
