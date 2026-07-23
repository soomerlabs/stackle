// HOME + THE PLAY SHEET. The board is not a page — it's a sheet you PULL UP
// over home (web parity): it follows the finger both directions, release
// springs it open or back down, and closing pauses the round first.
// Home is the HANDOFF REDESIGN (design_handoff_sworbl_screens 3, turns
// 20a/6a/6b): app bar (person · wordmark · settings) → date header → word
// tiles (dashed pre-play, candy after) → hint slots (blank pre-play; folded
// into the superlatives pager after) → floating stepped podium + you-block →
// swipe dock over the storm. Light + dark via the theme tokens.
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Share, Platform, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ZoomIn,
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';

import Storm from '@/components/game/storm';
import { Floaters } from '@/components/home/floaters';
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
import { fetchDaily, type RemoteField } from '@/net/standings-remote';
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

// the six blank hint slots: staggered widths, NO letter-count leak. SMALLER
// than the hero word blocks in both axes (owner: the placeholders were
// out-measuring the word of the day — the hierarchy was upside down)
const HINT_SLOT_W = [40, 36, 44, 38, 36, 42];

// the frosted dock band: taller grab zone; home content scrolls UNDER it to
// the screen's bottom edge and blurs out; "swipe to play" always rides on top
const DOCK_H = 106; // sized for the (slightly under board scale) PLAY tiles
const ASSIST_RISE = 0; // assist rise retired (owner) — constant kept for the fade window math

// TRUE gradient frost: one BlurView masked by a LinearGradient (the sliced
// approximation banded — owner: "woof"). FLIP THIS TO true AFTER the next
// pod install + rebuild (the mask packages are native). Runtime detection
// was a trap: the packages' JS loads fine WITHOUT their native halves, the
// broken MaskedView then swallows the blur entirely (owner: "no blur at
// all") — a hand-flipped constant is deterministic.
const USE_MASKED_FROST = false;

function DockFrost({ tint }: { tint: 'dark' | 'light' }) {
  if (!USE_MASKED_FROST) {
    return <BlurView intensity={40} tint={tint} style={StyleSheet.absoluteFill} />;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MaskedView = require('@react-native-masked-view/masked-view').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LinearGradient } = require('expo-linear-gradient');
  return (
    <MaskedView
      style={StyleSheet.absoluteFill}
      maskElement={
        <LinearGradient
          colors={['transparent', 'black', 'black']}
          locations={[0, 0.32, 1]}
          style={StyleSheet.absoluteFill}
        />
      }>
      <BlurView intensity={45} tint={tint} style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}

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
  // devDay: __DEV__ playtest override — reading it during render means the
  // focus-refresh after returning from /dev picks up a changed override
  const devDay = getDevDay();
  const deal = useMemo(() => dealDaily(), [activeDayKey, devDay]);

  // (rollover gate lives below the sheet state — it must see sheetOpen)

  // ---- day state (re-read on focus AND on sheet close) ----
  const [day, setDay] = useState<DayState | null>(null);
  const refreshDay = useCallback(() => {
    if (deal) setDay(loadDay(deal.dayKey));
  }, [deal]);
  useFocusEffect(refreshDay);

  const stats = useMemo(() => loadStats(), [day]); // re-read when the day state moves
  const streak = useMemo(() => streakDays(stats), [stats]);
  const played = day?.route === 'consumed';
  const solved = played && !!day?.sworb?.solved;
  const inProgress = day?.route === 'resume' || day?.route === 'finale';

  // standings: stub renders NOW; the real field swaps in when the backend
  // answers (the fossil's loadHomeLb pattern — never a spinner)
  const [remote, setRemote] = useState<RemoteField | null>(null);
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
      rank: i + 1, name: e.name, score: e.score, you: false,
    }));
    if (you) {
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
    setFrostLive(true); // pre-mount the frost — it must be WARM before landing
    finishClose();
    requestAnimationFrame(() => {
      // the spring starts one frame AFTER the close's JS burst (frost mount +
      // state batch) — its first frames stay clean
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
  // stage 1 complete: PLAY lit → the row morphs to the chevron, swipe unlocks.
  // No swipe within the window → DISARM: the chevron gives way and the tiles
  // melt back in a reverse cascade (owner: the return must feel gratifying).
  const armIdle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarm = useCallback(() => {
    sArmed.value = 0;
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
          }
        })
        .onUpdate((e) => {
          'worklet';
          if (!sArmed.value) {
            const idx = Math.floor((e.absoluteX - pm.left) / (pm.tile + pm.gap));
            if (idx >= 0 && idx < 4 && idx + 1 > sLit.value) {
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
          // HYSTERESIS: enter at 22%, exit only below 19% — hovering at the
          // line can't chatter the detent (each fire is a JS hop + native
          // generator spin-up: the slow-drag stutter, owner)
          const risenNow = closedY - sheetY.value;
          const past = sDetent.value
            ? risenNow > height * 0.19
              ? 1
              : 0
            : risenNow > height * 0.22
              ? 1
              : 0;
          if (past !== sDetent.value) {
            sDetent.value = past;
            if (past) runOnJS(detentIn)();
            else runOnJS(detentOut)();
          }
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
    [width, height, closedY, sheetOpen, played, markOpen, traceBeat, armSoon, disarm, detentIn, detentOut]
  );

  // close drag (home owns sheetY): the round pauses ONLY when the close
  // COMMITS (owner: an aborted swipe-down must not restart the count-in —
  // the round simply never stopped). A mid-drag glimpse can't be traced, so
  // fairness holds.
  const parkBeat = useCallback(() => haptic.soft(), []);
  const commitClose = useCallback(() => {
    sheetRef.current?.pauseForClose();
    closingRef.current = true;
    finishClose(); // frost already warmed at drag start
    setTimeout(refreshDay, 300);
  }, [finishClose, refreshDay]);
  const prepFrost = useCallback(() => setFrostLive(true), []);
  const closeDrag = useMemo(
    () =>
      Gesture.Pan()
        // MUST be gated: at the peek rest this gesture's from-zero translation
        // math would TELEPORT the sheet on a downward touch
        .enabled(sheetOpen)
        .activeOffsetY(15)
        .onStart(() => {
          'worklet';
          // frost warms at drag START — the commit moment stays lean
          runOnJS(prepFrost)();
        })
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
    [height, closedY, sheetOpen, commitClose, prepFrost, detentIn, detentOut]
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
  // the game SURFACE must exist from the FIRST pixel of travel — and the
  // fade window is deliberately SHORT: while it runs, the whole game subtree
  // pays for an offscreen alpha group (the pull-fluidity tax the owner felt).
  // 52px of travel, then the layer is solid and compositing is free.
  // PREWARM (owner: first pull hesitated, later pulls fine): at boot the
  // game layer has never painted — the first drag paid the entire subtree's
  // initial rasterization (tiles + 29 Skia paths) mid-gesture. For ~1s after
  // mount it renders at 1.2% opacity (imperceptible under the frost), so the
  // texture upload happens while the player is still reading home.
  const sWarm = useSharedValue(1);
  useEffect(() => {
    const t = setTimeout(() => {
      sWarm.value = 0;
    }, 1100);
    return () => clearTimeout(t);
  }, []);
  const gameStyle = useAnimatedStyle(() => ({
    opacity: Math.max(
      sWarm.value * 0.012,
      interpolate(sheetY.value, [closedY - 60, closedY - 8], [1, 0], Extrapolation.CLAMP)
    ),
  }));
  // LIVE BLUR GATE: a BlurView riding a moving sheet re-samples its backdrop
  // every frame — long after the face has faded out. Past 180px of travel
  // the frost unmounts entirely (30px hysteresis so it can't flicker).
  const [frostLive, setFrostLive] = useState(true);
  useAnimatedReaction(
    () => sheetY.value > closedY - 180,
    (near, prev) => {
      if (near !== prev) runOnJS(setFrostLive)(near);
    },
    [closedY]
  );
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
      {!sheetOpen && (
        <View
          pointerEvents="none"
          style={[
            styles.stormWrap,
            { height: Math.min(280, height * 0.32) },
            played && styles.stormRest,
          ]}>
          <Storm width={width} height={Math.min(280, height * 0.32)} />
        </View>
      )}

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
          )}

          {/* word of the day: candy bloom when the day is done, dashed
              blanks before (the answer is hidden — no spoilers) */}
          <View style={styles.heroRow}>
            {played && deal
              ? [...deal.sworb].map((ch, i) => {
                  const pal = PALETTE[tileColorFor(ch, i)];
                  return (
                    <Animated.View
                      key={i}
                      entering={ZoomIn.delay(80 + i * 70)}
                      style={[
                        styles.heroBlock,
                        {
                          width: tileW, height: tileH, borderRadius: tileR,
                          backgroundColor: pal.bg,
                          boxShadow: `inset 0 -5px 0 ${pal.edge}, 0 2px 3px rgba(0,0,0,0.3)`,
                        },
                      ]}>
                      <Text style={[styles.heroText, { fontSize: Math.round(tileW * 0.57) }]}>
                        {ch.toUpperCase()}
                      </Text>
                    </Animated.View>
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
          </View>
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
            <View style={styles.hintRow}>
              {HINT_SLOT_W.map((w, i) => (
                <View
                  key={i}
                  style={[styles.hintSlot, { width: w, borderColor: theme.dashed }]}
                />
              ))}
            </View>
          )}

          {played && deal && (
            <View style={styles.pagerWrap}>
            <SuperlativesPager
              theme={theme}
              bestWords={day?.bestWords ?? []}
              foundClues={day?.found ?? []}
              clues={deal.clues}
              totalWords={loadDayWords(deal.dayKey).length}
            />
            </View>
          )}

          {/* standings section — ONLY the chart button opens the leaderboard
              (owner: not the whole section, "just that button haha") */}
          <View style={styles.standingsWrap}>
            <View style={styles.standingsHead}>
              <Text style={[styles.standingsTitle, { color: theme.sub }]}>
                standings
                {__DEV__ && getDiagnostics() ? `  ·  ${entries.length} in field` : ''}
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
            <FloatingPodium
              theme={theme}
              entries={standings.podium}
              you={null}
              showTitle={false}
              showFoot={false}
            />
            <StandingsList
              theme={theme}
              rows={standings.list}
              youOutside={standings.youOutside}
              ghost={!you}
            />
          </View>
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
            {/* shadow on a THIN carrier, not the full-screen layer — iOS
                recomputes a pathless layer shadow EVERY FRAME of movement
                (the Apple-sheet smoothness gap, owner) */}
            <View
              style={[
                styles.shadowStrip,
                {
                  boxShadow:
                    theme.mode === 'dark'
                      ? '0 -12px 40px rgba(0,0,0,0.55)'
                      : '0 -12px 36px rgba(31,20,66,0.28)',
                },
              ]}
            />
            <View style={styles.sheetClip}>
            {/* the GAME layer (opaque) — transparent at peek so the frost
                below can sample home */}
            <Animated.View
              style={[styles.gameLayer, { backgroundColor: gameSurface(theme.mode).bg }, gameStyle]}>
              <PlaySheet
                key={`${deal.dayKey}:${getResetNonce()}`}
                ref={sheetRef}
                onClose={closeSheet}
                active={sheetOpen}
                closeGesture={closeDrag}
              />
            </Animated.View>
            {/* the COLLAPSED FACE: frost + swipe-to-play/countdown */}
            <Animated.View
              pointerEvents="none"
              style={[styles.peekFace, { height: peekH }, faceStyle]}>
              {frostLive && <DockFrost tint={theme.mode === 'dark' ? 'dark' : 'light'} />}
              <View
                style={[
                  styles.dockInner,
                  { flex: 0, height: peekH, paddingBottom: Math.max(insets.bottom, 14) },
                ]}>
                <CountdownDock played={played} sLit={sLit} armed={armed} tile={pm.tile} gap={pm.gap} />
              </View>
              {__DEV__ && getDiagnostics() && (
                <Text style={styles.devBand}>
                  {deal?.dayKey ?? 'no-deal'}·{day?.route ?? 'no-day'}·{played ? 'played' : 'open'}
                  {getDevDay() ? '·OVERRIDE' : ''}
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
  stormWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  stormRest: {
    opacity: 0.4, // resting storm after the day is played
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
  shadowStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 24,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
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
  hintSlot: {
    height: 33,
    borderRadius: 11,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
