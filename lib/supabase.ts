import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
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
    if (Number.isNaN(count)) return null; // malformed marker → treat as absent
    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      value += part;
    }
    return value;
  },
  async setItem(key, value) {
    // Read the existing marker so we can delete any now-unused chunks when the
    // value shrinks (Supabase session tokens change size on every refresh, so
    // chunked -> bare and N-chunks -> M-chunks are the normal steady state).
    const existingMeta = await SecureStore.getItemAsync(key);
    const existingCount = existingMeta?.startsWith('__chunks__:')
      ? parseInt(existingMeta.slice('__chunks__:'.length), 10) || 0
      : 0;

    const newCount = value.length <= CHUNK_SIZE ? 0 : Math.ceil(value.length / CHUNK_SIZE);

    if (newCount === 0) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await SecureStore.setItemAsync(key, `__chunks__:${newCount}`);
      for (let i = 0; i < newCount; i++) {
        await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
      }
    }
    // Delete stale higher-index chunks left over from a previous, larger value.
    for (let i = newCount; i < existingCount; i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
  },
  async removeItem(key) {
    const meta = await SecureStore.getItemAsync(key);
    if (meta?.startsWith('__chunks__:')) {
      const count = parseInt(meta.slice('__chunks__:'.length), 10) || 0;
      for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
