// SPEND-POINTS (owner economy, proof phase) — the wallet's only client
// spender. Actions carry a FIXED server-side price; the client never
// names a number. v1: 'hint' (25) — the guess sheet reveals a clue,
// which the ENGINE charges again naturally (more clues found = lower
// reward tier). Fair by construction.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PRICES: Record<string, number> = {
  hint: 25,
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

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }
  const price = PRICES[body.action ?? ""];
  if (price === undefined) return bad("bad action");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
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
  return new Response(JSON.stringify({ ok: true, balance: balance - price }), {
    headers: { "Content-Type": "application/json" },
  });
});
