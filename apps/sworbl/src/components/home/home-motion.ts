// HOME MOTION CONSTANTS + the boot clock's window shaper — shared by the
// home conductor (index) and the sheet dressing (sheet-weather).
//
// SPRINGS (owner: "as smooth as humanly possible"):
// · OPEN: lively, finishes crisp — the game arriving. Overdamped: the open
//   lands DEAD FLAT (owner: no bounce); snap comes from stiffness.
// · PARK: overdamped settle onto the peek with zero bounce; rest thresholds
//   cut the asymptote (the overdamped tail crawled its last pixels).
// · every release INHERITS the finger's velocity — the spring continues the
//   throw instead of restarting from rest (the dead-hand-off fix).
export const OPEN_SPRING = { mass: 0.7, damping: 29, stiffness: 270 };
export const PARK_SPRING = {
  mass: 0.85,
  damping: 30,
  stiffness: 250,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 4,
};

// the dock band: taller grab zone; home content scrolls under it
export const DOCK_H = 106; // sized for the (slightly under board scale) PLAY tiles
export const ASSIST_RISE = 0; // assist rise retired (owner) — kept for the fade window math

// BOOT (the PRO idiom — owner: "how do pro apps usually load in"): the
// screen arrives COMPLETE and settles as ONE unit out of the splash; only
// the living band blooms a beat behind it. One master clock, linear sweep;
// each consumer shapes its own curve inside its window.
export const BOOT_MS = 480;

// cubic ease-out inside a window of the master clock (module-level worklet)
export function bootWindow(m: number, start: number, span: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, (m - start) / span));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}
