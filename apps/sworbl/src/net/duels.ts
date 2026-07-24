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
// one query each way, batched over today's four seeds
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

// SETTLED WHILE AWAY (audit: the poster was never told) — decided
// showdowns involving YOU, newer than the last one you've seen. The
// watermark rides local storage; callers toast the freshest result.
const SEEN_KEY = 'sworbl_rn_sd_seen';

export interface SettledShowdown {
  id: number;
  seed: string;
  won: boolean;
  myScore: number;
  theirScore: number;
}

export async function fetchSettledShowdowns(): Promise<SettledShowdown[]> {
  const sb = supabase();
  if (!sb) return [];
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id;
    if (!uid) return [];
    const since = Number(engine.store.getJSON(SEEN_KEY, 0)) || 0;
    const { data, error } = await sb
      .from('open_duels')
      .select('id, seed, score, taker_score, winner, poster, taker, status')
      .eq('status', 'decided')
      .or(`poster.eq.${uid},taker.eq.${uid}`)
      .gt('id', since)
      .order('id', { ascending: true })
      .limit(10);
    if (error || !data?.length) return [];
    engine.store.setJSON(SEEN_KEY, Math.max(...data.map((r) => Number(r.id))));
    return data.map((r) => {
      const iPosted = r.poster === uid;
      return {
        id: Number(r.id),
        seed: String(r.seed),
        won: r.winner === uid,
        myScore: Number(iPosted ? r.score : r.taker_score),
        theirScore: Number(iPosted ? r.taker_score : r.score),
      };
    });
  } catch {
    return [];
  }
}

// your points ledger (profile stat card) — null offline
export async function fetchMyShowdownPoints(): Promise<number | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id;
    if (!uid) return null;
    const { data, error } = await sb.from('players').select('showdown_points').eq('id', uid).maybeSingle();
    if (error || !data) return null;
    return Number(data.showdown_points) || 0;
  } catch {
    return null;
  }
}

// SHOWDOWN lifecycle (owner: taking claims it; decided = off the rail)
export async function claimShowdown(id: number): Promise<'ok' | 'taken' | 'poor' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('showdown', { body: { action: 'claim', id } });
    if (data?.ok) return 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 402) return 'poor'; // can't cover the ante
    return status === 409 ? 'taken' : 'error';
  } catch {
    return 'error';
  }
}

// the wallet's client spender — prices live SERVER-side only
export async function spendPoints(
  action: 'hint' | 'storm-squall' | 'storm-thunder' | 'storm-hurricane'
): Promise<{ balance: number } | 'poor' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('spend-points', { body: { action } });
    if (data?.ok) return { balance: Number(data.balance) };
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 402 ? 'poor' : 'error';
  } catch {
    return 'error';
  }
}

export interface ShowdownVerdict {
  won: boolean;
  yourScore: number;
  theirScore: number;
  pot: number; // the stakes, both sides — the winner's take
}

export async function resolveShowdown(id: number): Promise<ShowdownVerdict | 'pending' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('showdown', { body: { action: 'resolve', id } });
    if (data?.ok && typeof data.won === 'boolean') {
      return {
        won: data.won,
        yourScore: Number(data.yourScore),
        theirScore: Number(data.theirScore),
        pot: Number(data.pot) || 0,
      };
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
): Promise<'ok' | 'no-run' | 'has-open' | 'poor' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('post-duel', { body: { seed, format } });
    if (data?.ok) return 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 409) return 'has-open'; // one open showdown per player
    if (status === 402) return 'poor'; // can't cover the ante
    return status === 422 ? 'no-run' : 'error';
  } catch {
    return 'error';
  }
}
