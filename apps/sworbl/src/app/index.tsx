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
  View, Text, StyleSheet, ScrollView, Share, useWindowDimensions,
} from 'react-native';
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
} from 'react-native-reanimated';

import { Floaters } from '@/components/home/floaters';
import { CountdownDock } from '@/components/home/countdown-dock';
import { HeroWord, twistLabel } from '@/components/home/hero-word';
import { StandingsSection } from '@/components/home/standings-section';
import { SheetWeather } from '@/components/home/sheet-weather';
import {
  OPEN_SPRING, PARK_SPRING, DOCK_H, ASSIST_RISE, BOOT_MS, bootWindow,
} from '@/components/home/home-motion';
import { playMetrics } from '@/components/home/trace-play';
import { AppBar } from '@/components/home/app-bar';
import { DateHeader } from '@/components/home/date-header';
import { SuperlativesPager } from '@/components/home/superlatives-pager';
import { PlaySheet, type PlaySheetHandle } from '@/components/play-sheet';
import { gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { dealDaily, getDevDay } from '@/game/daily';
import { getDiagnostics } from '@/game/dev-flags';
import { loadDay, saveSheetOpen, wasSheetOpen, getResetNonce, loadDayWords, type DayState } from '@/game/persist';
import { standingsStub, rankFor, type LbEntry } from '@/game/standings';
import { fetchDaily, readCachedField, type RemoteField } from '@/net/standings-remote';
import { loadStats, streakDays } from '@/game/stats';
import { buildShareText } from '@/game/share';
import { type StandingRow } from '@/components/home/standings-list';
import { getPlayerName } from '@/game/player';
import { useDayKey } from '@/game/use-day-key';
import { haptic } from '@/game/haptics';

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
  // the boot MASTER CLOCK — declared with its siblings, ABOVE every style
  // that reads it (it briefly lived below homeStyle: instant render error)
  const sBoot = useSharedValue(0);
  useEffect(() => {
    sBoot.value = withDelay(20, withTiming(1, { duration: BOOT_MS, easing: Easing.linear }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const homeStyle = useAnimatedStyle(() => {
    // boot: the whole screen settles as ONE unit (pro idiom) — a breath of
    // rise + scale, folded into the sheet-driven scale so the transform
    // key has a single owner
    const boot = bootWindow(sBoot.value, 0, 0.72);
    const sheetScale = interpolate(sheetY.value, [0, closedY], [0.94, 1], Extrapolation.CLAMP);
    return {
      opacity: boot,
      transform: [
        { translateY: (1 - boot) * 14 },
        { scale: sheetScale * (0.988 + 0.012 * boot) },
      ],
    };
  });
  // the collapsed FACE (frost + swipe-to-play) and the GAME crossfade as the
  // sheet travels — single-layer opacities, compositing-cheap
  const faceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [closedY - 170, closedY - 50], [0, 1], Extrapolation.CLAMP),
  }));
  // the band pair (aurora + PLAY tiles) fades in as ONE at boot
  const bandInStyle = useAnimatedStyle(() => ({
    opacity: bootWindow(sBoot.value, 0.45, 0.55),
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

          <HeroWord theme={theme} deal={deal} played={played} solved={solved} width={width} />

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

          <StandingsSection
            theme={theme}
            entries={entries}
            standings={standings}
            hasYou={!!you || entries.some((e) => e.isMe)}
            devCount={__DEV__ && devSnap.diag}
          />
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
            <SheetWeather
              sheetY={sheetY} sGlow={sGlow} sBoot={sBoot}
              closedY={closedY} width={width} peekH={peekH}
            />
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
});
