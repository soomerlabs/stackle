// SUPABASE CLIENT — the whole backend hangs off two env strings. Absent →
// isConfigured() false and every caller falls back to the local stubs: the
// app NEVER depends on the network to function (local-first law).
//   .env:  EXPO_PUBLIC_SUPABASE_URL=…  EXPO_PUBLIC_SUPABASE_ANON_KEY=…
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import engine from '@sworbl/engine';
import { installNetLog } from './net-log';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isConfigured(): boolean {
  return URL.length > 0 && KEY.length > 0;
}

// THE KEYCHAIN (owner: identity must survive reinstall) — the auth session
// lives in expo-secure-store on native: iOS Keychain entries persist
// through app deletion, so a reinstall signs back into the SAME anonymous
// user. Web (and any secure-store failure) falls back to the engine store.
// One-time migration lifts a legacy MMKV session into the keychain.
// NO react-native import here (the Node test runner loads this module —
// RN's flow-typed entry kills esbuild): web is sniffed by document, and
// the require is guarded so Node lands on the engine-store fallback.
const SecureStore = (() => {
  if (typeof document !== 'undefined') return null; // web
  try {
    // (require: deliberate lazy load)
    return require('expo-secure-store');
  } catch {
    return null; // Node tests / anywhere the native module is absent
  }
})();

const storageAdapter = {
  getItem: async (k: string): Promise<string | null> => {
    if (SecureStore) {
      try {
        const v = await SecureStore.getItemAsync(k);
        if (v != null) return v;
        // MIGRATION: a session saved by the pre-keychain builds lives in
        // MMKV — lift it into the keychain once, then forget the old copy
        const legacy = engine.store.getJSON(k, null) as string | null;
        if (legacy != null) {
          await SecureStore.setItemAsync(k, legacy);
          engine.store.remove(k);
          return legacy;
        }
        return null;
      } catch {
        // keychain unavailable (simulator quirks etc.) → engine store
      }
    }
    return engine.store.getJSON(k, null) as string | null;
  },
  setItem: async (k: string, v: string) => {
    if (SecureStore) {
      try {
        await SecureStore.setItemAsync(k, v);
        return;
      } catch {}
    }
    engine.store.setJSON(k, v);
  },
  removeItem: async (k: string) => {
    if (SecureStore) {
      try {
        await SecureStore.deleteItemAsync(k);
      } catch {}
    }
    engine.store.remove(k);
  },
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!isConfigured()) return null;
  if (!client) {
    installNetLog(URL); // dev-only inside — the debug menu's network log
    client = createClient(URL, KEY, {
      auth: {
        storage: storageAdapter,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

// anonymous identity: sign in once, upsert the player row with the local
// name. Fire-and-forget from boot; failures are silent (local-first).
// USERNAMES ARE UNIQUE (schema v5, owner: "username is what games do") —
// a collision on a MINTED default remints and retries once; a collision
// on a chosen name is surfaced through renamePlayer instead.
export async function ensurePlayer(name: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    let { data } = await sb.auth.getSession();
    if (!data.session) {
      const res = await sb.auth.signInAnonymously();
      if (res.error) return null;
      data = { session: res.data.session };
    }
    const uid = data.session?.user.id ?? null;
    if (uid) {
      const { error } = await sb.from('players').upsert({ id: uid, name }, { onConflict: 'id' });
      if (error && `${error.code}` === '23505' && /^PLAYER\d{4}$/.test(name)) {
        // minted default collided — remint locally and try once more
        // (require: deliberate lazy load)
        const { remintPlayerName } = require('@/game/player');
        const fresh = remintPlayerName();
        await sb.from('players').upsert({ id: uid, name: fresh }, { onConflict: 'id' });
      }
    }
    return uid;
  } catch {
    return null;
  }
}

// the rename path with an honest verdict — 'taken' feeds the profile toast
export async function renamePlayer(name: string): Promise<'ok' | 'taken' | 'error'> {
  const sb = supabase();
  if (!sb) return 'ok'; // offline/unconfigured: local-first, server catches up at boot
  try {
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return 'error';
    const { error } = await sb.from('players').upsert({ id: uid, name }, { onConflict: 'id' });
    if (!error) return 'ok';
    return `${error.code}` === '23505' ? 'taken' : 'error';
  } catch {
    return 'error';
  }
}
