// YOUR ROOMS (owner: "i created it… now there's no history of it
// anywhere") — the local registry of rooms you've made or joined, rich
// enough to draw a tile (name + door), not just a code. The storms
// scroller lists these; the rooms sheet reads the same source.
import engine from '@sworbl/engine';

const KEY = 'sworbl_rn_my_rooms';

export interface SavedRoom {
  code: string;
  name: string;
  entry: number;
}

export function savedRooms(): SavedRoom[] {
  const raw = engine.store.getJSON(KEY, []) as Array<SavedRoom | string>;
  // legacy rows were bare code strings — normalize on read
  return raw.map((r) =>
    typeof r === 'string' ? { code: r, name: r, entry: 0 } : r
  );
}

export function rememberRoom(room: SavedRoom): void {
  const cur = savedRooms().filter((r) => r.code !== room.code);
  engine.store.setJSON(KEY, [room, ...cur].slice(0, 6));
}
