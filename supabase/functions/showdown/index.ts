// SHOWDOWN lifecycle (owner: taking claims it 1v1; decided = off the rail).
// Actions:
//   claim   { id }          — open → taken (atomic; losers of the race 409)
//   resolve { id }          — taken → decided; the taker's VALIDATED
//                             practice_scores best is the truth, points
//                             land on both players (+10 win / +2 played)
import { createClient } from "jsr:@supabase/supabase-js@2";

// THE POT (owner: "literally gambling points") — each side antes the
// stake; the winner takes it all. The old flat +10/+2 retires.

const bad = (msg: string, status = 422) =>
  new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const json = (o: object) =>
  new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

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

  let body: { action?: string; id?: number };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }
  const id = body.id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return bad("bad id");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (body.action === "claim") {
    const { data: duel } = await admin
      .from("open_duels")
      .select("poster, status, stake")
      .eq("id", id)
      .maybeSingle();
    if (!duel) return bad("no such showdown", 404);
    if (duel.poster === user.id) return bad("that's your own post");
    // the taker must cover the ante BEFORE the claim locks
    const stake = Number(duel.stake) || 0;
    const { data: wallet } = await admin
      .from("players")
      .select("showdown_points")
      .eq("id", user.id)
      .maybeSingle();
    if (!wallet || (wallet.showdown_points ?? 0) < stake)
      return bad("not enough points", 402);
    // atomic claim: only an OPEN row flips; the race's loser matches zero rows
    const { data: claimed, error } = await admin
      .from("open_duels")
      .update({ status: "taken", taker: user.id })
      .eq("id", id)
      .eq("status", "open")
      .select("id");
    if (error) return bad(error.message, 500);
    if (!claimed?.length) return bad("already taken", 409);
    // ante lands after the claim wins (a lost race never charges)
    await admin
      .from("players")
      .update({ showdown_points: (wallet.showdown_points ?? 0) - stake })
      .eq("id", user.id);
    await admin.from("point_events").insert({ player_id: user.id, delta: -stake, reason: "showdown ante" });
    return json({ ok: true, stake });
  }

  if (body.action === "resolve") {
    const { data: duel } = await admin
      .from("open_duels")
      .select("seed, score, poster, taker, status, stake")
      .eq("id", id)
      .maybeSingle();
    if (!duel) return bad("no such showdown", 404);
    if (duel.status === "decided") return json({ ok: true, alreadyDecided: true });
    if (duel.status !== "taken" || duel.taker !== user.id) return bad("not your showdown");

    // the taker's truth is their VALIDATED keep-best on the seed
    const { data: run } = await admin
      .from("practice_scores")
      .select("score")
      .eq("player_id", user.id)
      .eq("seed", duel.seed)
      .maybeSingle();
    if (!run) return bad("no validated run yet");

    const takerWins = run.score > duel.score;
    const winner = takerWins ? duel.taker : duel.poster;
    const { data: decided, error } = await admin
      .from("open_duels")
      .update({ status: "decided", taker_score: run.score, winner })
      .eq("id", id)
      .eq("status", "taken")
      .select("id");
    if (error) return bad(error.message, 500);
    if (!decided?.length) return json({ ok: true, alreadyDecided: true });

    // THE POT: both antes to the winner (single-writer function; races
    // are benign)
    const pot = (Number(duel.stake) || 0) * 2;
    const { data: pl } = await admin.from("players").select("showdown_points").eq("id", winner).maybeSingle();
    if (pl) {
      await admin
        .from("players")
        .update({ showdown_points: (pl.showdown_points ?? 0) + pot })
        .eq("id", winner);
      await admin.from("point_events").insert({ player_id: winner, delta: pot, reason: "showdown pot" });
    }
    return json({ ok: true, won: takerWins, yourScore: run.score, theirScore: duel.score, pot });
  }

  return bad("bad action");
});
