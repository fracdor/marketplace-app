// features/auth/__tests__/actions.test.ts
import { verifyPhoneCode } from '@/features/auth/actions';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('@/features/auth/OtpService', () => ({
  otpService: { verifyCode: jest.fn() },
}));

import { supabase } from '@/lib/supabase';
import { otpService } from '@/features/auth/OtpService';

describe('verifyPhoneCode', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws the invalid_code machine code (not a pre-translated Spanish string) when the code is wrong', async () => {
    (otpService.verifyCode as jest.Mock).mockResolvedValue({ verified: false });
    await expect(verifyPhoneCode('u1', '3001234567', '000000')).rejects.toThrow('invalid_code');
  });

  it('updates the profile as phone_verified when the code is correct', async () => {
    (otpService.verifyCode as jest.Mock).mockResolvedValue({ verified: true });
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn(() => ({ eq }));
    (supabase.from as jest.Mock).mockReturnValue({ update });
    await verifyPhoneCode('u1', '3001234567', '123456');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(update).toHaveBeenCalledWith({ phone: '3001234567', phone_verified: true });
    expect(eq).toHaveBeenCalledWith('id', 'u1');
  });
});
