// SPEND-POINTS (owner economy, proof phase) — the wallet's only client
// spender. Actions carry a FIXED server-side price; the client never
// names a number. v1: 'hint' (25) — the guess sheet reveals a clue,
// which the ENGINE charges again naturally (more clues found = lower
// reward tier). Fair by construction.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PRICES: Record<string, number> = {
  hint: 25,
  // storm entries (owner): the ladder charges as it climbs
  'storm-squall': 5,
  'storm-thunder': 10,
  'storm-hurricane': 20,
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

  let body: { action?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }
  const price = PRICES[body.action ?? ""];
  if (price === undefined) return bad("bad action");
  const ref = typeof body.ref === "string" && body.ref.length <= 64 ? body.ref : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // THE RECEIPT (owner bug: "drained my account, no hint") — a retry that
  // carries the same ref finds its receipt and returns ok WITHOUT charging.
  if (ref) {
    const { data: seen } = await admin
      .from("point_events")
      .select("id")
      .eq("ref", ref)
      .maybeSingle();
    if (seen) {
      const { data: w } = await admin
        .from("players").select("showdown_points").eq("id", user.id).maybeSingle();
      return new Response(
        JSON.stringify({ ok: true, balance: w?.showdown_points ?? 0, alreadyApplied: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const { data: wallet } = await admin
    .from("players")
    .select("showdown_points")
    .eq("id", user.id)
    .maybeSingle();
  const balance = wallet?.showdown_points ?? 0;
  if (balance < price) return bad("not enough points", 402);
  const { error } = await admin
    .from("players")
    .update({ showdown_points: balance - price })
    .eq("id", user.id);
  if (error) return bad(error.message, 500);
  const { error: evErr } = await admin
    .from("point_events")
    .insert({ player_id: user.id, delta: -price, reason: body.action, ref });
  // no receipt, no charge (audit M1): a failed ledger insert refunds -
  // otherwise a retry with the same ref finds nothing and charges again
  if (evErr && (evErr as { code?: string }).code !== "23505") {
    await admin
      .from("players")
      .update({ showdown_points: balance })
      .eq("id", user.id);
    return bad("receipt failed - nothing charged, try again", 500);
  }
  // a racing duplicate loses the unique-ref insert — refund its charge
  if (evErr && (evErr as { code?: string }).code === "23505") {
    const { data: w } = await admin
      .from("players").select("showdown_points").eq("id", user.id).maybeSingle();
    await admin
      .from("players")
      .update({ showdown_points: (w?.showdown_points ?? 0) + price })
      .eq("id", user.id);
    return new Response(
      JSON.stringify({ ok: true, balance: (w?.showdown_points ?? 0) + price, alreadyApplied: true }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ ok: true, balance: balance - price }), {
    headers: { "Content-Type": "application/json" },
  });
});
