// OPEN DUELS (modes-spec: h2h without lobbies) — a duel is a posted,
// server-validated run on a seed, waiting for anyone to beat it. Reads go
// through the open_duel_board view; posting goes through the post-duel
// edge function (the score is copied server-side from practice_scores —
// clients never name a number).
import engine from '@sworbl/engine';
import { supabase } from './supabase';

const CACHE_KEY = 'sworbl_rn_duels_cache';

export interface OpenDuel {
  id: number;
  seed: string;
  format: 'blitz' | 'themed';
  score: number;
  name: string;
  mine: boolean;
}

export function readCachedDuels(): OpenDuel[] {
  return engine.store.getJSON(CACHE_KEY, []) as OpenDuel[];
}

export async function fetchOpenDuels(limit = 6): Promise<OpenDuel[] | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id ?? null;
    const { data, error } = await sb
      .from('open_duel_board')
      .select('id, seed, format, score, name, poster')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    const out: OpenDuel[] = data.map((r) => ({
      id: Number(r.id),
      seed: String(r.seed),
      format: r.format === 'themed' ? 'themed' : 'blitz',
      score: Number(r.score),
      name: String(r.name),
      mine: uid != null && r.poster === uid,
    }));
    engine.store.setJSON(CACHE_KEY, out);
    return out;
  } catch {
    return null;
  }
}

// one duel's recorded run — the ghost that races you. Null on any miss;
// the race bar falls back to an even synthetic climb.
export async function fetchDuelGhost(
  id: number
): Promise<Array<{ pts: number; t?: number }> | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from('open_duels').select('words').eq('id', id).maybeSingle();
    if (error || !data || !Array.isArray(data.words)) return null;
    return (data.words as Array<{ pts?: number; t?: number }>)
      .map((w) => ({ pts: Number(w.pts) || 0, t: typeof w.t === 'number' ? w.t : undefined }))
      .filter((w) => w.pts > 0);
  } catch {
    return null;
  }
}

// the shelf's crowns: best score + holder per board, plus YOUR best —
// one query each way, batched over today's three seeds
export async function fetchStormCrowns(
  seeds: string[]
): Promise<Record<string, { top: { name: string; score: number } | null; mine: number | null }> | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id ?? null;
    const [tops, mine] = await Promise.all([
      sb.from('practice_standings').select('seed, name, score, rank').in('seed', seeds).eq('rank', 1),
      uid
        ? sb.from('practice_scores').select('seed, score').in('seed', seeds).eq('player_id', uid)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (tops.error) return null;
    const out: Record<string, { top: { name: string; score: number } | null; mine: number | null }> = {};
    for (const s of seeds) out[s] = { top: null, mine: null };
    for (const r of tops.data ?? []) {
      const cur = out[String(r.seed)];
      // rank() ties: keep the higher name deterministically (first wins)
      if (cur && !cur.top) cur.top = { name: String(r.name), score: Number(r.score) };
    }
    for (const r of (mine.data ?? []) as Array<{ seed: string; score: number }>) {
      if (out[String(r.seed)]) out[String(r.seed)].mine = Number(r.score);
    }
    return out;
  } catch {
    return null;
  }
}

// SHOWDOWN lifecycle (owner: taking claims it; decided = off the rail)
export async function claimShowdown(id: number): Promise<'ok' | 'taken' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('showdown', { body: { action: 'claim', id } });
    if (data?.ok) return 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 409 ? 'taken' : 'error';
  } catch {
    return 'error';
  }
}

export interface ShowdownVerdict {
  won: boolean;
  yourScore: number;
  theirScore: number;
}

export async function resolveShowdown(id: number): Promise<ShowdownVerdict | 'pending' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('showdown', { body: { action: 'resolve', id } });
    if (data?.ok && typeof data.won === 'boolean') {
      return { won: data.won, yourScore: Number(data.yourScore), theirScore: Number(data.theirScore) };
    }
    if (data?.ok) return 'error'; // alreadyDecided — nothing to show
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 422 ? 'pending' : 'error'; // no validated run yet → retry
  } catch {
    return 'error';
  }
}

// publish the caller's validated run on a seed; 'no-run' = play it first
export async function postDuel(
  seed: string,
  format: 'blitz' | 'themed' = 'blitz'
): Promise<'ok' | 'no-run' | 'has-open' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('post-duel', { body: { seed, format } });
    if (data?.ok) return 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 409) return 'has-open'; // one open showdown per player
    return status === 422 ? 'no-run' : 'error';
  } catch {
    return 'error';
  }
}
