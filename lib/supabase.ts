import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';

const env = getEnv();

// SecureStore has a ~2KB per-value limit. Supabase sessions can exceed it,
// so we chunk large values across numbered keys.
const CHUNK_SIZE = 2000;

const SecureStoreAdapter: SupportedStorage = {
  async getItem(key) {
    const meta = await SecureStore.getItemAsync(key);
    if (meta === null) return null;
    if (!meta.startsWith('__chunks__:')) return meta;
    const count = parseInt(meta.slice('__chunks__:'.length), 10);
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(key, value) {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(key, `__chunks__:${count}`);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },
  async removeItem(key) {
    const meta = await SecureStore.getItemAsync(key);
    if (meta?.startsWith('__chunks__:')) {
      const count = parseInt(meta.slice('__chunks__:'.length), 10);
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
