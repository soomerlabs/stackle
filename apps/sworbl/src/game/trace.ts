// The swipe-trace system — the web board's tuned rules as UI-THREAD WORKLETS.
// (PHASE2-REQUIREMENTS #1/#2/#3/#5: tier-2 input, velocity-normalized heading,
// shared-value handles only, mid-air tiles excluded via the grid.)
// Constants are verbatim from the web's boardMove/_backtrackMagnet/
// _predictiveDefer/cellAt; heading feeds from GH velocity in px-per-60Hz-frame.
import type { SharedValue } from 'react-native-reanimated';
import type { TraceTile } from './types';

export interface TraceCtx {
  size: number;
  gap: number;
  cols: number;
  rows: number;
  grid: SharedValue<(TraceTile | null)[][]>;
  path: SharedValue<TraceTile[]>;
  lastPt: SharedValue<{ x: number; y: number } | null>;
  hx: SharedValue<number>;
  hy: SharedValue<number>;
  depth: SharedValue<Record<number, number>>;
  addAt: SharedValue<Record<number, number>>;
  prefixes: SharedValue<Record<string, 1>>;
}

export interface TracePoint {
  x: number;
  y: number;
  vx?: number; // GH velocity, px/s
  vy?: number;
}

function inPath(path: TraceTile[], id: number): boolean {
  'worklet';
  for (let i = 0; i < path.length; i++) if (path[i].id === id) return true;
  return false;
}

function adjacentW(a: TraceTile, b: TraceTile): boolean {
  'worklet';
  const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
  return !(dr === 0 && dc === 0) && dr <= 1 && dc <= 1; // diagonals always on
}

export function beginW(p: TracePoint, ctx: TraceCtx): boolean {
  'worklet';
  // fresh press = clean slate (web boardDown)
  ctx.lastPt.value = null;
  ctx.hx.value = 0;
  ctx.hy.value = 0;
  ctx.depth.value = {};
  ctx.addAt.value = {};
  const cell = ctx.size + ctx.gap;
  const c = Math.floor(p.x / cell), r = Math.floor(p.y / cell);
  if (c < 0 || c >= ctx.cols || r < 0 || r >= ctx.rows) { ctx.path.value = []; return false; }
  // taps: the whole cell is a hit — no dead spots
  const row = ctx.grid.value[r];
  const t = row ? row[c] : null;
  if (!t) { ctx.path.value = []; return false; }
  ctx.addAt.value[t.id] = Date.now();
  ctx.path.value = [t];
  return true;
}

export function moveW(nowPt: TracePoint, ctx: TraceCtx): void {
  'worklet';
  const size = ctx.size, cell = size + ctx.gap;
  const grid = ctx.grid.value;
  const cx = (t: TraceTile) => t.col * cell + size / 2;
  const cy = (t: TraceTile) => t.row * cell + size / 2;
  const distTo = (p: TracePoint, t: TraceTile) => Math.hypot(p.x - cx(t), p.y - cy(t));
  const tileAt = (r: number, c: number): TraceTile | null =>
    r >= 0 && r < ctx.rows && c >= 0 && c < ctx.cols && grid[r] ? grid[r][c] : null;
  const cellAt = (p: TracePoint, duringDrag: boolean) => {
    const c = Math.floor(p.x / cell), r = Math.floor(p.y / cell);
    if (c < 0 || c >= ctx.cols || r < 0 || r >= ctx.rows) return null;
    if (duringDrag) {
      // commit-to-select: acceptance capped at the tile edge (0.50·s)
      const dx = p.x - (c * cell + size / 2), dy = p.y - (r * cell + size / 2);
      if (Math.hypot(dx, dy) > size * 0.5) return null;
    }
    return { row: r, col: c };
  };

  // heading EMA in px-per-60Hz-frame — GH velocity normalized (units fix; the
  // raw-delta fallback exists for pointer streams with no velocity, e.g. web)
  const prev = ctx.lastPt.value;
  if (prev && nowPt.vx !== undefined && nowPt.vy !== undefined) {
    ctx.hx.value = 0.62 * ctx.hx.value + 0.38 * (nowPt.vx / 60);
    ctx.hy.value = 0.62 * ctx.hy.value + 0.38 * (nowPt.vy / 60);
  } else if (prev) {
    ctx.hx.value = 0.62 * ctx.hx.value + 0.38 * (nowPt.x - prev.x);
    ctx.hy.value = 0.62 * ctx.hy.value + 0.38 * (nowPt.y - prev.y);
  }
  const prevPt = prev;
  ctx.lastPt.value = { x: nowPt.x, y: nowPt.y };
  let path = ctx.path.value.slice();
  const hx = ctx.hx.value, hy = ctx.hy.value;

  // BACKTRACK MAGNET: near the previous tile / heading back inside the ±40°
  // cone pops the last link — unless the finger sits in a NEW linkable core.
  if (path.length > 1) {
    const prevTile = path[path.length - 2];
    const dx = nowPt.x - cx(prevTile), dy = nowPt.y - cy(prevTile);
    const d = Math.hypot(dx, dy);
    const hlen = Math.hypot(hx, hy);
    const headingBack = hlen > 2 && (-dx * hx - dy * hy) / (hlen * Math.max(1, d)) > 0.75;
    let aimingNew = false;
    const fc = Math.floor(nowPt.x / cell), fr = Math.floor(nowPt.y / cell);
    const tn = tileAt(fr, fc);
    if (
      tn && !inPath(path, tn.id) &&
      Math.hypot(nowPt.x - (fc * cell + size / 2), nowPt.y - (fr * cell + size / 2)) < size * 0.55
    ) {
      aimingNew = true;
    }
    if (!aimingNew && (d < size * 0.5 || (headingBack && d < size * 0.85))) {
      ctx.path.value = path.slice(0, -1);
      return;
    }
  }

  // FAST-SWIPE INTERPOLATION: walk prev→now so a flick can't skip a crossed tile
  const step = Math.max(6, size * 0.4);
  const pts: TracePoint[] = [];
  if (prevPt) {
    const segd = Math.hypot(nowPt.x - prevPt.x, nowPt.y - prevPt.y);
    const n = Math.max(1, Math.ceil(segd / step));
    for (let i = 1; i <= n; i++) {
      pts.push({
        x: prevPt.x + ((nowPt.x - prevPt.x) * i) / n,
        y: prevPt.y + ((nowPt.y - prevPt.y) * i) / n,
      });
    }
  } else {
    pts.push(nowPt);
  }

  let changed = false;
  for (let pi = 0; pi < pts.length; pi++) {
    const pt = pts[pi], leading = pi === pts.length - 1;
    // transit-fix signal: closest approach to the tail tile's center
    if (path.length) {
      const tail0 = path[path.length - 1];
      const d0 = distTo(pt, tail0), cur = ctx.depth.value[tail0.id];
      if (cur === undefined || d0 < cur) ctx.depth.value[tail0.id] = d0;
    }
    const c = cellAt(pt, true);
    if (!c) continue;
    const t = tileAt(c.row, c.col);
    if (!t || (path.length && t.id === path[path.length - 1].id)) continue;
    // DEEP RETRACE: crossing back onto an earlier path tile truncates to it
    let idxIn = -1;
    for (let i = 0; i < path.length; i++) if (path[i].id === t.id) { idxIn = i; break; }
    if (idxIn !== -1 && idxIn < path.length - 1) {
      path = path.slice(0, idxIn + 1);
      changed = true;
      continue;
    }
    const last = path[path.length - 1];
    if (!last || inPath(path, t.id) || !adjacentW(last, t)) continue;

    // PREDICTIVE acceptance (leading point only): position+heading blend,
    // dictionary-prefix nudge, clear-top-scorer margin; near-ties defer.
    if (leading) {
      const pvx = pt.x - cx(last), pvy = pt.y - cy(last);
      const plen = Math.hypot(pvx, pvy);
      const hlen = Math.hypot(hx, hy);
      const useH = hlen > 2.5;
      const deep = distTo(pt, t) < size * 0.4; // deep-center override
      if (!deep && plen > size * 0.3) {
        const hw = useH ? Math.min(0.5, 0.28 + hlen / 90) : 0;
        let cur = '';
        for (let i = 0; i < path.length; i++) cur += path[i].letter;
        const score = (tile: TraceTile) => {
          const cdx = tile.col - last.col, cdy = tile.row - last.row;
          const clen = Math.hypot(cdx, cdy);
          const pd = (pvx * cdx + pvy * cdy) / (plen * clen);
          const hd = useH ? (hx * cdx + hy * cdy) / (hlen * clen) : pd;
          const s2 = cur + tile.letter;
          const bias = s2.length <= 6 && ctx.prefixes.value[s2] ? 0.06 : 0;
          return (1 - hw) * pd + hw * hd + bias;
        };
        const mine = score(t);
        if (mine < 0.2) continue; // not where this swipe is going
        let best = -1;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nb = tileAt(last.row + dr, last.col + dc);
            if (!nb || inPath(path, nb.id)) continue;
            const d = score(nb);
            if (d > best) best = d;
          }
        }
        if (mine < best - 0.09) continue; // near-tie: wait for commitment
      }
    }

    // RETROACTIVE TRANSIT FIX — the fat-thumb diagonal swap
    if (path.length >= 2) {
      const pTail = path[path.length - 1];
      const prev2 = path[path.length - 2];
      const dP = ctx.depth.value[pTail.id];
      if (
        adjacentW(prev2, t) &&
        (dP === undefined || dP > size * 0.42) &&
        Date.now() - (ctx.addAt.value[pTail.id] || 0) < 280
      ) {
        path = path.slice(0, -1);
      }
    }
    path = path.concat(t);
    changed = true;
    ctx.addAt.value[t.id] = Date.now();
    ctx.depth.value[t.id] = distTo(pt, t);
  }
  if (changed) ctx.path.value = path;
}
