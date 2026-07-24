// DELETE-ACCOUNT (App Store 5.1.1(v)): the caller's own account, gone in
// one call. Identity comes ONLY from the caller's JWT — there is no way
// to name another user. Deleting the auth user cascades:
//   auth.users → public.players → submissions / practice_scores /
//   alltime_totals / group_members / groups(owner) / reports(reporter)
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return bad(error.message, 500);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
