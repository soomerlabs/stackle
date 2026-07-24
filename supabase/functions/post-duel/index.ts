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

  let body: { seed?: string; format?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }
  const seed = body.seed;
  const format = body.format ?? "blitz";
  if (typeof seed !== "string" || !/^[a-z0-9-]{3,24}$/.test(seed)) return bad("bad seed");
  if (!["blitz", "themed"].includes(format)) return bad("bad format");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ONE OPEN SHOWDOWN PER PLAYER (owner: "so they cant spam us") —
  // reposting the SAME seed refreshes it; a second seed waits its turn
  const { data: open } = await admin
    .from("open_duels")
    .select("seed")
    .eq("poster", user.id)
    .eq("status", "open");
  if ((open ?? []).some((r) => r.seed !== seed))
    return bad("you already have an open showdown", 409);

  // the run must exist, validated, under the caller's own id
  const { data: run } = await admin
    .from("practice_scores")
    .select("score, words")
    .eq("player_id", user.id)
    .eq("seed", seed)
    .maybeSingle();
  if (!run) return bad("no validated run on this seed");

  const { error } = await admin.from("open_duels").upsert(
    {
      seed,
      poster: user.id,
      format,
      score: run.score,
      words: run.words ?? [],
    },
    { onConflict: "seed,poster" },
  );
  if (error) return bad(error.message, 500);
  return new Response(JSON.stringify({ ok: true, score: run.score }), {
    headers: { "Content-Type": "application/json" },
  });
});
