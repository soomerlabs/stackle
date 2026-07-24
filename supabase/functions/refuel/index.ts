// DAILY REFUEL (owner: "give points everyday as a refuel thing") —
// +25 once per UTC day, claimed on app open. Idempotent: the date-
// guarded update means double-taps and races land exactly one grant.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DAILY_REFUEL = 25;

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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const today = new Date().toISOString().slice(0, 10);
  const { data: me } = await admin
    .from("players")
    .select("showdown_points, last_refuel")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return bad("no player row", 404);
  if (me.last_refuel === today) {
    return new Response(
      JSON.stringify({ ok: true, granted: 0, balance: me.showdown_points ?? 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  // date-guarded write: a concurrent duplicate matches zero rows
  const { data: bumped, error } = await admin
    .from("players")
    .update({
      showdown_points: (me.showdown_points ?? 0) + DAILY_REFUEL,
      last_refuel: today,
    })
    .eq("id", user.id)
    .or(`last_refuel.is.null,last_refuel.neq.${today}`)
    .select("showdown_points");
  if (error) return bad(error.message, 500);
  if (!bumped?.length) {
    return new Response(
      JSON.stringify({ ok: true, granted: 0, balance: me.showdown_points ?? 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  await admin.from("point_events").insert({
    player_id: user.id, delta: DAILY_REFUEL, reason: "daily refuel",
  });
  return new Response(
    JSON.stringify({ ok: true, granted: DAILY_REFUEL, balance: bumped[0].showdown_points }),
    { headers: { "Content-Type": "application/json" } },
  );
});
