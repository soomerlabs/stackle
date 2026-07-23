// The play screen — the ONE game's full arc with persistence:
//   count-in → live hunt (pause/auto-pause, snapshot on every change) →
//   finale (snapshot per guess) → reveal (day locked, one shot).
// Boot routes through the engine (consumed → resume → finale → fresh).
// Clock model: accumulated boardElapsedMs (engine.run.remainingSecs derives the
// display) — resume RE-ARMS the count-in, never jumps to a running clock.
import React, { useState, useEffect, useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { AppState, StyleSheet, Text, View, Pressable, useWindowDimensions } from 'react-native';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  mkClock, clockStart, clockPause, clockElapsedMs, clockEffSecs, clockRemaining, clockGrant,
  type ClockState,
} from '@/game/round-clock';

import { GameBoard } from '@/components/game/game-board';
import { CountIn } from '@/components/game/count-in';
import { Finale, type FinaleRestore } from '@/components/game/finale';
import { ResultView } from '@/components/game/result-view';
import { ScoreHeader } from '@/components/game/score-header';
import { Brand } from '@/components/brand';
import Storm from '@/components/game/storm';
import { BG_DARK } from '@/game/palette';
import { dealDaily, bumpNextId } from '@/game/daily';
import { type TileT } from '@/game/types';
import { loadDay, saveProgress, finishDay, saveRun, type RunSnap, type BestWord } from '@/game/persist';
import { loadLadder } from '@/game/hints';
import { TUNING } from '@/game/tuning';
import Animated, {
  ZoomIn, FadeOut, useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';

// TIME FUEL: three minutes given, the Seven if you earn it (engine.run.timeForWord)

type Phase = 'idle' | 'countin' | 'live' | 'paused' | 'finale' | 'done';

export interface PlaySheetHandle {
  pauseForClose: () => void; // home calls this before sliding the sheet away
  rearm: () => void; // an ABORTED close-drag springs back → fresh 3·2·1
}

interface PlaySheetProps {
  onClose: () => void;
  // the sheet is PRE-MOUNTED hidden at boot (drag must move an already-built
  // layer — mounting mid-gesture was the pull jank). The round only ARMS
  // (count-in starts) when `active` flips true at sheet-dock.
  active: boolean;
  // built by HOME (it owns sheetY): finger-following close drag on the top bar
  closeGesture: React.ComponentProps<typeof GestureDetector>['gesture'];
}

export const PlaySheet = forwardRef<PlaySheetHandle, PlaySheetProps>(function PlaySheet(
  { onClose, active, closeGesture },
  handleRef
) {
  const { width, height } = useWindowDimensions();
  // useSafeAreaInsets is SYNCHRONOUS — SafeAreaView reflows a frame late, which
  // jitters the top bar every time the sheet mounts mid-drag (owner report)
  const insets = useSafeAreaInsets();
  // the board's trace pan — the full-screen close drag YIELDS to it, so a
  // downward trace on tiles can never slide the sheet (owner: close from the
  // whole screen, not just the top bar)
  const boardPanRef = useRef<PanGesture | undefined>(undefined);
  const glideRef = useRef<PanGesture | undefined>(undefined); // finale keyboard glide

  const deal = useMemo(() => dealDaily(), []);
  const boot = useMemo(() => (deal ? loadDay(deal.dayKey) : null), [deal]);
  const route = boot?.route ?? 'fresh';

  // a resumed run re-enters through the pause cover; a killed finale re-enters the finale
  const [phase, setPhase] = useState<Phase>(
    route === 'consumed' ? 'done' : route === 'resume' ? 'paused' : route === 'finale' ? 'finale' : 'idle'
  );
  const [countInMounted, setCountInMounted] = useState(false);

  // the app's foreground state — arming must never happen while backgrounded
  const [awake, setAwake] = useState(true);

  // ARM is EDGE-TRIGGERED (owner bug: close-drag pauses at first movement,
  // and a level-triggered arm started the count-in mid-drag): a count-in
  // starts only when the sheet ARRIVES — fresh dock or foreground return —
  // never merely because the sheet is still open.
  const arm = useCallback(() => {
    setCountInMounted(true);
    setPhase('countin');
  }, []);
  const prevActive = useRef(false);
  const prevAwake = useRef(true);
  useEffect(() => {
    const docked = active && !prevActive.current;
    const returned = awake && !prevAwake.current && active;
    prevActive.current = active;
    prevAwake.current = awake;
    if ((docked || returned) && awake && (phase === 'idle' || phase === 'paused')) arm();
  }, [awake, active, phase, arm]);

  // SAFETY NET: a count-in may never survive a closed sheet, whatever path
  // closed it — reopening must always start from 3 (owner rule)
  useEffect(() => {
    if (!active && phase === 'countin') {
      setCountInMounted(false);
      setPhase('idle');
    }
  }, [active, phase]);

  // the logo CLICK: at the exact dock moment the sheet's brand snaps
  // magnetically into home's slot — a tiny overshoot-settle (pairs with the
  // dock haptic)
  const brandScale = useSharedValue(1);
  useEffect(() => {
    if (active) {
      brandScale.value = withSequence(
        withTiming(1.12, { duration: 90 }),
        withSpring(1, { mass: 0.5, damping: 11, stiffness: 320 })
      );
    }
  }, [active]);
  const brandClick = useAnimatedStyle(() => ({ transform: [{ scale: brandScale.value }] }));
  const [score, setScore] = useState(boot?.run ? boot.run.score : route === 'consumed' ? boot!.score : 0);
  const [found, setFound] = useState<string[]>(boot?.run ? boot.run.found : boot ? boot.found : []);
  const [result, setResult] = useState<{ solved: boolean; guessesUsed: number; bonus: number } | null>(
    route === 'consumed' ? (boot!.sworb ?? { solved: false, guessesUsed: 0, bonus: 0 }) : null
  );
  const finaleRestore = useRef<FinaleRestore | undefined>(
    boot?.run && boot.run.phase === 'finale'
      ? { rows: boot.run.rows, slots: boot.run.slots, colors: boot.run.colors, guessesUsed: boot.run.guessesUsed }
      : undefined
  );

  // restored board state (resume route) — injected into GameBoard once
  const initialTiles = useMemo<TileT[] | undefined>(() => {
    if (!boot?.run || boot.run.phase !== 'live') return undefined;
    if (deal) deal.setQueueIdx(boot.run.queueIdx); // the SAME letter stream continues
    // restored ids must never collide with the fresh process's tile counter
    bumpNextId(Math.max(...boot.run.tiles.map((t) => t.id)));
    return boot.run.tiles.map((t) => ({ ...t, spawnDrop: 0, bornAt: Date.now() }));
  }, [boot, deal]);

  // ---- clock: ONE ClockState ref; all accounting decided by round-clock.ts
  // (pure, test-pinned) — this screen only schedules ticks and renders ----
  const CT = { baseSecs: TUNING.BASE_SECS, capSecs: TUNING.CAP_SECS };
  const clockRef = useRef<ClockState>(mkClock(boot?.run ?? undefined));
  const [remaining, setRemaining] = useState(() => clockRemaining(clockRef.current, Date.now(), CT));
  const [timePop, setTimePop] = useState<{ key: number; secs: number } | null>(null);
  const popKeyRef = useRef(0);

  useEffect(() => {
    if (phase !== 'live') return;
    const h = setInterval(() => {
      const left = clockRemaining(clockRef.current, Date.now(), CT);
      setRemaining(left);
      if (left <= 0) {
        clockRef.current = clockPause(clockRef.current, Date.now());
        setPhase('finale');
      }
    }, 250);
    return () => clearInterval(h);
  }, [phase]);

  // ---- run snapshots ----
  const boardTilesRef = useRef<TileT[]>(initialTiles ?? deal?.tiles ?? []);
  const queueIdxRef = useRef(boot?.run?.queueIdx ?? 0);
  const snapLive = useCallback(() => {
    if (!deal) return;
    const snap: RunSnap = {
      client: 'rn', v: 1, day: deal.dayKey, phase: 'live',
      tiles: boardTilesRef.current.map(({ id, letter, col, row, ci }) => ({ id, letter, col, row, ci })),
      queueIdx: queueIdxRef.current,
      score, found,
      boardElapsedMs: clockElapsedMs(clockRef.current, Date.now()),
      earnedMs: clockRef.current.earnedMs,
      guessesUsed: 0, rows: [], slots: [], colors: [],
    };
    saveRun(snap);
  }, [deal, score, found]);

  const onTiles = useCallback((tiles: TileT[], queueIdx: number) => {
    boardTilesRef.current = tiles;
    queueIdxRef.current = queueIdx;
  }, []);

  // every spelled word: superlatives feed + the TIME-FUEL grant (engine-decided,
  // cap-clipped so base + earned never exceeds the Seven)
  const wordsRef = useRef<BestWord[]>([]);
  const onWordSpelled = useCallback((word: string, pts: number, caughtClue: boolean) => {
    wordsRef.current.push({ word, pts });
    const { clock, grantMs } = clockGrant(
      clockRef.current,
      { len: word.length, isClue: caughtClue },
      CT
    );
    clockRef.current = clock;
    if (grantMs > 0) {
      setRemaining(clockRemaining(clockRef.current, Date.now(), CT));
      setTimePop({ key: ++popKeyRef.current, secs: Math.round(grantMs / 1000) });
      setTimeout(() => setTimePop((p) => (p && p.key === popKeyRef.current ? null : p)), 1000);
    }
  }, []);

  // persist progress + live snapshot on every meaningful change
  useEffect(() => {
    if (!deal || phase === 'done') return;
    saveProgress(deal.dayKey, score, found);
    if (phase === 'live') snapLive();
  }, [deal, phase, score, found]);

  const onFinaleProgress = useCallback(
    (s: FinaleRestore) => {
      if (!deal) return;
      finaleRestore.current = s;
      const snap: RunSnap = {
        client: 'rn', v: 1, day: deal.dayKey, phase: 'finale',
        tiles: boardTilesRef.current.map(({ id, letter, col, row, ci }) => ({ id, letter, col, row, ci })),
        queueIdx: queueIdxRef.current,
        score, found,
        boardElapsedMs: clockEffSecs(clockRef.current, CT) * 1000,
        earnedMs: clockRef.current.earnedMs,
        guessesUsed: s.guessesUsed, rows: s.rows, slots: s.slots, colors: s.colors,
      };
      saveRun(snap);
    },
    [deal, score, found]
  );

  // entering the finale marks the snapshot phase (a kill during guessing re-enters here)
  useEffect(() => {
    if (phase === 'finale' && deal) {
      onFinaleProgress(
        finaleRestore.current ?? { rows: [], slots: [], colors: [], guessesUsed: 0 }
      );
    }
  }, [phase]);

  // ---- pause / resume (engine rule: resume re-arms the count-in) ----
  const pause = useCallback(() => {
    if (phase !== 'live') return;
    clockRef.current = clockPause(clockRef.current, Date.now());
    snapLive();
    setPhase('paused');
  }, [phase, snapLive]);

  const onRelease = useCallback(() => {
    clockRef.current = clockStart(clockRef.current, Date.now());
    setRemaining(clockRemaining(clockRef.current, Date.now(), CT));
    setPhase('live');
  }, []);

  // auto-pause: backgrounding mid-hunt pauses and snapshots (fairness + safety)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      setAwake(s === 'active');
      if (s !== 'active') pause();
    });
    return () => sub.remove();
  }, [pause]);

  // home drives the sheet's motion; before it slides away the round settles:
  // live → paused (snapshot), mid-count-in → disarm back to idle
  const pauseForClose = useCallback(() => {
    if (phase === 'live') {
      pause();
    } else if (phase === 'countin') {
      setCountInMounted(false);
      setPhase('idle');
    }
  }, [phase, pause]);
  const rearm = useCallback(() => {
    if (phase === 'idle' || phase === 'paused') arm();
  }, [phase, arm]);
  useImperativeHandle(handleRef, () => ({ pauseForClose, rearm }), [pauseForClose, rearm]);

  const onFinaleDone = useCallback(
    (r: { solved: boolean; guessesUsed: number; bonus: number }) => {
      setResult(r);
      const finalScore = score + (r.bonus > 0 ? r.bonus : 0);
      if (r.bonus > 0) setScore(finalScore);
      // the day ends exactly once: result written, then the DONE lock (clears the run)
      if (deal) {
        finishDay(
          deal.dayKey,
          finalScore,
          found,
          { guessesUsed: r.guessesUsed, solved: r.solved, bonus: r.bonus },
          wordsRef.current
        );
      }
      setPhase('done');
    },
    [deal, score, found]
  );

  const tile = Math.min(64, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const onBoard = phase === 'idle' || phase === 'countin' || phase === 'live' || phase === 'paused';

  const fullClose = useMemo(() => {
    const g = closeGesture as PanGesture;
    // yield to the board's trace AND the finale keyboard's glide — a downward
    // stroke on tiles or keys must never slide the sheet away
    return g.requireExternalGestureToFail(
      boardPanRef as React.MutableRefObject<PanGesture>,
      glideRef as React.MutableRefObject<PanGesture>
    );
  }, [closeGesture, phase]);

  return (
    <GestureDetector gesture={fullClose}>
    <View style={styles.root}>
      {phase !== 'idle' && <Storm width={width} height={Math.min(280, height * 0.32)} />}
      <View style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.top}>
          {onBoard && remaining > 0 && (
            // tap = pause · DEV-ONLY shortcut: long-press → straight to the finale
            // (__DEV__ fence — audit weakness #4: a skip in a one-shot daily is
            // a player-facing integrity hole in release builds)
            <Pressable
              onPress={onClose}
              onLongPress={__DEV__ ? () => setPhase('finale') : undefined}
              delayLongPress={600}>
              <View style={styles.clockWrap}>
                <Text style={[styles.clock, remaining <= 30 && styles.clockLow]}>{clock}</Text>
                {timePop && (
                  <Animated.Text
                    key={timePop.key}
                    entering={ZoomIn.springify().mass(0.5)}
                    exiting={FadeOut.duration(200)}
                    style={styles.timePop}>
                    +0:{String(timePop.secs).padStart(2, '0')}
                  </Animated.Text>
                )}
              </View>
            </Pressable>
          )}
          <Animated.View style={[styles.brandCenter, brandClick]} pointerEvents="none">
            <Brand />
          </Animated.View>
          <Text style={styles.score}>{score.toLocaleString()}</Text>
        </View>

        {(onBoard || phase === 'finale') && (
          <View style={styles.scoreHdrWrap}>
            <ScoreHeader score={score} target={TUNING.PAR_TARGET} width={tile * 5 + gap * 4 + 24} />
          </View>
        )}

        <View style={styles.center}>
          {!deal && (
            // real empty state (audit weakness #2: this was unreachable before —
            // the content runway emptying must never render a blank screen)
            <View style={styles.noDay}>
              <Text style={styles.noDayTitle}>no sworbl today</Text>
              <Text style={styles.noDayText}>
                the puzzle feed is empty — update the app or check back soon
              </Text>
            </View>
          )}
          {onBoard && deal && (
            <Animated.View exiting={FadeOut.duration(250)}>
              {/* only the BOARD is input-gated — the covers above it must stay
                  tappable (the old parent-level gate ate the resume tap) */}
              <View pointerEvents={phase === 'live' ? 'auto' : 'none'}>
                <GameBoard
                  deal={deal}
                  size={tile}
                  gap={gap}
                  initialTiles={initialTiles}
                  initialFound={boot?.run?.found}
                  initialScore={boot?.run?.score}
                  secsLeft={phase === 'live' ? remaining : undefined}
                  onScore={setScore}
                  onClues={setFound}
                  onTiles={onTiles}
                  onWordSpelled={onWordSpelled}
                />
              </View>
              {countInMounted && phase === 'countin' && (
                <CountIn onRelease={onRelease} onUnmount={() => setCountInMounted(false)} />
              )}
            </Animated.View>
          )}
          {phase === 'finale' && deal && (
            <Finale
              entry={{ sworb: deal.sworb }}
              clues={deal.clues}
              found={found}
              size={tile}
              restore={finaleRestore.current}
              onProgress={onFinaleProgress}
              onDone={onFinaleDone}
              nudged={loadLadder(deal.dayKey).nudged}
              gestureRef={glideRef}
            />
          )}
          {phase === 'done' && deal && result && (
            <View style={styles.doneWrap}>
              <ResultView
                word={deal.sworb}
                definition={deal.definition}
                solved={result.solved}
                guessesUsed={result.guessesUsed}
                score={score}
                bonus={result.bonus}
              />
              <Pressable onPress={onClose} style={styles.homeLink}>
                <Text style={styles.homeLinkText}>home ›</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_DARK,
  },
  safe: {
    flex: 1,
  },
  scoreHdrWrap: {
    alignItems: 'center',
    paddingTop: 8,
  },
  brandCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12, // MATCHES home's brand offset — the sheet's logo lands
    // exactly on home's at dock (the "uniting" is positional)
  },
  brand: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#A78BFA',
  },
  clockWrap: {
    alignItems: 'center',
  },
  clock: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
  },
  timePop: {
    position: 'absolute',
    top: 26,
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#5FD6A8',
  },
  clockLow: {
    color: '#FF8A8E',
  },
  score: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 24,
    color: '#EDEFF7',
    fontVariant: ['tabular-nums'],
  },
  center: {
    // WEB-PARITY LAYOUT: top-anchored stack (header → score bar → stepper →
    // board → fan) with a fixed rhythm — never a centered island. Leftover
    // space collects at the BOTTOM, where the storm lives.
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 6,
  },
  doneWrap: {
    alignItems: 'center',
    gap: 18,
  },
  noDay: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 32,
  },
  noDayTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 20,
    color: '#EDEFF7',
  },
  noDayText: {
    fontFamily: 'Fredoka_500Medium',
    fontSize: 14,
    color: '#9DA2B3',
    textAlign: 'center',
    lineHeight: 20,
  },
  homeLink: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  homeLinkText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    color: '#8971FF',
  },
});
