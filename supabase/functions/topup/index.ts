// MOCK TOP-UP (owner: "pay for more, lol — mock") — the proof-phase
// paywall. No real money moves: a tapped pack just grants points and
// leaves a "top-up (mock)" trail in the ledger, which IS the experiment:
// who taps buy, and how often. Refs make retries charge-safe (well,
// grant-safe) exactly like spend-points.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PACKS: Record<string, number> = {
  splash: 100,   // $0.99 on the mock sticker
  surge: 300,    // $1.99
  deluge: 800,   // $4.99
};

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

  let body: { pack?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }
  const grant = PACKS[body.pack ?? ""];
  if (!grant) return bad("bad pack");
  const ref = typeof body.ref === "string" && body.ref.length <= 64 ? body.ref : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  if (ref) {
    const { data: seen } = await admin
      .from("point_events").select("id").eq("ref", ref).maybeSingle();
    if (seen) {
      const { data: w } = await admin
        .from("players").select("showdown_points").eq("id", user.id).maybeSingle();
      return new Response(
        JSON.stringify({ ok: true, balance: w?.showdown_points ?? 0, alreadyApplied: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  }
  const { data: me } = await admin
    .from("players").select("showdown_points").eq("id", user.id).maybeSingle();
  if (!me) return bad("no player row", 404);
  const balance = (me.showdown_points ?? 0) + grant;
  const { error } = await admin
    .from("players").update({ showdown_points: balance }).eq("id", user.id);
  if (error) return bad(error.message, 500);
  const { error: evErr } = await admin.from("point_events").insert({
    player_id: user.id, delta: grant, reason: `top-up (mock ${body.pack})`, ref,
  });
  // no receipt, no grant (audit M1) - a ref-retry after a silent receipt
  // failure would double-grant
  if (evErr) {
    await admin.from("players").update({ showdown_points: me.showdown_points ?? 0 }).eq("id", user.id);
    if ((evErr as { code?: string }).code === "23505") {
      return new Response(
        JSON.stringify({ ok: true, balance: me.showdown_points ?? 0, alreadyApplied: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    return bad("receipt failed - try again", 500);
  }
  return new Response(JSON.stringify({ ok: true, balance }), {
    headers: { "Content-Type": "application/json" },
  });
});
