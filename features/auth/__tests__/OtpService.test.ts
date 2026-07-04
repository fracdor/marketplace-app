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
