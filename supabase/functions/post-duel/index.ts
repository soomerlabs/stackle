// POST-DUEL — publish your VALIDATED run on a seed as an open duel.
// The score is never taken from the request: it is copied from the
// caller's practice_scores row, which only submit-score (the honesty
// gate) can write. Body: { seed, format? }.
import { createClient } from "jsr:@supabase/supabase-js@2";

const bad = (msg: string, status = 422) =>
  new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (!user) return bad("not signed in", 401);

  let body: { seed?: string; format?: string; stake?: number; sealed?: boolean; challenge?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }
  const seed = body.seed;
  const format = body.format ?? "blitz";
  if (typeof seed !== "string" || !/^[a-z0-9-]{3,24}$/.test(seed)) return bad("bad seed");
  if (!["blitz", "themed"].includes(format)) return bad("bad format");

  // CALL-OUT (owner: "can i select a specific user?") - the post aims at
  // one player; usernames are unique (owner law), so the name IS the id
  let challenged: string | null = null;
  if (typeof body.challenge === "string" && body.challenge.trim()) {
    const wanted = body.challenge.trim().toLowerCase();
    const adminLookup = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: target } = await adminLookup
      .from("players")
      .select("id, name")
      .ilike("name", wanted)
      .maybeSingle();
    if (!target) return bad("no player wears that name", 404);
    if (target.id === user.id) return bad("you can't call yourself out");
    challenged = target.id;
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ONE OPEN SHOWDOWN PER PLAYER (owner: "so they cant spam us") —
  // a second seed waits its turn. Audit C2: the upsert must never touch
  // a row that left 'open' (mid-match rewrites, dead-row charges), and a
  // refresh of your own open post never re-antes.
  const { data: open } = await admin
    .from("open_duels")
    .select("seed")
    .eq("poster", user.id)
    .eq("status", "open");
  if ((open ?? []).some((r) => r.seed !== seed))
    return bad("you already have an open showdown", 409);
  const { data: existing } = await admin
    .from("open_duels")
    .select("status, stake")
    .eq("poster", user.id)
    .eq("seed", seed)
    .maybeSingle();
  if (existing && existing.status !== "open")
    return bad("that board's showdown already ran", 409);
  const refreshing = !!existing; // open row of ours — ante already paid

  // THE ANTE (owner: "put what you're willing to gamble") — the poster
  // names the stake; the taker must match it at claim.
  const STAKE = Number.isInteger(body.stake) && (body.stake as number) >= 5 && (body.stake as number) <= 200
    ? (body.stake as number)
    : 25;
  const { data: wallet } = await admin
    .from("players")
    .select("showdown_points")
    .eq("id", user.id)
    .maybeSingle();
  if (!wallet || (wallet.showdown_points ?? 0) < STAKE)
    return bad("not enough points", 402);

  // the run must exist, validated, under the caller's own id
  const { data: run } = await admin
    .from("practice_scores")
    .select("score, words")
    .eq("player_id", user.id)
    .eq("seed", seed)
    .maybeSingle();
  if (!run) return bad("no validated run on this seed");

  // refresh keeps the ORIGINAL stake (the ante already on the table);
  // the guarded upsert can never land on a row that left 'open'
  const finalStake = refreshing ? Number(existing!.stake) || 25 : STAKE;
  if (refreshing) {
    const { data: upd, error } = await admin
      .from("open_duels")
      .update({ format, score: run.score, words: run.words ?? [], sealed: body.sealed === true, challenged })
      .eq("poster", user.id)
      .eq("seed", seed)
      .eq("status", "open")
      .select("id");
    if (error) return bad(error.message, 500);
    if (!upd?.length) return bad("that board's showdown already ran", 409);
    return new Response(JSON.stringify({ ok: true, score: run.score, stake: finalStake, refreshed: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const { error } = await admin.from("open_duels").insert({
    seed,
    poster: user.id,
    format,
    score: run.score,
    words: run.words ?? [],
    stake: STAKE,
    sealed: body.sealed === true,
    challenged,
  });
  if (error) return bad(error.message, 500);
  // ante lands AFTER the post succeeds (a failed post never charges)
  await admin
    .from("players")
    .update({ showdown_points: (wallet.showdown_points ?? 0) - STAKE })
    .eq("id", user.id);
  await admin.from("point_events").insert({ player_id: user.id, delta: -STAKE, reason: "showdown ante" });
  return new Response(JSON.stringify({ ok: true, score: run.score, stake: STAKE }), {
    headers: { "Content-Type": "application/json" },
  });
});
