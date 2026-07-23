// HOME + THE PLAY SHEET. The board is not a page — it's a sheet you PULL UP
// over home (web parity): it follows the finger both directions, release
// springs it open or back down, and closing pauses the round first.
// Home is the HANDOFF REDESIGN (design_handoff_sworbl_screens 3, turns
// 20a/6a/6b): app bar (person · wordmark · settings) → date header → word
// tiles (dashed pre-play, candy after) → hint slots (blank pre-play; folded
// into the superlatives pager after) → floating stepped podium + you-block →
// swipe dock over the storm. Light + dark via the theme tokens.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Share, Platform, useWindowDimensions,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  withRepeat,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

import Storm from '@/components/game/storm';
import { Floaters } from '@/components/home/floaters';
import { Arrive } from '@/components/arrive';
import { CountdownDock } from '@/components/home/countdown-dock';
import { playMetrics } from '@/components/home/trace-play';
import { AppBar } from '@/components/home/app-bar';
import { DateHeader } from '@/components/home/date-header';
import { FloatingPodium } from '@/components/home/floating-podium';
import { SuperlativesPager } from '@/components/home/superlatives-pager';
import { PlaySheet, type PlaySheetHandle } from '@/components/play-sheet';
import { ARCHETYPE_LABEL } from '@/components/game/result-view';
import { PALETTE, INK, tileColorFor, gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { dealDaily, getDevDay } from '@/game/daily';
import { getDiagnostics } from '@/game/dev-flags';
import { loadDay, saveSheetOpen, wasSheetOpen, getResetNonce, loadDayWords, type DayState } from '@/game/persist';
import { standingsStub, rankFor, type LbEntry } from '@/game/standings';
import { fetchDaily, readCachedField, type RemoteField } from '@/net/standings-remote';
import { loadStats, streakDays } from '@/game/stats';
import { buildShareText } from '@/game/share';
import { StandingsList, type StandingRow } from '@/components/home/standings-list';
import { getPlayerName } from '@/game/player';
import { useDayKey } from '@/game/use-day-key';
import { haptic } from '@/game/haptics';

// MOTION (owner: "as smooth as humanly possible"):
// · OPEN spring: lively, finishes crisp — the game arriving
// · PARK spring: overdamped — the sheet settles onto the peek with zero
//   bounce (a bounce there fights the face crossfade and reads as jitter)
// · every release INHERITS the finger's velocity — the spring continues the
//   throw instead of restarting from rest (the dead-hand-off fix)
const OPEN_SPRING = { mass: 0.7, damping: 29, stiffness: 270 }; // overdamped —
// the open lands DEAD FLAT (owner: no bounce), snap comes from stiffness
// park lands FLAT and ENDS CRISP (owner: the overdamped tail crawled its
// last pixels for ~a second) — rest thresholds cut the asymptote
const PARK_SPRING = {
  mass: 0.85,
  damping: 30,
  stiffness: 250,
  restDisplacementThreshold: 0.4,
  restSpeedThreshold: 4,
};

const twistLabel = (a: string) => ARCHETYPE_LABEL[a] ?? null;

// THE REVEAL FLIP (owner: 'the wordle character reversal') — each answer
// tile flips over on arrival, staggered down the word: mono back → candy
// face at the halfway point, exactly the Wordle reveal grammar in sworbl
// candy. Shared values only.
function FlipTile({ ch, i, w, h, r, palBg, palEdge, monoBg, monoEdge }: {
  ch: string; i: number; w: number; h: number; r: number;
  palBg: string; palEdge: string; monoBg: string; monoEdge: string;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(200 + i * 160, withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pose = useAnimatedStyle(() => {
    const deg = interpolate(p.value, [0, 1], [0, 180]);
    const flipped = p.value > 0.5;
    return {
      transform: [{ perspective: 600 }, { rotateX: `${deg}deg` }],
      backgroundColor: flipped ? palBg : monoBg,
      boxShadow: `inset 0 -5px 0 ${flipped ? palEdge : monoEdge}, 0 2px 3px rgba(0,0,0,0.3)`,
    };
  });
  const inkPose = useAnimatedStyle(() => ({
    opacity: p.value > 0.5 ? 1 : 0,
    // the face is mid-flip mirrored — counter-rotate the letter upright
    transform: [{ rotateX: p.value > 0.5 ? '180deg' : '0deg' }],
  }));
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: r, alignItems: 'center', justifyContent: 'center' },
        pose,
      ]}>
      <Animated.Text
        style={[
          { fontFamily: 'Fredoka_600SemiBold', color: INK, includeFontPadding: false, fontSize: Math.round(w * 0.57) },
          inkPose,
        ]}>
        {ch.toUpperCase()}
      </Animated.Text>
    </Animated.View>
  );
}



// BOOT CHOREOGRAPHY v3 (owner: "a chain reaction... one fell swoop...
// perfectly flawless flow"). ONE master clock sweeps 0→1; every section
// reads its own window of it. One clock = one wave: the timing between
// links is mathematically continuous, not four timers approximating each
// other, and the band is simply the last link of the same motion.
const BOOT_MS = 720;
const BOOT_STEP = 0.13; // each link ignites when the previous is ~1/4 in
const BOOT_SPAN = 0.5; // each link's slice of the master clock

// cubic ease-out inside a window of the master clock (module-level worklet)
function bootWindow(m: number, start: number, span: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, (m - start) / span));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function BootRise({ i, boot, style, children }: {
  i: number; boot: SharedValue<number>; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const pose = useAnimatedStyle(() => {
    const p = bootWindow(boot.value, i * BOOT_STEP, BOOT_SPAN);
    return {
      opacity: p,
      transform: [{ translateY: (1 - p) * 10 }],
    };
  });
  return <Animated.View style={[style, pose]}>{children}</Animated.View>;
}

// the six blank hint slots: staggered widths, NO letter-count leak. SMALLER
// than the hero word blocks in both axes (owner: the placeholders were
// out-measuring the word of the day — the hierarchy was upside down)
const HINT_SLOT_W = [40, 36, 44, 38, 36, 42];

// the frosted dock band: taller grab zone; home content scrolls UNDER it to
// the screen's bottom edge and blurs out; "swipe to play" always rides on top
const DOCK_H = 106; // sized for the (slightly under board scale) PLAY tiles
const ASSIST_RISE = 0; // assist rise retired (owner) — constant kept for the fade window math

// (the frost/glass era is over — owner: the pull RIDES THE STORM UP now;
// no blur ever rides the moving sheet, which is also the cheaper path)

// the COLOR WASH (owner): during the pull the whole emerging sheet IS the
// six hues — the board's real surface only takes over at the settle
const WASH_HUES = ['#A78BFA', '#5BC8F5', '#5FD6A8', '#F58FB8', '#F5B84A', '#F58A66'] as const;

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  // DAY ROLLOVER (audit blocker fix): the deal follows the calendar, not the
  // process lifetime. Policy: never re-deal mid-round — a day flip while the
  // sheet is open HOLDS yesterday's board until the sheet closes (the round
  // finishes honestly against yesterday's keys), then the new day arrives.
  const dayKey = useDayKey();
  const [activeDayKey, setActiveDayKey] = useState(dayKey);
  // devDay/nonce/diag as STATE snapshots (house rule: module reads in render
  // are invisible to the React Compiler — it caches the JSX; the dev screen's
  // frozen toggles were this exact bug). Refreshed on every focus.
  const [devSnap, setDevSnap] = useState(() => ({
    devDay: getDevDay(),
    nonce: getResetNonce(),
    diag: getDiagnostics(),
  }));
  const deal = useMemo(() => dealDaily(), [activeDayKey, devSnap.devDay]);

  // (rollover gate lives below the sheet state — it must see sheetOpen)

  // ---- day state (re-read on focus AND on sheet close) ----
  const [day, setDay] = useState<DayState | null>(null);
  const refreshDay = useCallback(() => {
    if (deal) setDay(loadDay(deal.dayKey));
    if (__DEV__) setDevSnap({ devDay: getDevDay(), nonce: getResetNonce(), diag: getDiagnostics() });
  }, [deal]);
  useFocusEffect(refreshDay);

  const stats = useMemo(() => loadStats(), [day]); // re-read when the day state moves
  const streak = useMemo(() => streakDays(stats), [stats]);
  const played = day?.route === 'consumed';
  const solved = played && !!day?.sworb?.solved;
  const inProgress = day?.route === 'resume' || day?.route === 'finale';

  // standings, LIVE-FIRST (owner: cold launch flashed fake names): the
  // cached real field renders instantly; the fresh answer swaps in silently.
  // First-ever launch has no cache → the honest ghost skeleton, and the
  // field FADES IN when data arrives (never a spinner, never a stub).
  const [remote, setRemote] = useState<RemoteField | null>(() =>
    deal ? readCachedField(deal.dayKey) : null
  );
  useEffect(() => {
    let live = true;
    if (deal) {
      fetchDaily(deal.dayKey).then((r) => {
        if (live && r && r.entries.length) setRemote(r);
      });
    }
    return () => {
      live = false;
    };
  }, [deal, day]);
  const entries = useMemo(
    () => remote?.entries ?? (deal ? standingsStub(deal.dayKey) : []),
    [remote, deal]
  );
  const myScore = played ? (day?.score ?? 0) : inProgress ? (day?.run?.score ?? 0) : 0;
  const you = played || (inProgress && myScore > 0)
    ? { score: myScore, rank: rankFor(entries, myScore) }
    : null;
  // ONE combined order (owner): you spliced at your true rank — the podium
  // takes 1-3 (you can BE on it), the list takes 4-10, and past-10 you ride
  // below an ellipsis. Unplayed → a dashed ghost row instead.
  const standings = useMemo(() => {
    const rows: StandingRow[] = entries.map((e, i) => ({
      rank: i + 1, name: e.name, score: e.score, you: !!e.isMe,
    }));
    // splice ONLY into stub fields — a remote field already contains you
    // (the double-you bug: server row + local splice, same score, #1/#2)
    if (you && !remote) {
      rows.splice(you.rank - 1, 0, { rank: you.rank, name: getPlayerName(), score: you.score, you: true });
      rows.forEach((r, i) => (r.rank = i + 1));
    }
    const podium: LbEntry[] = rows.slice(0, 3).map((r) => ({ name: r.name, score: r.score, solved: true }));
    const youRow = rows.find((r) => r.you) ?? null;
    const list = rows.slice(3, 10);
    const youOutside = youRow && youRow.rank > 10 ? youRow : null;
    return { podium, list, youOutside };
  }, [entries, you]);

  // ---- UI RESTORATION (owner): killed-in-background with the board open →
  // relaunch OPENS the sheet again, paused (tap-to-resume cover). Decided
  // SYNCHRONOUSLY before first render so the sheet never animates in and the
  // arm effect never sees a fake dock edge. Next-day relaunch: wasSheetOpen
  // discards the stale flag, and the day-keyed run snapshot can't load for
  // the new day anyway — fresh home, new board.
  const bootOpen = useMemo(() => {
    if (!deal) return false;
    if (!wasSheetOpen(deal.dayKey)) return false;
    const d = loadDay(deal.dayKey);
    return d.route === 'resume' || d.route === 'finale';
  }, [deal]);

  // ---- THE SHEET (Maps model, owner): it NEVER fully closes — "closed"
  // parks it at a PEEK at the bottom edge (the frosted swipe-to-play band IS
  // the sheet's collapsed face), full-screen = the game. ----
  const peekH = DOCK_H + insets.bottom;
  const closedY = height - peekH; // rest position: only the peek visible
  const sheetY = useSharedValue(bootOpen ? 0 : closedY); // closedY = peek, 0 = open
  // TRACE TO PLAY: 0-4 lit tiles; the open gesture is DUAL-MODE — the first
  // decisive movement axis picks trace (horizontal) or sheet-pull (vertical)
  const sLit = useSharedValue(0);
  const sMode = useSharedValue(0); // 0 tracing · 3 launch fired
  const sGrab = useSharedValue(0); // finger-to-sheet-top gap at touch (owner:
  // the assist-raised sheet SNAPPED to the finger on the first pull frame)
  const sArmed = useSharedValue(0); // PLAY traced → swipe unlocked
  const sGlow = useSharedValue(0); // aurora intensity: muted → FULL GLOW on arm (owner)
  const sPoke = useSharedValue(-1); // out-of-sequence tap: counter*4 + tileIdx
  const [armed, setArmed] = useState(false);
  const sSquash = useSharedValue(1); // candy squash when the sheet docks at full
  const sDetent = useSharedValue(0); // 1 once the pull crosses the commit line
  const [sheetOpen, setSheetOpen] = useState(bootOpen); // fully open → home drag off, round armed
  const sheetRef = useRef<PlaySheetHandle>(null);

  // the rollover gate: adopt the new day only while no round is in flight
  useEffect(() => {
    if (dayKey !== activeDayKey && !sheetOpen) setActiveDayKey(dayKey);
  }, [dayKey, activeDayKey, sheetOpen]);

  // SELF-HEAL (hot-reload stranding): Reanimated PRESERVES shared values
  // across Fast Refresh while React state resets — a refresh mid-open left
  // sheetY at 0 with sheetOpen false, parking the sheet over the whole
  // screen and eating every touch ("swipe up broken", "stuck on top").
  // Whenever the sheet is logically closed, its position must agree.
  const closingRef = useRef(false); // an ANIMATED close is in flight
  useEffect(() => {
    // hot-reload stranding guard ONLY — it must never kill a real close's
    // park spring (it was snapping every ✕ close and cancelling the spring
    // callback, which left PLAY armed — owner report)
    if (!sheetOpen && !closingRef.current) sheetY.value = closedY;
  }, [sheetOpen, closedY]);

  // everything a close must guarantee, applied UP-FRONT (sync) — never
  // gambled on an animation callback that a cancellation can eat
  const finishClose = useCallback(() => {
    setSheetOpen(false);
    saveSheetOpen(null); // a closed sheet must never restore
    sLit.value = 0;
    sMode.value = 0;
    sArmed.value = 0;
    sGlow.value = 0;
    setArmed(false); // the door re-locks: fresh swipe next time
    if (armIdle.current) clearTimeout(armIdle.current);
  }, []);
  const closeSettled = useCallback(() => {
    closingRef.current = false;
  }, []);
  const closeSheet = useCallback(() => {
    sheetRef.current?.pauseForClose();
    // AUDIT BLOCKER #1: sheetOpen flips false SYNCHRONOUSLY at close-start;
    // closingRef keeps the self-heal's hands off the park spring
    closingRef.current = true;
    finishClose();
    requestAnimationFrame(() => {
      // the spring starts one frame AFTER the close's JS burst (state batch)
      // — its first frames stay clean
      sheetY.value = withSpring(closedY, PARK_SPRING, () => {
        'worklet';
        runOnJS(closeSettled)();
      });
    });
    // day state may have changed inside the round (finish/lock)
    setTimeout(refreshDay, 300);
  }, [closedY, refreshDay, finishClose, closeSettled]);

  // pull UP from the dock: the sheet (pre-mounted, hidden) rides the finger —
  // pure transform on the UI thread, nothing mounts mid-gesture.
  const markOpen = useCallback(() => {
    if (armIdle.current) clearTimeout(armIdle.current); // launched — no disarm
    setSheetOpen(true);
    if (deal) saveSheetOpen(deal.dayKey); // reclaim-proof: the sheet remembers
    haptic.soft(); // the dock beat — launching the game from the bottom
  }, [deal]);
  // the DETENT: a tick the instant the pull crosses the commit threshold —
  // the hand learns "release now and it opens" without reading anything.
  // RATE-LIMITED (owner: slow-drag jank synced with haptics): a hover at the
  // boundary must never machine-gun the feedback generator
  const lastDetent = useRef(0);
  const detentIn = useCallback(() => {
    const now = Date.now();
    if (now - lastDetent.current < 220) return;
    lastDetent.current = now;
    haptic.tick(3);
  }, []);
  const detentOut = useCallback(() => {
    const now = Date.now();
    if (now - lastDetent.current < 220) return;
    lastDetent.current = now;
    haptic.tick(1);
  }, []);

  // a CONSUMED day is closed for business (owner): the dock is just the
  // countdown — the swipe doesn't react, the sheet never opens again
  const traceIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceBeat = useCallback(
    (n: number) => {
      haptic.tick(n + 1);
      if (traceIdle.current) clearTimeout(traceIdle.current);
      if (n < 3) {
        traceIdle.current = setTimeout(() => {
          sLit.value = 0;
        }, 1600);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // the wrong-tile head-shake's whisper of a haptic (tap path only)
  const nudgeBeat = useCallback(() => {
    haptic.soft();
  }, []);
  // stage 1 complete: PLAY lit → the row morphs to the chevron, swipe unlocks.
  // No swipe within the window → DISARM: the chevron gives way and the tiles
  // melt back in a reverse cascade (owner: the return must feel gratifying).
  const armIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarm = useCallback(() => {
    sArmed.value = 0;
    sGlow.value = withTiming(0, { duration: 420 }); // the weather calms back down
    setArmed(false);
    sLit.value = 0; // the tiles RAIN BACK IN gray (trace-play owns the fall)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedY]);
  // the Y's tick must LAND before the arm thump (owner: fast traces stacked
  // both haptics on one beat) — the arm statement waits one clear moment
  const armSoon = useCallback(() => {
    setTimeout(() => armNowRef.current(), 170);
  }, []);
  const armNow = useCallback(() => {
    if (traceIdle.current) clearTimeout(traceIdle.current);
    haptic.good();
    setArmed(true);
    // the aurora IGNITES with the arm (owner: "turns on when you swipe to
    // play and glows with intensity") — muted weather until the door opens
    sGlow.value = withTiming(1, { duration: 620 });
    // (assist rise removed — owner: caused more issues than it was worth)
    if (armIdle.current) clearTimeout(armIdle.current);
    armIdle.current = setTimeout(disarm, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disarm, closedY]);
  const armNowRef = useRef(armNow);
  armNowRef.current = armNow;
  const pm = playMetrics(width);
  // TWO-STAGE DOOR (owner): trace P·L·A·Y to unlock, then the chevron —
  // swipe up launches. The trace teaches the verb; the swipe starts the day.
  const openDrag = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!sheetOpen && !played)
        .minDistance(4)
        .onBegin((e) => {
          'worklet';
          // anchor the grab: the pull preserves THIS gap instead of snapping
          // the sheet's top edge to the finger
          sGrab.value = e.absoluteY - sheetY.value;
          if (sArmed.value) return;
          const idx = Math.floor((e.absoluteX - pm.left) / (pm.tile + pm.gap));
          // a TAP only takes the NEXT tile (owner: 'you MUST hit them all
          // yourself' — tapping Y cannot light the word behind it). A drag
          // still lights pass-through tiles: the finger physically crossed.
          if (idx >= 0 && idx < 4 && idx === sLit.value) {
            sLit.value = idx + 1;
            runOnJS(traceBeat)(idx);
            if (idx === 3) {
              sArmed.value = 1; // input locks NOW; the ceremony follows the tick
              runOnJS(armSoon)();
            }
          } else if (idx >= 0 && idx < 4) {
            // wrong tile: SEEN, not taken — it shakes its head (owner: "if
            // i just hit LA i'd expect to see it react"). Tap path only; a
            // drag sweeping across tiles must not rattle the row.
            sPoke.value = (Math.floor(Math.max(0, sPoke.value) / 4) + 1) * 4 + idx;
            runOnJS(nudgeBeat)();
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (!sArmed.value) {
            const idx = Math.floor((e.absoluteX - pm.left) / (pm.tile + pm.gap));
            // STRICT sequence in the drag path too (owner: starting on Y and
            // wiggling armed the row) — only the NEXT tile ever lights; real
            // sweeps emit events in every tile, so P→L→A→Y still flows
            if (idx >= 0 && idx < 4 && idx === sLit.value) {
              sLit.value = idx + 1;
              runOnJS(traceBeat)(idx);
              if (idx === 3) {
                sArmed.value = 1; // input locks NOW; the ceremony follows the tick
                runOnJS(armSoon)();
              }
            }
            return;
          }
          if (sMode.value === 3) return;
          // stage 2: the pull preserves the grab offset — continuous from
          // wherever the sheet was resting (assist rise included)
          sheetY.value = Math.min(closedY, Math.max(0, e.absoluteY - sGrab.value));
          // (the mid-swipe detent tick was owner-removed — the ONLY beat on
          // the way up is the dock landing; the close drag keeps its detent)
        })
        .onEnd((e) => {
          'worklet';
          sDetent.value = 0;
          if (!sArmed.value || sMode.value === 3) return;
          const risen = closedY - sheetY.value;
          if (risen > height * 0.22 || e.velocityY < -900) {
            sMode.value = 3;
            sheetY.value = withSpring(0, { ...OPEN_SPRING, velocity: e.velocityY });
            runOnJS(markOpen)();
          } else {
            sheetY.value = withSpring(closedY, { ...PARK_SPRING, velocity: e.velocityY });
            runOnJS(disarm)(); // released without committing → PLAY melts back NOW
          }
        }),
    [width, height, closedY, sheetOpen, played, markOpen, traceBeat, nudgeBeat, armSoon, disarm]
  );

  // close drag (home owns sheetY): the round pauses ONLY when the close
  // COMMITS (owner: an aborted swipe-down must not restart the count-in —
  // the round simply never stopped). A mid-drag glimpse can't be traced, so
  // fairness holds.
  const parkBeat = useCallback(() => haptic.soft(), []);
  const commitClose = useCallback(() => {
    sheetRef.current?.pauseForClose();
    closingRef.current = true;
    finishClose();
    setTimeout(refreshDay, 300);
  }, [finishClose, refreshDay]);
  const closeDrag = useMemo(
    () =>
      Gesture.Pan()
        // MUST be gated: at the peek rest this gesture's from-zero translation
        // math would TELEPORT the sheet on a downward touch
        .enabled(sheetOpen)
        .activeOffsetY(15)
        .onUpdate((e) => {
          'worklet';
          sheetY.value = Math.min(closedY, Math.max(0, e.translationY));
          const past = e.translationY > height * 0.25 ? 1 : 0;
          if (past !== sDetent.value) {
            sDetent.value = past;
            if (past) runOnJS(detentIn)();
            else runOnJS(detentOut)();
          }
        })
        .onEnd((e) => {
          'worklet';
          sDetent.value = 0;
          if (e.translationY > height * 0.25 || e.velocityY > 900) {
            // commit: deactivate NOW (blocker #1 — never let the arm effect
            // re-fire while the sheet slides away)
            runOnJS(commitClose)();
            sheetY.value = withSpring(closedY, { ...PARK_SPRING, velocity: e.velocityY }, (fin) => {
              'worklet';
              if (fin) runOnJS(parkBeat)(); // the soft "docked at the peek" tap
              runOnJS(closeSettled)();
            });
          } else {
            // abort: the round never paused — the sheet just springs back
            sheetY.value = withSpring(0, { ...OPEN_SPRING, velocity: e.velocityY });
          }
        }),
    [height, closedY, sheetOpen, commitClose, detentIn, detentOut]
  );

  // PERF: transform ONLY — animating border radius on a clipped full-screen
  // view re-clips the whole game subtree every frame (the pull jank). The
  // radius is a constant 22: invisible at dock (dark-on-dark, notch region).
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      // scaleY is center-origin — the translate compensation anchors the
      // squash to the BOTTOM edge so the top visibly dips, tile-style.
      // Math.max(0,…): the open spring may OVERSHOOT past the top — clamped
      // so the sheet never rides above dock (the "cheap boing" artifact);
      // the squash is the only landing statement.
      { translateY: Math.max(0, sheetY.value) + (height * (1 - sSquash.value)) / 2 },
      { scaleY: sSquash.value },
    ],
  }));
  // NO BLUR (owner: drag jank — "just delete it"). A plain dark scrim fades
  // with the pull instead: one opacity on one solid view, compositing-only.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, closedY], [0.55, 0], Extrapolation.CLAMP),
  }));
  // PARALLAX RECEDE (owner trio): home scales back as the sheet rises — the
  // sheet reads as physically ABOVE the screen (App Store card idiom)
  const homeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(sheetY.value, [0, closedY], [0.94, 1], Extrapolation.CLAMP) },
    ],
  }));
  // the collapsed FACE (frost + swipe-to-play) and the GAME crossfade as the
  // sheet travels — single-layer opacities, compositing-cheap
  const faceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [closedY - 170, closedY - 50], [0, 1], Extrapolation.CLAMP),
  }));
  // aurora weather: CALM at rest (dimmed under the frost), IGNITED when the
  // door arms — brightness + a slow swell, nothing layout-touching. At boot
  // the weather ROLLS IN over 600ms instead of popping with the Skia canvas
  // (owner audit: the color pop read as a glitch)
  const sBoot = useSharedValue(0);
  useEffect(() => {
    // the MASTER CLOCK: linear sweep — each link shapes its own curve
    // inside its window, so the wave itself never decelerates mid-chain
    sBoot.value = withDelay(20, withTiming(1, { duration: BOOT_MS, easing: Easing.linear }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // RIDE THE STORM UP (owner pick): the aurora is glued to the sheet's top
  // edge, so the pull literally drags the weather up the screen. Travel
  // SWELLS it (scale from the top edge, blobs spreading over the emerging
  // surface) and BRIGHTENS it to full burn; near full-open it dissolves and
  // the board stands alone. All interpolation off sheetY — butter by
  // construction, and no blur ever rides the moving sheet.
  const stormRideStyle = useAnimatedStyle(() => {
    const travel = interpolate(sheetY.value, [0, closedY], [1, 0], Extrapolation.CLAMP);
    const calm = 0.45 + sGlow.value * 0.55; // parked: muted → armed: ignited
    const burn = interpolate(travel, [0, 0.3], [calm, 1], Extrapolation.CLAMP);
    // dissolve EARLIER — the crest hands the screen to the board while the
    // pull still has momentum (owner: the late overlap smeared)
    const settle = interpolate(travel, [0.55, 0.8], [1, 0], Extrapolation.CLAMP);
    return {
      opacity: bootWindow(sBoot.value, 4 * BOOT_STEP, BOOT_SPAN) * burn * settle,
      transform: [
        // a crest of light riding the leading edge — brightness carries the
        // drama; the big stretch smeared hues over the board (owner)
        { scale: 1 + sGlow.value * 0.06 + travel * 0.35 },
      ],
    };
  }, [closedY]);
  // the WASH: mid-pull the sheet's whole face is color; it lets go right at
  // the settle so the real surface arrives as the sheet docks (owner). One
  // static gradient, opacity-only — compositing-cheap, and the game subtree
  // underneath stays opaque (no alpha-group tax during the drag).
  const washStyle = useAnimatedStyle(() => {
    const travel = interpolate(sheetY.value, [0, closedY], [1, 0], Extrapolation.CLAMP);
    const build = interpolate(travel, [0.06, 0.32], [0, 1], Extrapolation.CLAMP);
    const reveal = interpolate(travel, [0.78, 0.97], [1, 0], Extrapolation.CLAMP);
    return { opacity: build * reveal };
  }, [closedY]);
  // the band pair (aurora + PLAY tiles) fades in as ONE at boot
  const bandInStyle = useAnimatedStyle(() => ({
    opacity: bootWindow(sBoot.value, 4 * BOOT_STEP, BOOT_SPAN),
  }));
  // (the pending beacon strips were owner-removed — "weird spaced out
  // ovals" once the invisible park exposed them; the free-floating aurora
  // plus the arm ignition IS the pending signal)
  // the game SURFACE must exist from the FIRST pixel of travel — and the
  // fade window is deliberately SHORT: while it runs, the whole game subtree
  // pays for an offscreen alpha group (the pull-fluidity tax the owner felt).
  // 52px of travel, then the layer is solid and compositing is free.
  // PREWARM (owner: first pull hesitated, later pulls fine): at boot the
  // game layer has never painted — the first drag paid the entire subtree's
  // initial rasterization (tiles + 29 Skia paths) mid-gesture. For ~1s after
  // mount it renders at 1.2% opacity (imperceptible under the frost), so the
  // texture upload happens while the player is still reading home.
  // prewarm WINDOW moved past the boot sweep (owner: "jenk in the loading"
  // — the whole game subtree was rasterizing at 1.2% opacity from frame 1,
  // fighting the choreography for the raster budget). A human needs well
  // over a second to read home and trace P·L·A·Y, so warming at 950ms still
  // beats the first possible pull.
  const sWarm = useSharedValue(0);
  useEffect(() => {
    const t1 = setTimeout(() => {
      sWarm.value = 1;
    }, 950);
    const t2 = setTimeout(() => {
      sWarm.value = 0;
    }, 2100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  const gameStyle = useAnimatedStyle(() => ({
    opacity: Math.max(
      sWarm.value * 0.012,
      // a LONGER arrival than the frost era's 52px (no blur to pay for now):
      // the board breathes in under the glow crest instead of popping solid
      // behind it (owner: the bleed into the gameboard looked bad)
      interpolate(sheetY.value, [closedY - 140, closedY - 24], [1, 0], Extrapolation.CLAMP)
    ),
  }));
  // (the matched-geometry grabber pill was owner-removed — the ✕ button and
  // the paused-cover tap are the explicit affordances now)

  const wordLen = deal?.sworb.length ?? 5;
  // 46 was the 300px design-mock cap — real phones earn bigger blocks; the
  // word of the day is the hero and must dominate everything under it
  const tileW = Math.min(56, Math.floor((Math.min(width, 480) - 36 - (wordLen - 1) * 8) / wordLen));
  const tileH = Math.round(tileW * (50 / 46));
  const tileR = Math.round(tileW * (13 / 46));

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {/* fully occluded at dock — stop paying for goo + floaters under an
          opaque sheet */}
      {!sheetOpen && <Floaters width={width} height={height} />}

      <Animated.View style={[styles.safe, homeStyle]}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <AppBar
          theme={theme}
          onPerson={() => router.push('/profile')}
          onSettings={() => router.push('/settings')}
        />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: DOCK_H + insets.bottom + 10 }]}
          showsVerticalScrollIndicator={false}>
          {deal && (
            <BootRise i={0} boot={sBoot}>
            <DateHeader
              theme={theme}
              dayKey={deal.dayKey}
              score={played && you ? you.score : null}
              streak={streak}
              onInfo={!played ? () => router.push('/how-to') : undefined}
              onShare={() =>
                deal &&
                Share.share({
                  message: buildShareText({
                    dayKey: deal.dayKey,
                    archetypeLabel: deal.archetype ? twistLabel(deal.archetype) : null,
                    clues: deal.clues,
                    found: day?.found ?? [],
                    solved,
                    guessesUsed: day?.sworb?.guessesUsed ?? 0,
                    score: you?.score ?? 0,
                    streak,
                  }),
                }).catch(() => {})
              }
            />
            </BootRise>
          )}

          {/* word of the day: candy bloom when the day is done, dashed
              blanks before (the answer is hidden — no spoilers) */}
          <BootRise i={1} boot={sBoot} style={styles.heroRow}>
            {played && deal
              ? [...deal.sworb].map((ch, i) => {
                  const pal = PALETTE[tileColorFor(ch, i)];
                  return (
                    <FlipTile
                      key={`${deal.dayKey}-${i}`}
                      ch={ch}
                      i={i}
                      w={tileW}
                      h={tileH}
                      r={tileR}
                      palBg={pal.bg}
                      palEdge={pal.edge}
                      monoBg={gameSurface(theme.mode).mono.bg}
                      monoEdge={gameSurface(theme.mode).mono.edge}
                    />
                  );
                })
              : Array.from({ length: wordLen }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.heroBlock,
                      {
                        width: tileW, height: tileH, borderRadius: tileR,
                        borderWidth: 2, borderStyle: 'dashed', borderColor: theme.dashed,
                      },
                    ]}
                  />
                ))}
          </BootRise>
          {played && !solved && (
            <Text style={[styles.missLine, { color: theme.sub }]}>
              not cracked — tomorrow's another sworbl
            </Text>
          )}
          {played && deal?.archetype && twistLabel(deal.archetype) && (
            <View style={styles.twistPill}>
              <Text style={styles.twistText}>today's twist: {twistLabel(deal.archetype)}</Text>
            </View>
          )}

          {/* pre-play: six BLANK hint slots (no letter counts, no spoilers).
              post-play the clue intel lives inside the superlatives pager. */}
          {!played && (
            <BootRise i={2} boot={sBoot} style={styles.hintRow}>
              {HINT_SLOT_W.map((w, i) => (
                <View
                  key={i}
                  style={[styles.hintSlot, { width: w, backgroundColor: theme.card }]}
                />
              ))}
            </BootRise>
          )}

          {played && deal && (
            <BootRise i={2} boot={sBoot} style={styles.pagerWrap}>
            <SuperlativesPager
              theme={theme}
              bestWords={day?.bestWords ?? []}
              foundClues={day?.found ?? []}
              clues={deal.clues}
              totalWords={loadDayWords(deal.dayKey).length}
            />
            </BootRise>
          )}

          {/* standings section — ONLY the chart button opens the leaderboard
              (owner: not the whole section, "just that button haha") */}
          <BootRise i={3} boot={sBoot} style={styles.standingsWrap}>
            <View style={styles.standingsHead}>
              <Text style={[styles.standingsTitle, { color: theme.sub }]}>
                standings
                {__DEV__ && devSnap.diag ? `  ·  ${entries.length} in field` : ''}
              </Text>
              <Pressable
                onPress={() => router.push('/leaderboard')}
                hitSlop={10}
                style={[styles.chartBtn, { backgroundColor: theme.card }]}>
                {Platform.OS === 'ios' ? (
                  <SymbolView name={'chart.line.uptrend.xyaxis' as never} size={16} tintColor="#8971FF" />
                ) : (
                  <Text style={styles.chartGlyph}>↗</Text>
                )}
              </Pressable>
            </View>
            <Arrive ready={entries.length > 0} style={styles.arriveWrap}>
              <FloatingPodium
                theme={theme}
                entries={standings.podium}
                you={null}
                showTitle={false}
                showFoot={false}
              />
              {standings.podium.length === 0 ? (
                // TRULY EMPTY field (audit): the ghost podium already says
                // it — piling dashed rows + a ghost-you underneath tripled
                // the message and walled the screen in wireframe
                <Text style={[styles.fieldAwait, { color: theme.faint }]}>
                  first scores land here today
                </Text>
              ) : (
                <StandingsList
                  theme={theme}
                  rows={standings.list}
                  youOutside={standings.youOutside}
                  // the dashed seat only when you're truly ABSENT from the field —
                  // a podium #1 doesn't need a placeholder chair (owner)
                  ghost={!you && !entries.some((e) => e.isMe)}
                  emptyRows={entries.length <= 3 && entries.length > 0 ? 3 : 0}
                />
              )}
            </Arrive>
          </BootRise>
        </ScrollView>

      </SafeAreaView>
      </Animated.View>

      {/* dark scrim under the rising sheet (blur deleted — owner call) */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}
      />

      {/* THE SHEET — ALWAYS PRESENT (Maps model): parked as the frosted
          swipe-to-play peek at the bottom, full-screen when pulled up. The
          peek face and the game crossfade during travel. */}
      {deal && (
        <GestureDetector gesture={openDrag}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.sheetClip}>
            {/* the GAME layer (opaque) — transparent at peek so the frost
                below can sample home */}
            <Animated.View
              style={[styles.gameLayer, { backgroundColor: gameSurface(theme.mode).bg }, gameStyle]}>
              <PlaySheet
                key={`${deal.dayKey}:${devSnap.nonce}`}
                ref={sheetRef}
                onClose={closeSheet}
                active={sheetOpen}
                closeGesture={closeDrag}
              />
            </Animated.View>
            {/* the COLOR WASH: mid-pull the emerging sheet's face is pure
                hue; it dissolves at the settle and the board's real surface
                takes over (owner) */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, washStyle]}>
              <LinearGradient
                colors={[...WASH_HUES]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            {/* THE STORM, glued to the sheet's top edge — it rides the pull,
                swelling and burning over the emerging board, then settles */}
            <Animated.View
              pointerEvents="none"
              style={[styles.stormRide, { height: Math.round(peekH * 1.6) }, stormRideStyle]}>
              {/* 1.6× the band: the canvas's bottom-melt zone hangs BELOW the
                  screen at park (lip stays full) and dissolves the glow into
                  the board mid-pull — no hard stop line (owner) */}
              <Storm width={width} height={Math.round(peekH * 1.6)} zoom={2.2} />
            </Animated.View>
            {/* the COLLAPSED FACE: swipe-to-play/countdown */}
            <Animated.View
              pointerEvents="none"
              style={[styles.peekFace, { height: peekH }, faceStyle]}>
              <Animated.View
                style={[
                  styles.dockInner,
                  { flex: 0, height: peekH, paddingBottom: Math.max(insets.bottom, 14) },
                  bandInStyle,
                ]}>
                <CountdownDock
                  played={played} sLit={sLit} sPoke={sPoke} armed={armed}
                  tile={pm.tile} gap={pm.gap}
                />
              </Animated.View>
              {__DEV__ && devSnap.diag && (
                <Text style={styles.devBand}>
                  {deal?.dayKey ?? 'no-deal'}·{day?.route ?? 'no-day'}·{played ? 'played' : 'open'}
                  {devSnap.devDay ? '·OVERRIDE' : ''}
                </Text>
              )}
            </Animated.View>
            </View>
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: '#000000',
  },
  // the storm rides the sheet's TOP edge; scaling from that edge lets the
  // swell spread DOWN over the emerging board during the pull
  stormRide: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    transformOrigin: '50% 0%',
  },
  safe: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14, // IDENTICAL header position on every screen
    paddingBottom: 12,
    gap: 22,
    alignItems: 'center',
  },
  dockInner: {
    flex: 1,
    justifyContent: 'center',
  },
  // shadow lives on the OUTER (unclipped) layer — overflow:hidden on the
  // same node would swallow it; the inner sheetClip owns the radius mask
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    zIndex: 20,
  },
  sheetClip: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  gameLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  peekFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  devBand: {
    position: 'absolute',
    top: 2,
    right: 8,
    fontSize: 8,
    fontFamily: 'Fredoka_600SemiBold',
    color: '#F5B84A',
    opacity: 0.7,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  heroBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: INK,
    includeFontPadding: false,
  },
  missLine: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12.5,
    marginTop: -6,
  },
  pagerWrap: {
    alignSelf: 'stretch',
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -6,
  },
  scoreBig: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  scoreUnit: {
    fontSize: 13,
  },
  scoreRank: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    color: '#8971FF',
  },
  shareChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twistPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(137,113,255,0.14)',
    marginTop: -4,
  },
  twistText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#8971FF',
  },
  hintRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  standingsWrap: {
    alignSelf: 'stretch',
    gap: 12,
  },
  arriveWrap: {
    alignSelf: 'stretch',
    gap: 12, // same rhythm as standingsWrap — the wrapper is invisible
  },
  standingsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  standingsTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 16,
  },
  chartBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartGlyph: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#8971FF',
  },
  // solid low-contrast cards (owner audit): the HERO owns the dash idiom —
  // a second row of dashes read as wireframe, not mystery
  hintSlot: {
    height: 33,
    borderRadius: 11,
  },
  fieldAwait: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 6,
  },
});
