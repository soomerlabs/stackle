// PRIVATE ROOMS (owner: "the organizer dictates the money") — a named
// board with a buy-in. Entries feed the pot; the host calls it and the
// top validated run takes everything. No scores at settle = full refunds.
// Actions:
//   create { name, entry }  — host pays the buy-in too (skin in the game)
//   join   { code }         — charge entry, seat the player (idempotent:
//                             an existing member is never re-charged)
//   state  { code }         — room card for the join screen (pre-member peek)
//   settle { code }         — host only; pot to the best score, else refunds
import { createClient } from "jsr:@supabase/supabase-js@2";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/L/I
const NAME_MAX = 24;

const bad = (msg: string, status = 422) =>
  new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const json = (o: object) =>
  new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

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

  let body: { action?: string; name?: string; entry?: number; code?: string };
  try {
    body = await req.json();
  } catch {
    return bad("bad json", 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const charge = async (playerId: string, amount: number, reason: string) => {
    if (amount <= 0) return true;
    const { data: w } = await admin
      .from("players").select("showdown_points").eq("id", playerId).maybeSingle();
    if (!w || (w.showdown_points ?? 0) < amount) return false;
    await admin.from("players")
      .update({ showdown_points: (w.showdown_points ?? 0) - amount })
      .eq("id", playerId);
    await admin.from("point_events").insert({ player_id: playerId, delta: -amount, reason });
    return true;
  };
  const credit = async (playerId: string, amount: number, reason: string) => {
    if (amount <= 0) return;
    const { data: w } = await admin
      .from("players").select("showdown_points").eq("id", playerId).maybeSingle();
    if (!w) return;
    await admin.from("players")
      .update({ showdown_points: (w.showdown_points ?? 0) + amount })
      .eq("id", playerId);
    await admin.from("point_events").insert({ player_id: playerId, delta: amount, reason });
  };

  if (body.action === "create") {
    const name = (body.name ?? "").trim().slice(0, NAME_MAX);
    if (!name) return bad("name the room");
    const entry = Number.isInteger(body.entry) && (body.entry as number) >= 0 && (body.entry as number) <= 500
      ? (body.entry as number)
      : 0;
    if (!(await charge(user.id, entry, "room entry"))) return bad("not enough points", 402);
    // collision-proof code: retry the unique insert a few times
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      const { data: room, error } = await admin
        .from("rooms")
        .insert({ code, name, host: user.id, seed: `r-${code.toLowerCase()}`, entry, pot: entry })
        .select("id, code, seed, entry, pot")
        .maybeSingle();
      if (error) {
        if ((error as { code?: string }).code === "23505") continue;
        await credit(user.id, entry, "room refund");
        return bad(error.message, 500);
      }
      const { error: seatErr } = await admin
        .from("room_members")
        .insert({ room_id: room!.id, player_id: user.id });
      // audit M2: an unseated host can't win their own pot AND gets
      // re-charged as a "joiner" later - unwind the whole create
      if (seatErr) {
        await admin.from("rooms").delete().eq("id", room!.id);
        await credit(user.id, entry, "room refund");
        return bad("could not seat you - nothing charged, try again", 500);
      }
      return json({ ok: true, room });
    }
    await credit(user.id, entry, "room refund");
    return bad("could not mint a code, try again", 500);
  }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return bad("bad code");
  const { data: room } = await admin
    .from("rooms")
    .select("id, code, name, host, seed, entry, pot, status, winner")
    .eq("code", code)
    .maybeSingle();
  if (!room) return bad("no such room", 404);
  const { data: hostRow } = await admin
    .from("players").select("name").eq("id", room.host).maybeSingle();
  const { count: seatCount } = await admin
    .from("room_members").select("*", { count: "exact", head: true })
    .eq("room_id", room.id);
  const card = {
    code: room.code, name: room.name, seed: room.seed, entry: room.entry,
    pot: room.pot, status: room.status, hostName: hostRow?.name ?? "someone",
    seats: seatCount ?? 0, youAreHost: room.host === user.id,
  };

  if (body.action === "state") {
    const { data: member } = await admin
      .from("room_members").select("player_id")
      .eq("room_id", room.id).eq("player_id", user.id).maybeSingle();
    return json({ ok: true, room: { ...card, youAreIn: !!member } });
  }

  if (body.action === "join") {
    if (room.status !== "open") return bad("room is settled", 409);
    const { data: member } = await admin
      .from("room_members").select("player_id")
      .eq("room_id", room.id).eq("player_id", user.id).maybeSingle();
    if (member) return json({ ok: true, room: { ...card, youAreIn: true } });
    if (!(await charge(user.id, room.entry, "room entry"))) return bad("not enough points", 402);
    const { error } = await admin
      .from("room_members").insert({ room_id: room.id, player_id: user.id });
    if (error) {
      await credit(user.id, room.entry, "room refund");
      return bad(error.message, 500);
    }
    // audit M3: the pot bump only lands while the room is still OPEN -
    // a join racing the settle unwinds instead of feeding a paid-out pot
    const { data: fresh } = await admin
      .from("rooms")
      .select("pot")
      .eq("id", room.id)
      .eq("status", "open")
      .maybeSingle();
    if (!fresh) {
      await admin.from("room_members").delete().eq("room_id", room.id).eq("player_id", user.id);
      await credit(user.id, room.entry, "room refund");
      return bad("room is settled", 409);
    }
    const newPot = (Number(fresh.pot) || 0) + room.entry;
    await admin.from("rooms").update({ pot: newPot }).eq("id", room.id).eq("status", "open");
    return json({ ok: true, room: { ...card, pot: newPot, seats: (seatCount ?? 0) + 1, youAreIn: true } });
  }

  if (body.action === "settle") {
    if (room.host !== user.id) return bad("only the host calls it", 403);
    if (room.status !== "open") return json({ ok: true, alreadySettled: true });
    const { data: members } = await admin
      .from("room_members").select("player_id").eq("room_id", room.id);
    const ids = (members ?? []).map((m) => m.player_id);
    const { data: best } = await admin
      .from("practice_scores")
      .select("player_id, score")
      .eq("seed", room.seed)
      .in("player_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle();
    // atomic close: a double-tap settles zero rows the second time
    const { data: closed } = await admin
      .from("rooms")
      .update({ status: "settled", winner: best?.player_id ?? null })
      .eq("id", room.id)
      .eq("status", "open")
      .select("id");
    if (!closed?.length) return json({ ok: true, alreadySettled: true });
    if (best) {
      await credit(best.player_id, room.pot, "room pot");
      const { data: wn } = await admin
        .from("players").select("name").eq("id", best.player_id).maybeSingle();
      return json({ ok: true, winnerName: wn?.name ?? "someone", winningScore: best.score, pot: room.pot });
    }
    // nobody played — everyone gets their buy-in back
    for (const pid of ids) await credit(pid, room.entry, "room refund");
    return json({ ok: true, refunded: true });
  }

  return bad("bad action");
});
