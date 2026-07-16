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

  it('resolves to TwilioOtpService when EXPO_PUBLIC_OTP_PROVIDER=twilio', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_OTP_PROVIDER = 'twilio';
    const mod = require('@/features/auth/OtpService');
    expect(mod.otpService).toBeInstanceOf(mod.TwilioOtpService);
  });

  it('resolves to DevOtpService when EXPO_PUBLIC_OTP_PROVIDER is unset', () => {
    jest.resetModules();
    delete process.env.EXPO_PUBLIC_OTP_PROVIDER;
    const mod = require('@/features/auth/OtpService');
    expect(mod.otpService).toBeInstanceOf(mod.DevOtpService);
  });

  it('resolves to DevOtpService for any other value', () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_OTP_PROVIDER = 'something-else';
    const mod = require('@/features/auth/OtpService');
    expect(mod.otpService).toBeInstanceOf(mod.DevOtpService);
  });
});
