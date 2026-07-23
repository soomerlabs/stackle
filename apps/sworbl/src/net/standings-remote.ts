// REMOTE STANDINGS + THE OUTBOX — stale-while-revalidate over the stubs
// (the fossil's loadHomeLb pattern: local renders NOW, remote swaps in),
// and an offline-resilient submission queue: finishDay enqueues, the outbox
// drains on boot/foreground/close. No network → everything stays local.
import engine from '@sworbl/engine';
import { supabase, isConfigured, ensurePlayer } from './supabase';
import { getPlayerName } from '@/game/player';
import { type LbEntry } from '@/game/standings';
import { type BestWord, type SworbState } from '@/game/persist';

const OUTBOX_KEY = 'sworbl_rn_outbox';
const CACHE_KEY = 'sworbl_rn_lb_cache_'; // + day | 'alltime'

export interface RemoteField {
  entries: LbEntry[];
  me: { rank: number; score: number } | null;
}

// ---- fetch (cache-backed) ----
export async function fetchDaily(dayKey: string): Promise<RemoteField | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id ?? null;
    const { data, error } = await sb
      .from('daily_standings')
      .select('name, score, solved, rank, player_id')
      .eq('day', dayKey)
      .order('rank', { ascending: true })
      .limit(100);
    if (error || !data) return readCache(dayKey);
    const entries: LbEntry[] = data.map((r) => ({
      name: String(r.name),
      score: Number(r.score),
      solved: !!r.solved,
    }));
    const mine = uid ? data.find((r) => r.player_id === uid) : null;
    const out: RemoteField = {
      entries,
      me: mine ? { rank: Number(mine.rank), score: Number(mine.score) } : null,
    };
    engine.store.setJSON(CACHE_KEY + dayKey, out);
    return out;
  } catch {
    return readCache(dayKey);
  }
}

export async function fetchAllTime(): Promise<RemoteField | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id ?? null;
    const { data, error } = await sb
      .from('alltime_standings')
      .select('name, total, rank, player_id')
      .order('rank', { ascending: true })
      .limit(100);
    if (error || !data) return readCache('alltime');
    const entries: LbEntry[] = data.map((r) => ({
      name: String(r.name),
      score: Number(r.total),
      solved: true,
    }));
    const mine = uid ? data.find((r) => r.player_id === uid) : null;
    const out: RemoteField = {
      entries,
      me: mine ? { rank: Number(mine.rank), score: Number(mine.total) } : null,
    };
    engine.store.setJSON(CACHE_KEY + 'alltime', out);
    return out;
  } catch {
    return readCache('alltime');
  }
}

function readCache(key: string): RemoteField | null {
  return engine.store.getJSON(CACHE_KEY + key, null) as RemoteField | null;
}

// ---- the outbox: submissions survive offline days ----
interface Pending {
  day: string;
  score: number;
  solved: boolean;
  guesses: number;
  words: BestWord[];
}

export function enqueueSubmission(
  dayKey: string,
  score: number,
  sworb: SworbState,
  words: BestWord[]
): void {
  const box = (engine.store.getJSON(OUTBOX_KEY, []) as Pending[]).filter((p) => p.day !== dayKey);
  box.push({ day: dayKey, score, solved: sworb.solved, guesses: sworb.guessesUsed, words });
  engine.store.setJSON(OUTBOX_KEY, box);
  void drainOutbox(); // best effort now; boot/foreground retries the rest
}

export async function drainOutbox(): Promise<void> {
  if (!isConfigured()) return;
  const box = engine.store.getJSON(OUTBOX_KEY, []) as Pending[];
  if (!box.length) return;
  const uid = await ensurePlayer(getPlayerName());
  const sb = supabase();
  if (!uid || !sb) return;
  const remaining: Pending[] = [];
  for (const p of box) {
    try {
      const { error } = await sb.from('submissions').insert({
        player_id: uid,
        day: p.day,
        score: p.score,
        solved: p.solved,
        guesses: p.guesses,
        words: p.words,
      });
      // duplicate (already submitted) counts as delivered — the day is one-shot
      if (error && !`${error.code}`.startsWith('23')) remaining.push(p);
    } catch {
      remaining.push(p);
    }
  }
  engine.store.setJSON(OUTBOX_KEY, remaining);
}
