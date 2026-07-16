import { supabase } from '@/lib/supabase';

export interface OtpService {
  sendCode(phone: string): Promise<{ sent: boolean }>;
  verifyCode(phone: string, code: string): Promise<{ verified: boolean }>;
}

// Development implementation: no SMS provider wired yet. Accepts a fixed code.
export const DEV_OTP_CODE = '123456';

export class DevOtpService implements OtpService {
  async sendCode(_phone: string): Promise<{ sent: boolean }> {
    return { sent: true };
  }
  async verifyCode(_phone: string, code: string): Promise<{ verified: boolean }> {
    return { verified: code === DEV_OTP_CODE };
  }
}

// Real SMS-backed implementation. Delegates to Supabase Edge Functions
// (send-otp/verify-otp) rather than calling Twilio directly, so the Twilio
// Auth Token never ships inside the RN app bundle. On any failure (Twilio
// rejected the request, or the edge function itself is unreachable) this
// throws rather than resolving with sent:false/verified:false, matching how
// every other mutation in this codebase signals failure.
export class TwilioOtpService implements OtpService {
  async sendCode(phone: string): Promise<{ sent: boolean }> {
    const { data, error } = await supabase.functions.invoke('send-otp', { body: { phone } });
    if (error) throw new Error('unknown');
    if (data?.error) throw new Error(data.error);
    return { sent: true };
  }

  async verifyCode(phone: string, code: string): Promise<{ verified: boolean }> {
    const { data, error } = await supabase.functions.invoke('verify-otp', { body: { phone, code } });
    if (error) throw new Error('unknown');
    if (data?.error) throw new Error(data.error);
    return { verified: true };
  }
}

export const otpService: OtpService =
  process.env.EXPO_PUBLIC_OTP_PROVIDER === 'twilio' ? new TwilioOtpService() : new DevOtpService();
