// ANALYTICS (owner: "so we can tell how things are going") — a fire-and-
// forget event stream into app_events. Never blocks, never throws, never
// gates gameplay: a lost event is a lost event. The dashboard's SQL
// editor is the analyst:
//   select name, count(*) from app_events
//   where created_at > now() - interval '7 days'
//   group by 1 order by 2 desc;
import { supabase } from './supabase';

export function track(name: string, props: Record<string, unknown> = {}): void {
  const sb = supabase();
  if (!sb) return;
  void (async () => {
    try {
      const uid = (await sb.auth.getSession()).data.session?.user.id;
      if (!uid) return;
      await sb.from('app_events').insert({ player_id: uid, name, props });
    } catch {
      // analytics never surfaces an error
    }
  })();
}
