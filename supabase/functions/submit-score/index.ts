// SUBMIT-SCORE — the leaderboard's honesty gate (Deno edge function).
// Clients lost direct INSERT on submissions (schema v2); every result comes
// through here, where the words are RE-SCORED with the engine ITSELF —
// the generated engine-core.js IS packages/engine/sworbl-core.js:
//   word points = round(sum(letterVal) * 10 * lenMult(len))
//   legal score = sum(word pts) + a solve bonus from the engine's own
//   round-decayed reward table (SworblDaily.legalBonuses(rounds))
// Per-word slack ×8 covers streak (≤2×) and boost-stack tiles; the total
// must reconcile EXACTLY against the reward table.
// Deploy: npx supabase functions deploy submit-score
import { createClient } from "jsr:@supabase/supabase-js@2";
// THE REAL ENGINE (owner: game and backend score with the SAME code) —
// engine-core.js is a GENERATED copy of packages/engine/sworbl-core.js
// (see supabase/functions/deploy.sh); it attaches globalThis.SworblCore.
import "./engine-core.js";

// deno-lint-ignore no-explicit-any
const CORE = (globalThis as any).SworblCore as {
  letterVal: (letter: string, boost?: number) => number;
  lenMult: (n: number) => number;
};
// deno-lint-ignore no-explicit-any
const DAILY = (globalThis as any).SworblDaily as {
  legalBonuses: (rounds?: number) => number[];
};
const scoreWord = (w: string) =>
  Math.round([...w].reduce((s, ch) => s + CORE.letterVal(ch), 0) * 10 * CORE.lenMult(w.length));

const bad = (msg: string, status = 422) =>
  new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  // identity: the caller's own JWT (anonymous users included)
  const authHeader = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (!user) return bad("not signed in", 401);

  let body: {
    day?: string; score?: number; solved?: boolean; guesses?: number;
    words?: { word?: string; pts?: number; t?: number }[];
    mode?: string; // 'regular' (keep-best) | 'practice' (keep-best per seed)
    seed?: string; // practice only
    rounds?: number; // rounds played at solve time — decays the legal bonus
  };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }

  const { day, score, solved, guesses, words } = body;
  const mode = body.mode ?? "regular";
  if (!["regular", "practice"].includes(mode)) return bad("bad mode");
  const rounds = body.rounds ?? 1;
  if (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds < 1 || rounds > 99)
    return bad("bad rounds");
  if (mode === "practice") {
    if (typeof body.seed !== "string" || !/^[a-z0-9-]{3,24}$/.test(body.seed))
      return bad("bad seed");
  } else if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return bad("bad day");
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score >= 100000)
    return bad("bad score");
  if (typeof solved !== "boolean") return bad("bad solved");
  if (typeof guesses !== "number" || !Number.isInteger(guesses) || guesses < 0 || guesses > 6)
    return bad("bad guesses");
  if (!Array.isArray(words) || words.length > 80) return bad("bad words");

  // RE-SCORE: every word must be plausible against the engine's own math
  let sum = 0;
  for (const w of words) {
    if (!w || typeof w.word !== "string" || !/^[a-z]{3,8}$/.test(w.word)) return bad("bad word");
    if (typeof w.pts !== "number" || !Number.isInteger(w.pts) || w.pts < 0) return bad("bad pts");
    // ×8 slack: streak mult caps at 2×, boost-stack tiles cover the rest —
    // a 10× word is a cheat, not a lucky board
    if (w.pts > scoreWord(w.word) * 8) return bad(`implausible pts for ${w.word}`);
    // optional timing (ghost replays): ms from round start, sane range only
    if (w.t !== undefined && (typeof w.t !== "number" || w.t < 0 || w.t > 3_600_000))
      return bad("bad word timing");
    sum += w.pts;
  }
  // the total must RECONCILE: score - word points is exactly a legal bonus
  // for the declared round count (the engine's own decay math decides).
  // Practice has NO sworb → no bonus: delta must be zero.
  const delta = score - sum;
  if (mode === "practice" ? delta !== 0 : !DAILY.legalBonuses(rounds).includes(delta))
    return bad("score does not reconcile");
  if (delta > 0 && !solved) return bad("bonus without solve");
  // a "solve" that carries no bonus is a faucet claim, not a solve
  // (audit C1: {solved:true, delta:0} passed reconciliation and minted)
  if (solved && delta <= 0) return bad("solve without bonus");

  // validated: write with the service role (clients have no write policies).
  // The one-shot law is PER-MODE POLICY now (docs/modes-spec.md):
  //   hard → insert once, duplicate = delivered
  //   regular → keep-best (update only when the new score beats the stored)
  //   practice → keep-best per seed
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const json = (o: object) =>
    new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

  if (mode === "practice") {
    const { data: prior } = await admin
      .from("practice_scores")
      .select("score")
      .eq("player_id", user.id)
      .eq("seed", body.seed!)
      .maybeSingle();
    if (prior && prior.score >= score) return json({ ok: true, kept: prior.score });
    const { error } = await admin.from("practice_scores").upsert({
      player_id: user.id,
      seed: body.seed!,
      score,
      // the run's word list rides along (schema v6) — a stored run is a
      // future GHOST opponent; timings (t) make the replay real
      words: words.map((w) => (w.t !== undefined ? { word: w.word, pts: w.pts, t: Math.round(w.t) } : { word: w.word, pts: w.pts })),
      updated_at: new Date().toISOString(),
    });
    if (error) return bad(error.message, 500);
    return json({ ok: true });
  }

  const row = {
    player_id: user.id,
    day,
    score,
    solved,
    guesses,
    mode,
    words: words.map((w) =>
      w.t !== undefined ? { word: w.word, pts: w.pts, t: Math.round(w.t) } : { word: w.word, pts: w.pts }
    ),
  };
  // THE FAUCET (owner economy): the daily SOLVE pays +15 points — the
  // ritual funds the stakes. Awarded once, on the submission that
  // carries the solve for the first time.
  const awardSolve = async () => {
    const { data: pl } = await admin.from("players").select("showdown_points").eq("id", user.id).maybeSingle();
    if (pl) {
      await admin.from("players").update({ showdown_points: (pl.showdown_points ?? 0) + 15 }).eq("id", user.id);
      await admin.from("point_events").insert({ player_id: user.id, delta: 15, reason: "daily solve" });
    }
  };

  const { error } = await admin.from("submissions").insert(row);
  if (!error) {
    if (solved) await awardSolve();
    return json({ ok: true, duplicate: false });
  }
  if (error.code !== "23505") return bad(error.message, 500);

  // duplicate day: keep-best (ONE mode now — modes-spec round decay)
  const { data: prior } = await admin
    .from("submissions")
    .select("score, solved")
    .eq("player_id", user.id)
    .eq("day", day)
    .maybeSingle();
  // keep-best decides FIRST; the faucet only pays when the row actually
  // flips to solved (audit C1: award-before-update was replayable — the
  // row never recorded the solve, so every retry minted +15)
  const bringsSolve = solved && prior && !prior.solved;
  if (prior && prior.score >= score && !bringsSolve)
    return json({ ok: true, kept: prior.score });
  const keepScore = prior && prior.score >= score ? prior.score : score;
  const { data: upd, error: upErr } = await admin
    .from("submissions")
    .update({ score: keepScore, solved: solved || prior?.solved || false, guesses, mode, words: row.words })
    .eq("player_id", user.id)
    .eq("day", day)
    .eq("solved", prior?.solved ?? false) // the solve flips at most once
    .select("player_id");
  if (upErr) return bad(upErr.message, 500);
  // pay only when OUR update landed the flip (a racing duplicate matches
  // zero rows and never mints)
  if (bringsSolve && upd?.length) await awardSolve();
  return json({ ok: true, improved: true });
});
