// SAFETY RAILS (App Store 1.2 / 5.1.1) — report a player, delete your
// account. Both are honest about failure: the UI needs a real verdict,
// never a silent no-op.
import engine from '@sworbl/engine';
import { supabase } from './supabase';

// report a name off a leaderboard (write-only table; reviewed in the
// dashboard). context = where it was seen ('daily' | 'alltime' | seed).
export async function reportPlayer(name: string, context: string): Promise<boolean> {
  const sb = supabase();
  if (!sb) return false;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id;
    if (!uid) return false;
    const { error } = await sb.from('reports').insert({
      reporter: uid,
      reported_name: name.slice(0, 24),
      context: context.slice(0, 64),
    });
    return !error;
  } catch {
    return false;
  }
}

// the whole account, gone: server first (auth user cascades through every
// table), then the local store — the app reboots into a fresh identity.
export async function deleteAccount(): Promise<boolean> {
  const sb = supabase();
  if (!sb) return false;
  try {
    const { data, error } = await sb.functions.invoke('delete-account', { body: {} });
    if (error || !data?.ok) return false;
    await sb.auth.signOut().catch(() => {});
    // local wipe: every key goes — scores, name, outbox, session remnants.
    // The next boot mints a fresh anonymous player.
    for (const k of engine.store.keys()) engine.store.remove(k);
    return true;
  } catch {
    return false;
  }
}
