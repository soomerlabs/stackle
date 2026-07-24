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
  stake: number; // the poster's named gamble — the taker must match it
  sealed: boolean; // sealed hand: the score reveals only after your run
  forMe: boolean; // a call-out aimed at YOU (owner: pick a specific user)
  challengedName: string | null; // who MY post calls out (null = open seat)
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
      .select('id, seed, format, score, name, poster, stake, sealed, challenged, challenged_name')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    const out: OpenDuel[] = data
      // someone ELSE's call-out aimed at someone else is not your fight —
      // it never rides your rail
      .filter((r) => !r.challenged || r.challenged === uid || r.poster === uid)
      .map((r) => ({
        id: Number(r.id),
        seed: String(r.seed),
        format: r.format === 'themed' ? 'themed' : 'blitz',
        score: Number(r.score),
        name: String(r.name),
        mine: uid != null && r.poster === uid,
        stake: Number(r.stake) || 25,
        sealed: r.sealed === true,
        forMe: uid != null && r.challenged === uid,
        challengedName: r.challenged_name ? String(r.challenged_name) : null,
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
  pot: number; // 2× the named stake — what the winner took
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
      .select('id, seed, score, taker_score, winner, poster, taker, status, stake')
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
        pot: (Number(r.stake) || 25) * 2,
      };
    });
  } catch {
    return [];
  }
}

// the LEDGER (owner: "how do i manage my currency") — your own point
// events, newest first (RLS: read-own)
export interface PointEvent {
  delta: number;
  reason: string;
  ts: number;
}

export async function fetchPointEvents(limit = 12): Promise<PointEvent[] | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const uid = (await sb.auth.getSession()).data.session?.user.id;
    if (!uid) return null;
    const { data, error } = await sb
      .from('point_events')
      .select('delta, reason, created_at')
      .order('id', { ascending: false })
      .limit(limit);
    if (error || !data) return null;
    return data.map((r) => ({
      delta: Number(r.delta),
      reason: String(r.reason),
      ts: Date.parse(String(r.created_at)) || 0,
    }));
  } catch {
    return null;
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
export async function claimShowdown(id: number): Promise<'ok' | 'taken' | 'poor' | 'played' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('showdown', { body: { action: 'claim', id } });
    if (data?.ok) return 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 402) return 'poor'; // can't cover the ante
    if (status === 412) return 'played'; // already banked this board — no free money
    return status === 409 ? 'taken' : 'error';
  } catch {
    return 'error';
  }
}

// the wallet's client spender — prices live SERVER-side only. `ref` is
// the purchase receipt (owner bug: "drained my account, no hint"): a
// retry carrying the same ref can never double-charge.
export async function spendPoints(
  action: 'hint' | 'storm-squall' | 'storm-thunder' | 'storm-hurricane',
  ref?: string
): Promise<{ balance: number } | 'poor' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('spend-points', { body: { action, ref } });
    if (data?.ok) return { balance: Number(data.balance) };
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 402 ? 'poor' : 'error';
  } catch {
    return 'error';
  }
}

// MOCK TOP-UP (owner: "pay for more, lol") — the proof-phase paywall.
// Ref-idempotent like every purchase; no real money moves.
export async function buyPack(
  pack: 'splash' | 'surge' | 'deluge',
  ref: string
): Promise<{ balance: number } | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data } = await sb.functions.invoke('topup', { body: { pack, ref } });
    if (data?.ok) return { balance: Number(data.balance) };
    return 'error';
  } catch {
    return 'error';
  }
}

// DAILY REFUEL (owner: "give points everyday") — claim the day's grant.
// Idempotent server-side; granted 0 means already fueled today.
export async function claimRefuel(): Promise<{ granted: number; balance: number } | null> {
  const sb = supabase();
  if (!sb) return null;
  try {
    const { data } = await sb.functions.invoke('refuel', { body: {} });
    if (!data?.ok) return null;
    return { granted: Number(data.granted) || 0, balance: Number(data.balance) || 0 };
  } catch {
    return null;
  }
}

// PRIVATE ROOMS (owner: "the organizer dictates the money")
export interface RoomCard {
  code: string;
  name: string;
  seed: string;
  entry: number;
  pot: number;
  status: 'open' | 'settled';
  hostName: string;
  seats: number;
  youAreHost: boolean;
  youAreIn: boolean;
}

function toRoomCard(r: Record<string, unknown>): RoomCard {
  return {
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    seed: String(r.seed ?? ''),
    entry: Number(r.entry) || 0,
    pot: Number(r.pot) || 0,
    status: r.status === 'settled' ? 'settled' : 'open',
    hostName: String(r.hostName ?? 'someone'),
    seats: Number(r.seats) || 0,
    youAreHost: r.youAreHost === true,
    youAreIn: r.youAreIn === true,
  };
}

export async function createRoom(
  name: string,
  entry: number
): Promise<{ code: string; seed: string } | 'poor' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('room', {
      body: { action: 'create', name, entry },
    });
    if (data?.ok && data.room?.code) {
      return { code: String(data.room.code), seed: String(data.room.seed) };
    }
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 402 ? 'poor' : 'error';
  } catch {
    return 'error';
  }
}

export async function fetchRoomState(code: string): Promise<RoomCard | 'gone' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('room', {
      body: { action: 'state', code },
    });
    if (data?.ok && data.room) return toRoomCard(data.room);
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 404 ? 'gone' : 'error';
  } catch {
    return 'error';
  }
}

export async function joinRoom(code: string): Promise<RoomCard | 'poor' | 'gone' | 'settled' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('room', {
      body: { action: 'join', code },
    });
    if (data?.ok && data.room) return toRoomCard(data.room);
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 402) return 'poor';
    if (status === 404) return 'gone';
    return status === 409 ? 'settled' : 'error';
  } catch {
    return 'error';
  }
}

export interface RoomSettle {
  winnerName: string | null;
  winningScore: number;
  pot: number;
  refunded: boolean;
}

export async function settleRoom(code: string): Promise<RoomSettle | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data } = await sb.functions.invoke('room', {
      body: { action: 'settle', code },
    });
    if (!data?.ok) return 'error';
    return {
      winnerName: data.winnerName ? String(data.winnerName) : null,
      winningScore: Number(data.winningScore) || 0,
      pot: Number(data.pot) || 0,
      refunded: data.refunded === true,
    };
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

// publish the caller's validated run on a seed; 'no-run' = play it first.
// stake = the poster's named gamble; sealed = don't reveal the score;
// challenge = call out ONE player by username.
export async function postDuel(
  seed: string,
  format: 'blitz' | 'themed' = 'blitz',
  opts: { stake?: number; sealed?: boolean; challenge?: string } = {}
): Promise<'ok' | 'no-run' | 'has-open' | 'poor' | 'no-player' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('post-duel', {
      body: { seed, format, stake: opts.stake, sealed: opts.sealed, challenge: opts.challenge },
    });
    if (data?.ok) return 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    if (status === 409) return 'has-open'; // one open showdown per player
    if (status === 402) return 'poor'; // can't cover the ante
    if (status === 404) return 'no-player'; // the call-out name doesn't exist
    return status === 422 ? 'no-run' : 'error';
  } catch {
    return 'error';
  }
}

// PRIVATE ROOM INVITES (owner: "add in users") — an invite is an offer;
// the invitee pays the door at accept
export async function inviteToRoom(
  code: string,
  name: string
): Promise<'ok' | 'already-in' | 'no-player' | 'error'> {
  const sb = supabase();
  if (!sb) return 'error';
  try {
    const { data, error } = await sb.functions.invoke('room', {
      body: { action: 'invite', code, name },
    });
    if (data?.ok) return data.alreadyIn ? 'already-in' : 'ok';
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    return status === 404 ? 'no-player' : 'error';
  } catch {
    return 'error';
  }
}

export interface RoomInvite {
  code: string;
  name: string;
  entry: number;
  pot: number;
  inviterName: string;
}

export async function fetchRoomInvites(): Promise<RoomInvite[]> {
  const sb = supabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('my_room_invites')
      .select('code, name, entry, pot, inviter_name')
      .limit(6);
    if (error || !data) return [];
    return data.map((r) => ({
      code: String(r.code),
      name: String(r.name),
      entry: Number(r.entry) || 0,
      pot: Number(r.pot) || 0,
      inviterName: String(r.inviter_name ?? 'someone'),
    }));
  } catch {
    return [];
  }
}
