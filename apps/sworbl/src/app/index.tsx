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
  View, Text, Pressable, StyleSheet, ScrollView, Share, Platform, useWindowDimensions, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { HeroCard } from '@/components/home/hero-card';
import { ShowdownsRail } from '@/components/home/showdowns-rail';
import { StormShelf } from '@/components/home/storm-shelf';
import { router, useFocusEffect } from 'expo-router';
import { Gesture } from 'react-native-gesture-handler';
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
import { twistLabel } from '@/components/home/hero-word';
import {
  OPEN_SPRING, PARK_SPRING, DOCK_H, ASSIST_RISE, BOOT_MS, bootWindow,
} from '@/components/home/home-motion';
import { AppBar } from '@/components/home/app-bar';
import { DateHeader } from '@/components/home/date-header';
import { PlaySheet, type PlaySheetHandle } from '@/components/play-sheet';
import { gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { dealDaily, getDevDay } from '@/game/daily';
import { getDiagnostics } from '@/game/dev-flags';
import { loadDay, saveSheetOpen, wasSheetOpen, getResetNonce, loadDayWords, type DayState, clearRun } from '@/game/persist';
import { standingsStub, rankFor, type LbEntry } from '@/game/standings';
import { checkContentEpoch } from '@/net/config-remote';
import { toast } from '@/components/toast';
import { track } from '@/net/analytics';
import { claimRefuel, fetchMyShowdownPoints, fetchSettledShowdowns } from '@/net/duels';
import { fetchDaily, readCachedField, type RemoteField } from '@/net/standings-remote';
import { fetchRemoteEntry } from '@/net/dailies-remote';
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
  // contentNonce: bumped when the SERVER's day spec changes — re-deals an
  // UNSTARTED day only (the never-re-deal-mid-round law holds)
  const [contentNonce, setContentNonce] = useState(0);
  const deal = useMemo(() => dealDaily(), [activeDayKey, devSnap.devDay, contentNonce]);

  // (rollover gate lives below the sheet state — it must see sheetOpen)

  // ---- day state (re-read on focus AND on sheet close) ----
  const [day, setDay] = useState<DayState | null>(null);
  // THE ROUND KEY, LAGGED (owner: close was "jank central") — rounds.played
  // rides the PlaySheet key so the next open deals the fresh round, but the
  // key-driven remount is the heaviest thing this screen can do (full board
  // teardown + rebuild, native views + Skia). Syncing it with refreshDay at
  // +40ms landed the remount INSIDE the park frost fade and the P·L·A·Y
  // return bloom. The key now syncs ~1.1s after the park lands, when home
  // is at rest; reopening inside that window just cancels the sync (the
  // round-end cover shows again — harmless).
  const [sheetRound, setSheetRound] = useState(() => (deal ? loadDay(deal.dayKey).rounds.played : 0));
  const refreshDay = useCallback(() => {
    if (deal) setDay(loadDay(deal.dayKey));
    if (__DEV__) setDevSnap({ devDay: getDevDay(), nonce: getResetNonce(), diag: getDiagnostics() });
  }, [deal]);
  useFocusEffect(refreshDay);

  const stats = useMemo(() => loadStats(), [day]); // re-read when the day state moves
  // ONE storage read per day-state change (audit: this was read twice
  // inline per render, during the close-settle burst too)
  const dayWords = useMemo(() => (deal ? loadDayWords(deal.dayKey) : []), [deal, day]);
  const streak = useMemo(() => streakDays(stats), [stats]);
  // the day's sworb is DECIDED (solved or locked out) — drives the home
  // reveal and the dock's next-sworbl countdown. NOT legacy; live behavior.
  const played = day?.route === 'consumed';
  const solved = !!day?.sworb?.solved; // regular: solve reveals the hero mid-day
  const inProgress = day?.route === 'resume' || day?.route === 'finale';
  // REGULAR MODE (modes-spec): the day is a living thing — rounds banked,
  // clue bank growing, the guess spendable anytime
  const dayInProgress = (day?.rounds.played ?? 0) > 0;
  const sworbPending = !solved && (day?.sworb?.guessesUsed ?? 0) < 6;

  // standings, LIVE-FIRST (owner: cold launch flashed fake names): the
  // cached real field renders instantly; the fresh answer swaps in silently.
  // First-ever launch has no cache → the honest ghost skeleton, and the
  // field FADES IN when data arrives (never a spinner, never a stub).
  const [remote, setRemote] = useState<RemoteField | null>(() =>
    deal ? readCachedField(deal.dayKey + ':regular') : null
  );
  useEffect(() => {
    let live = true;
    if (deal) {
      fetchDaily(deal.dayKey).then((r) => {
        if (live && r && r.entries.length) setRemote(r);
      });
      // server-driven day spec (owner: swap tester content rapidly) — a
      // changed spec re-deals ONLY an untouched day with the sheet parked
      fetchRemoteEntry(deal.dayKey).then((changed) => {
        if (!live || !changed) return;
        const d = loadDay(deal.dayKey);
        if (d.route === 'fresh') setContentNonce((n) => n + 1);
      });
      // SETTLED WHILE AWAY: a decided showdown lands as a toast — the
      // poster finally learns the outcome (audit)
      void fetchSettledShowdowns().then((settled) => {
        if (!live || !settled.length) return;
        const last = settled[settled.length - 1];
        toast(
          last.won
            ? `showdown won — ${last.myScore.toLocaleString()} beat ${last.theirScore.toLocaleString()} · pot ${last.pot} ✦`
            : `showdown lost — ${last.theirScore.toLocaleString()} beat your ${last.myScore.toLocaleString()} · ante gone`,
          { pal: last.won ? 2 : 5 }
        );
      });
      // THE TORCH (owner): a bumped content epoch burns every cached day
      // spec + today's state and re-deals fresh — parked sheets only
      if (!sheetOpen) {
        void checkContentEpoch(deal.dayKey).then((torched) => {
          if (live && torched) {
            setContentNonce((n) => n + 1);
            refreshDay();
          }
        });
      }
    }
    return () => {
      live = false;
    };
  }, [deal, day]);
  // HOME PULL-TO-REFRESH (owner networking audit): standings + day spec
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [duelsNonce, setDuelsNonce] = useState(0);
  // the wallet chip (owner: expose the points) — refreshes with the rails
  const [walletPts, setWalletPts] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void fetchMyShowdownPoints().then((v) => live && v != null && setWalletPts(v));
    return () => {
      live = false;
    };
  }, [duelsNonce]);
  // DAILY REFUEL (owner: "give points everyday") — claim once per app-day;
  // idempotent server-side, so mounting twice never double-grants
  useEffect(() => {
    let live = true;
    track('app_open', {});
    void claimRefuel().then((r) => {
      if (!live || !r) return;
      setWalletPts(r.balance);
      if (r.granted > 0) toast(`daily refuel +${r.granted} ✦`, { pal: 2 });
    });
    return () => {
      live = false;
    };
  }, []);
  const homeRefresh = useCallback(async () => {
    if (!deal) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    haptic.soft(); // the native PTR thunk RN doesn't give you (owner)
    setHomeRefreshing(true);
    try {
      const [field, changed] = await Promise.all([
        fetchDaily(deal.dayKey),
        fetchRemoteEntry(deal.dayKey),
      ]);
      if (field?.entries.length) setRemote(field);
      if (changed && loadDay(deal.dayKey).route === 'fresh') setContentNonce((n) => n + 1);
      setDuelsNonce((n) => n + 1); // the duels rail re-pulls on the same gesture
    } finally {
      setHomeRefreshing(false);
    }
  }, [deal]);
  const entries = useMemo(
    () => remote?.entries ?? (deal ? standingsStub(deal.dayKey) : []),
    [remote, deal]
  );
  // the derived day score (bestRound + solve bonus) IS your standing
  const myScore = day?.score ?? 0;
  const you = myScore > 0 ? { score: myScore, rank: rankFor(entries, myScore) } : null;
  // ONE combined order (owner): you spliced at your true rank — the podium
  // takes 1-3 (you can BE on it), the list takes 4-10, and past-10 you ride
  // below an ellipsis. Unplayed → a dashed ghost row instead.
  const standings = useMemo(() => {
    // usernames are UNIQUE (owner ruling) — a name match IS you, which
    // heals identity drift from dev wipes (the ghost-seat-under-your-own-
    // podium bug: session id changed, the name did not)
    const rows: StandingRow[] = entries.map((e, i) => ({
      rank: i + 1, name: e.name, score: e.score,
      you: !!e.isMe || e.name === getPlayerName(),
    }));
    // splice ONLY into stub fields — a remote field already contains you
    // (the double-you bug: server row + local splice, same score, #1/#2)
    // splice whenever the FIELD lacks you — a fresh remote field can be
    // stale for a beat after finishing (the insert races the fetch) and
    // you'd vanish from your own standings (owner butter audit)
    if (you && !entries.some((e) => e.isMe || e.name === getPlayerName())) {
      rows.splice(you.rank - 1, 0, { rank: you.rank, name: getPlayerName(), score: you.score, you: true });
      rows.forEach((r, i) => (r.rank = i + 1));
    }
    const youRow = rows.find((r) => r.you) ?? null;
    return { podium: rows.slice(0, 3), youRow };
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
  // (the two-stage trace door is DELETED — owner: "i'm over the PLAY
  // mechanic"; the hero card's tap is the only door now)
  // THE REVEAL (owner: "it flashes and then it's over — wtf is that"): the
  // color's exit is TIME-based, not position-based. A flick compressed the
  // whole wash into ~150ms; now the color holds through the dock and lets
  // go over a deliberate beat AFTER the sheet lands. Restoration boots at 1
  // (board already revealed).
  const sReveal = useSharedValue(bootOpen ? 1 : 0);
  // the boot MASTER CLOCK — declared with its siblings, ABOVE every style
  // that reads it (it briefly lived below homeStyle: instant render error)
  const sBoot = useSharedValue(0);
  useEffect(() => {
    sBoot.value = withDelay(20, withTiming(1, { duration: BOOT_MS, easing: Easing.linear }));
    // HARD FINISHER (web): a background tab throttles animation frames and
    // froze the sweep mid-flight — home half-lit, band at opacity 0 forever.
    // A direct write can't be throttled away; on a healthy boot it's a no-op.
    const t = setTimeout(() => {
      sBoot.value = 1;
    }, BOOT_MS + 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sSquash = useSharedValue(1); // candy squash when the sheet docks at full
  const [sheetOpen, setSheetOpen] = useState(bootOpen); // fully open → home drag off, round armed
  // lagged round-key sync (see sheetRound above) — runs only at rest
  useEffect(() => {
    const played = day?.rounds.played ?? 0;
    if (sheetOpen || played === sheetRound) return;
    const t = setTimeout(() => setSheetRound(played), 1100);
    return () => clearTimeout(t);
  }, [day, sheetOpen, sheetRound]);
  // REVEAL WATCHDOG (owner: "gameboard is super dimmed"): sReveal normally
  // ramps in markOpen, but a sheet that's open by ANY other path — hot
  // reload with the board up, dev restarts — would leave the stretched
  // crest parked over the board at full burn. Law: an open sheet ends
  // fully revealed, whatever road opened it.
  useEffect(() => {
    if (!sheetOpen) return;
    const t = setTimeout(() => {
      if (sReveal.value < 1) sReveal.value = withTiming(1, { duration: 300 });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);
  const sheetRef = useRef<PlaySheetHandle>(null);

  // the rollover gate: adopt the new day only while no round is in flight.
  // A paused round closed across midnight leaves a snapshot under the OLD
  // key — nothing can ever resume it (home only deals today), so it clears
  // here instead of haunting storage (audit: the midnight strand).
  useEffect(() => {
    if (dayKey !== activeDayKey && !sheetOpen) {
      clearRun(activeDayKey);
      setActiveDayKey(dayKey);
    }
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
  }, []);
  const closeSettled = useCallback(() => {
    closingRef.current = false;
    // the day re-read happens AFTER the park lands (owner butter audit:
    // refreshing at +300ms detonated home's biggest re-render — FlipTiles,
    // pager, standings, dock swap — in the MIDDLE of the park spring)
    setTimeout(refreshDay, 40);
    // the color rearms only AFTER the park lands (owner: "not the crazy
    // color thing on dismiss") — sReveal stays 1 through the whole descent
    // so the wash/crest can't relight mid-close; the band's calm glow then
    // breathes back in at rest
    sReveal.value = withTiming(0, { duration: 450 });
    // refreshDay in deps: it re-binds when the deal changes — an empty
    // array here would re-read YESTERDAY after a day flip (stale closure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDay]);
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
  }, [closedY, finishClose, closeSettled]);

  // pull UP from the dock: the sheet (pre-mounted, hidden) rides the finger —
  // pure transform on the UI thread, nothing mounts mid-gesture.
  const markOpen = useCallback(() => {
    setSheetOpen(true);
    if (deal) saveSheetOpen(deal.dayKey); // reclaim-proof: the sheet remembers
    // the color lets go AFTER the dock — the reveal is its own moment
    sReveal.value = withDelay(240, withTiming(1, { duration: 650, easing: Easing.out(Easing.quad) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal]);
  // GUESS FROM HOME (modes-spec): open the sheet STRAIGHT into the finale
  // TAP TO PLAY (owner): the whole top section opens the game — the sheet
  // docks and the idle phase arms its own count-in, same as a swipe
  // INVISIBLE AT PARK (owner: "weird black box behind the blocks") — with
  // the frost gone, the parked peek strip showed the bare game surface.
  // The sheet is fully hidden at rest and alive within 10px of travel.
  const parkHide = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [closedY - 10, closedY], [1, 0], Extrapolation.CLAMP),
  }), [closedY]);

  const openToPlay = useCallback(() => {
    if (closingRef.current) return;
    sheetY.value = withSpring(0, OPEN_SPRING);
    markOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markOpen]);

  // close drag (home owns sheetY): the round pauses ONLY when the close
  // COMMITS (owner: an aborted swipe-down must not restart the count-in —
  // the round simply never stopped). A mid-drag glimpse can't be traced, so
  // fairness holds.
  const commitClose = useCallback(() => {
    sheetRef.current?.pauseForClose();
    closingRef.current = true;
    finishClose();
    // (refresh rides closeSettled — after the park spring lands)
  }, [finishClose]);
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
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > height * 0.25 || e.velocityY > 900) {
            // commit: deactivate NOW (blocker #1 — never let the arm effect
            // re-fire while the sheet slides away)
            runOnJS(commitClose)();
            sheetY.value = withSpring(closedY, { ...PARK_SPRING, velocity: e.velocityY }, () => {
              'worklet';
              runOnJS(closeSettled)(); // carries the single park beat
            });
          } else {
            // abort: the round never paused — the sheet just springs back
            sheetY.value = withSpring(0, { ...OPEN_SPRING, velocity: e.velocityY });
          }
        }),
    [height, closedY, sheetOpen, commitClose, closeSettled]
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
  // floaters fade with the sheet's rise — fully gone by half the travel,
  // so nothing is being drawn under the opaque sheet at dock
  const floatersFade = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [closedY * 0.45, closedY * 0.85], [0, 1], Extrapolation.CLAMP),
  }));
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
    // SHORT window (owner: "swipe up to start" was still hanging over the
    // board's sworbl header mid-pull) — the face is gone within ~70px
    opacity: interpolate(sheetY.value, [closedY - 90, closedY - 20], [0, 1], Extrapolation.CLAMP),
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
      {/* ALWAYS MOUNTED (perf audit: 15 repeat-loop views tore down at the
          exact frame every open/close began — mount churn on the sheet's
          hottest transitions). Occlusion is an OPACITY now, driven from the
          sheet's own position on the UI thread. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, floatersFade]}>
        <Floaters width={width} height={height} />
      </Animated.View>

      <Animated.View style={[styles.safe, homeStyle]}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <AppBar
          theme={theme}
          points={walletPts}
          onPoints={() => router.push('/points')}
          onPerson={() => router.push('/profile')}
          onSettings={() => router.push('/settings')}
        />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: DOCK_H + insets.bottom + 10 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={homeRefreshing}
              onRefresh={homeRefresh}
              tintColor="#8971FF"
            />
          }>
          {deal && (
            <DateHeader
              theme={theme}
              dayKey={deal.dayKey}
              score={myScore > 0 ? myScore : null}
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
                    rounds: day?.rounds.played ?? 0,
                  }),
                }).catch(() => {})
              }
            />
          )}

          {/* THE HERO CARD (owner: "do the A and B compose") — the daily
              is home's one dominant object; masthead, hero word, badge,
              standings glance, and the PLAY/GUESS buttons all live ON it */}
          <HeroCard
            theme={theme}
            deal={deal}
            played={played}
            solved={solved}
            sworbPending={sworbPending}
            width={width - 32}
            podium={standings.podium}
            you={
              standings.youRow && standings.youRow.rank > 3
                ? { rank: standings.youRow.rank, score: standings.youRow.score }
                : null
            }
            onPlay={openToPlay}
            onGuess={sworbPending && deal ? () => router.push('/guess') : undefined}
          />

          <StormShelf theme={theme} refreshNonce={duelsNonce} />

          <ShowdownsRail theme={theme} refreshNonce={duelsNonce} />
        </ScrollView>
        {/* (the blur floating bar was tried and REVERTED — owner: "just
            leave it how it was") */}
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
          <Animated.View style={[styles.sheet, sheetStyle, parkHide]} pointerEvents={undefined}>
            {/* crest RETIRED (owner, play-door era): the bottom runs bare;
                the FAB's radiance is home's living light now */}
            <View style={styles.sheetClip}>
            {/* the GAME layer (opaque) — transparent at peek so the frost
                below can sample home */}
            <Animated.View
              style={[styles.gameLayer, { backgroundColor: gameSurface(theme.mode).bg }, gameStyle]}>
              <PlaySheet
                key={`${deal.dayKey}:${devSnap.nonce}:${sheetRound}`}
                ref={sheetRef}
                onClose={closeSheet}
                active={sheetOpen}
                closeGesture={closeDrag}
              />
            </Animated.View>
            {/* tail-bridge gradient RETIRED (owner: "weird gradient that
                glows when we launch the sheet, can we delete that?") —
                it papered over the frost-era crest, which is long gone;
                the rise runs native-clean now */}
            {/* the COLLAPSED FACE: swipe-to-play/countdown */}
            <Animated.View
              pointerEvents="none"
              style={[styles.peekFace, { height: peekH }, faceStyle]}>
              <View
                style={[
                  styles.dockInner,
                  { paddingBottom: Math.max(insets.bottom, 14) },
                ]}>
                {/* boot fade on its OWN node — layout props never share an
                    element with an animated style (web dropped the height) */}
                <Animated.View style={bandInStyle}>
                  <CountdownDock played={played} />
                </Animated.View>
              </View>
              {__DEV__ && devSnap.diag && (
                <Text style={styles.devBand}>
                  {deal?.dayKey ?? 'no-deal'}·{day?.route ?? 'no-day'}·{played ? 'played' : 'open'}
                  {devSnap.devDay ? '·OVERRIDE' : ''}
                </Text>
              )}
            </Animated.View>
            </View>
          </Animated.View>
      )}

      {/* THE FAB, TOPMOST (owner: "the blur is hijacking the hit") — it
          renders ABOVE the parked sheet layers so the corner is always
          tappable; it fades itself once the sheet rises */}
      {/* the FAB is the DAILY's door (owner): storms + showdowns launch
          from their own lobbies' PLAY — that's the natural flow */}
      {/* corner FAB RETIRED (owner: hero-card home) — PLAY lives ON the
          daily card now; the sheet still rises from openToPlay */}
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
    // bottom padding is DYNAMIC (dock height + insets) at the call site;
    // the FAB-clearance era's 264 retired with the corner stick
    gap: 14, // card rhythm (hero → storms → showdowns)
    alignItems: 'center',
  },
  // ABSOLUTE fill of the band, not flex-sized (web: RNW maps flex:0 to
  // flex-basis:0, which BEATS height in a column flex parent — the dock
  // collapsed to its padding and the tiles overflowed the clip)
  dockInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  // the frost's own layer: band-height at the sheet's top, riding the
  // whole pull (inside the face it died with the face's 90px fade)
  frostBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  // the play-door wrapper carries the column's own 22px rhythm — wrapping
  // hero + status in one Pressable must not collapse their spacing (owner:
  // "increase the padding between the views on the top")
  playDoor: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 22,
  },
  guessPill: {
    backgroundColor: '#8971FF',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
    boxShadow: '0 3px 0 #6A54D8',
  },
  guessPillText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 10.5,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  shareChip: {
    width: 30,
    height: 30,
    borderRadius: 10, borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
