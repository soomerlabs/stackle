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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

import { Floaters } from '@/components/home/floaters';
import { twistLabel } from '@/components/home/hero-word';
import { BOOT_MS, bootWindow } from '@/components/home/home-motion';
import { AppBar } from '@/components/home/app-bar';
import { DateHeader } from '@/components/home/date-header';
import { useTheme } from '@/game/theme';
import { dealDaily, getDevDay } from '@/game/daily';
import { getDiagnostics } from '@/game/dev-flags';
import { loadDay, wasSheetOpen, getResetNonce, loadDayWords, type DayState, clearRun } from '@/game/persist';
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
      if (focusedRef.current) {
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

  // UI RESTORATION (native-sheet era): killed-in-background with the
  // board open → relaunch pushes the /play route back up, paused. The
  // day-keyed run snapshot can't load for a NEW day, so a stale flag is
  // harmless (the route just shows the fresh idle board).
  useEffect(() => {
    if (!deal || !wasSheetOpen(deal.dayKey)) return;
    const d = loadDay(deal.dayKey);
    if (d.route !== 'resume' && d.route !== 'finale') return;
    const t = setTimeout(() => router.push('/play'), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // THE NATIVE SHEET (owner: "lets get that out of the way") — the board
  // is a fullScreenModal route now (/play), the same rise as storms. The
  // whole hand-built sheet apparatus (sheetY, springs, crossfades, close
  // drag, prewarm) retires with it.
  const focusedRef = useRef(true);
  const openToPlay = useCallback(() => {
    router.push('/play');
  }, []);

  // the rollover gate rides FOCUS now: adopt the new day only when home
  // is the front screen (a paused round behind the modal never re-deals)
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (dayKey !== activeDayKey) {
        clearRun(activeDayKey);
        setActiveDayKey(dayKey);
      }
      return () => {
        focusedRef.current = false;
      };
    }, [dayKey, activeDayKey])
  );

  const homeStyle = useAnimatedStyle(() => {
    // boot: the whole screen settles as ONE unit (pro idiom)
    const boot = bootWindow(sBoot.value, 0, 0.72);
    return {
      opacity: boot,
      transform: [{ translateY: (1 - boot) * 14 }, { scale: 0.988 + 0.012 * boot }],
    };
  });

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Floaters width={width} height={height} />
      </View>

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
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
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

      {/* the hand-built sheet is GONE (owner: native sheet) — /play is a
          fullScreenModal route now, the same rise as storms */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
