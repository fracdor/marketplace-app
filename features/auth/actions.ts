import { supabase } from '@/lib/supabase';
import { otpService } from '@/features/auth/OtpService';
import type { Profile } from '@/features/auth/types';

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function sendPhoneCode(phone: string) {
  return otpService.sendCode(phone);
}

export async function verifyPhoneCode(userId: string, phone: string, code: string) {
  const { verified } = await otpService.verifyCode(phone, code);
  if (!verified) throw new Error('Código incorrecto');
  const { error } = await supabase
    .from('profiles')
    .update({ phone, phone_verified: true })
    .eq('id', userId);
  if (error) throw error;
}

export async function saveProfile(userId: string, input: Pick<Profile, 'full_name' | 'city'>) {
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: input.full_name, city: input.city })
    .eq('id', userId);
  if (error) throw error;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data as Profile;
}
