export interface OtpService {
  sendCode(phone: string): Promise<{ sent: boolean }>;
  verifyCode(phone: string, code: string): Promise<{ verified: boolean }>;
}

// Development implementation: no SMS provider wired yet. Accepts a fixed code.
// Swap for a Supabase-phone-auth / Twilio-backed impl later without touching callers.
export const DEV_OTP_CODE = '123456';

export class DevOtpService implements OtpService {
  async sendCode(_phone: string): Promise<{ sent: boolean }> {
    return { sent: true };
  }
  async verifyCode(_phone: string, code: string): Promise<{ verified: boolean }> {
    return { verified: code === DEV_OTP_CODE };
  }
}

export const otpService: OtpService = new DevOtpService();
