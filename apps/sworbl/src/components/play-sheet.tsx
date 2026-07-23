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
import { type FinaleRestore } from '@/components/game/finale';
import { ResultView } from '@/components/game/result-view';
import { ScoreHeader } from '@/components/game/score-header';
import { Brand } from '@/components/brand';
import Storm from '@/components/game/storm';
import { gameSurface } from '@/game/palette';
import { useTheme } from '@/game/theme';
import { dealDaily, bumpNextId } from '@/game/daily';
import { type TileT } from '@/game/types';
import { loadDay, saveProgress, finishDay, saveRun, type RunSnap, type BestWord } from '@/game/persist';
import { enqueueSubmission } from '@/net/standings-remote';
import { loadLadder } from '@/game/hints';
import { getDiagnostics, getShortRounds } from '@/game/dev-flags';
import { TUNING } from '@/game/tuning';
import Animated, {
  ZoomIn, FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withSequence, withTiming, withSpring,
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
  const gs = gameSurface(useTheme().mode);
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

  // COUNT-IN POLICY (owner ruling 2026-07-24, overrides the old engine
  // "resume re-arms" law): the 3·2·1 is a FIRST-START ceremony only. A
  // paused round lands on the paused cover and a tap starts play INSTANTLY —
  // fair by construction (letters exist only once the clock runs; the radial
  // wake is the reaction ramp). Arming is still EDGE-TRIGGERED (dock /
  // foreground arrival), never level-triggered.
  const arm = useCallback(() => {
    setCountInMounted(true);
    setPhase('countin');
  }, []);
  // the count-in beat the STEPPER renders (count-in itself is headless now)
  const [countStep, setCountStep] = useState<'3' | '2' | '1' | null>(null);
  // seeded from the INITIAL prop: mounting already-active (state restoration
  // after an OS reclaim) is NOT a dock edge — the round stays paused behind
  // the tap-to-resume cover instead of auto-counting-in on relaunch
  const prevActive = useRef(active);
  const prevAwake = useRef(true);
  useEffect(() => {
    const docked = active && !prevActive.current;
    const returned = awake && !prevAwake.current && active;
    prevActive.current = active;
    prevAwake.current = awake;
    if ((docked || returned) && awake && (phase === 'idle' || phase === 'paused')) {
      if (phase === 'idle') {
        // FRESH round: the ceremony. SETTLE BEAT first (owner): dock haptic
        // lands, sheet settles, THEN 3·2·1. Cleanup cancels if the sheet leaves.
        const t = setTimeout(arm, 450);
        return () => clearTimeout(t);
      }
      // PAUSED round: no auto-anything — the paused cover is already showing;
      // the player taps when THEY'RE ready and play starts instantly.
    }
  }, [awake, active, phase, arm]);

  // SAFETY NET: a count-in may never survive a closed sheet, whatever path
  // closed it — reopening must always start from 3 (owner rule)
  useEffect(() => {
    if (!active && phase === 'countin') {
      setCountInMounted(false);
      setPhase('idle');
    }
  }, [active, phase]);

  // WATCHDOG (owner: restored board "dead in the water"): a phase that can
  // never resolve on its own must ALWAYS recover to a tappable state. Two
  // known-impossible states are caught here; anything similar dies with them:
  //   · countin with no count-in mounted (nobody will ever release)
  //   · live with a clock that thinks it's paused (nobody ticks)
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      // console.log, NOT warn — a recovery note must never nag LogBox on
      // every open (owner); the gold diagnostics overlay is the loud channel
      if (phase === 'countin' && !countInMounted) {
        if (__DEV__) console.log('[sworbl] watchdog: stuck countin → paused cover');
        setPhase('paused');
      }
      if (phase === 'live' && !clockRef.current.liveStartAt) {
        if (__DEV__) console.log('[sworbl] watchdog: live with a paused clock → paused cover');
        setPhase('paused');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [active, phase, countInMounted]);

  // boot diagnostics (dev): when a restored board misbehaves, the log names it
  useEffect(() => {
    if (__DEV__) {
      console.log('[sworbl] sheet boot', {
        route,
        phase,
        active,
        runPhase: boot?.run?.phase ?? null,
        elapsedMs: boot?.run?.boardElapsedMs ?? 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (the logo-click overshoot at dock was owner-removed — the brand sits still)
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
  const CT = {
    baseSecs: __DEV__ && getShortRounds() ? 20 : TUNING.BASE_SECS,
    capSecs: TUNING.CAP_SECS,
  };
  const clockRef = useRef<ClockState>(mkClock(boot?.run ?? undefined));
  const [remaining, setRemaining] = useState(() => clockRemaining(clockRef.current, Date.now(), CT));
  const [timePop, setTimePop] = useState<{ key: number; secs: number } | null>(null);
  const popKeyRef = useRef(0);

  useEffect(() => {
    if (phase !== 'live') return;
    let morph: ReturnType<typeof setTimeout> | null = null;
    const h = setInterval(() => {
      const left = clockRemaining(clockRef.current, Date.now(), CT);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(h);
        clockRef.current = clockPause(clockRef.current, Date.now());
        // let 0:00 LAND for a beat before the board morphs (owner: the jump
        // straight to the guess state read as a glitch)
        morph = setTimeout(() => setPhase('finale'), 1000);
      }
    }, 250);
    return () => {
      clearInterval(h);
      if (morph) clearTimeout(morph);
    };
  }, [phase]);

  // ---- run snapshots ----
  const boardTilesRef = useRef<TileT[]>(initialTiles ?? deal?.tiles ?? []);
  const queueIdxRef = useRef(boot?.run?.queueIdx ?? 0);
  const snapLive = useCallback(() => {
    if (!deal) return;
    const snap: RunSnap = {
      client: 'rn', v: 1, day: deal.dayKey, phase: 'live',
      tiles: boardTilesRef.current.map(({ id, letter, col, row, ci, boost }) => ({ id, letter, col, row, ci, boost })),
      queueIdx: queueIdxRef.current,
      score, found,
      words: wordsRef.current,
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
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, []);

  // ================= BUG 1 fix: superlatives ride the snapshot =================
  // every spelled word persists with the run — a kill mid-hunt must not
  // amnesia the recap/stats word list (score kept it; the words vanished)
  const wordsRef = useRef<BestWord[]>(boot?.run?.words ?? []);
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
        tiles: boardTilesRef.current.map(({ id, letter, col, row, ci, boost }) => ({ id, letter, col, row, ci, boost })),
        queueIdx: queueIdxRef.current,
        score, found,
        words: wordsRef.current,
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
      setCountStep(null);
      setPhase('idle');
    }
  }, [phase, pause]);
  const rearm = useCallback(() => {
    if (phase === 'paused') {
      onRelease(); // instant start (owner: "hit play and it just starts up")
    } else if (phase === 'idle') {
      arm(); // never actually started — the ceremony still applies
    }
  }, [phase, arm, onRelease]);
  // the PAUSE BUTTON (owner: "pause to do something and come back"): stays ON
  // the gameboard — letters conceal (anti-stare), tap-to-resume re-arms 3·2·1
  // owner design: LIVE/COUNTIN → pause (bars). PAUSED/IDLE → the button is
  // an ✕ that CLOSES the sheet — the explicit exit for players who don't
  // know the swipe yet. Resuming is the board tap (the paused cover).
  // Still a total escape hatch: every state has a working action.
  const pauseInPlace = useCallback(() => {
    if (phase === 'live') {
      pause();
    } else if (phase === 'countin') {
      setCountInMounted(false);
      setCountStep(null);
      setPhase('idle');
    } else {
      onClose(); // paused/idle: ✕ parks the sheet
    }
  }, [phase, pause, onClose]);
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
        // the day rides to the server when it can (offline → outbox retries)
        enqueueSubmission(
          deal.dayKey,
          finalScore,
          { guessesUsed: r.guessesUsed, solved: r.solved, bonus: r.bonus },
          wordsRef.current
        );
      }
      // owner loop: solved or failed, the sheet CLOSES — home is the reveal.
      // The close WAITS for the celebration beat (confetti / quick fail exit),
      // but the day above is already banked — a kill during the theater
      // restores to a locked, finished day (kill-window fix #2).
      const beat = r.solved ? 1600 : 800;
      doneTimer.current = setTimeout(() => {
        setPhase('done');
        onClose();
      }, beat);
    },
    [deal, score, found, onClose]
  );

  const tile = Math.min(64, Math.floor((Math.min(width, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const onBoard =
    phase === 'idle' || phase === 'countin' || phase === 'live' || phase === 'paused' || phase === 'finale';

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
        {__DEV__ && getDiagnostics() && (
          <Text style={styles.devPhase}>
            {phase}·{route}
          </Text>
        )}
        <View style={styles.top}>
          {onBoard && phase !== 'finale' && (
            // tap = pause · DEV-ONLY shortcut: long-press → straight to the finale
            // (__DEV__ fence — audit weakness #4: a skip in a one-shot daily is
            // a player-facing integrity hole in release builds)
            <Pressable
              onPress={pauseInPlace}
              onLongPress={__DEV__ ? () => setPhase('finale') : undefined}
              delayLongPress={600}>
              <View style={styles.clockWrap}>
                <Text
                  style={[
                    styles.clock,
                    { color: remaining <= 30 ? gs.timerLow : gs.timer },
                  ]}>
                  {clock}
                </Text>
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
          <View style={styles.brandCenter} pointerEvents="none">
            <Brand ink={gs.ink} />
          </View>
          {/* score lives in the ScoreHeader rail only (it showed twice) —
              the corner is the PAUSE button, the visible face of swipe-down */}
          {onBoard && phase !== 'finale' ? (
            <Pressable
              onPress={pauseInPlace}
              hitSlop={12}
              style={[styles.pauseBtn, { backgroundColor: gs.mono.bg, boxShadow: `0 2px 0 ${gs.mono.edge}` }]}>
              {phase === 'paused' || phase === 'idle' ? (
                <Text style={[styles.closeX, { color: gs.sub }]}>✕</Text>
              ) : (
                <>
                  <View style={[styles.pauseBar, { backgroundColor: gs.sub }]} />
                  <View style={[styles.pauseBar, { backgroundColor: gs.sub }]} />
                </>
              )}
            </Pressable>
          ) : onBoard ? (
            <View style={styles.pauseGhost} />
          ) : (
            <Text style={[styles.score, { color: gs.ink }]}>{score.toLocaleString()}</Text>
          )}
        </View>

        {onBoard && (
          <View style={styles.scoreHdrWrap}>
            <ScoreHeader
              gs={gs}
              score={score}
              target={TUNING.PAR_TARGET}
              marks={{ second: TUNING.PAR_SECOND, third: TUNING.PAR_THIRD }}
              width={tile * 5 + gap * 4 + 24}
            />
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
              <View
                pointerEvents={
                  (phase === 'live' && remaining > 0) || phase === 'finale' ? 'auto' : 'none'
                }>
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
                  gestureRef={boardPanRef}
                  concealed={phase !== 'live' && phase !== 'finale'}
                  countIn={phase === 'countin' ? countStep : null}
                  finale={
                    phase === 'finale'
                      ? {
                          sworb: deal.sworb,
                          restore: finaleRestore.current,
                          onProgress: onFinaleProgress,
                          onDone: onFinaleDone,
                        }
                      : null
                  }
                />
              </View>
              {countInMounted && phase === 'countin' && (
                <CountIn
                  onStep={setCountStep}
                  onRelease={onRelease}
                  onUnmount={() => {
                    setCountInMounted(false);
                    setCountStep(null);
                  }}
                />
              )}
              {active && (phase === 'paused' || phase === 'idle') && (
                <View style={styles.pausedCoverWrap}>
                  <Pressable style={styles.pausedCover} onPress={rearm}>
                    <Text style={[styles.pausedTitle, { color: gs.ink }]}>paused</Text>
                    <Text style={[styles.pausedSub, { color: gs.sub }]}>tap to resume</Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          )}
          {phase === 'done' && deal && result && (
            <View style={styles.doneWrap}>
              <ResultView
                word={deal.sworb}
                definition={deal.definition}
                archetype={deal.archetype}
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
    flex: 1, // surface painted by index's themed game layer
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
  pauseBtn: {
    flexDirection: 'row',
    gap: 4,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#26262E',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 0 #141418',
  },
  closeX: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 15,
    includeFontPadding: false,
  },
  pauseBar: {
    width: 4,
    height: 13,
    borderRadius: 2,
    backgroundColor: '#9DA2B3',
  },
  pauseGhost: {
    width: 34,
    height: 34,
  },
  devPhase: {
    position: 'absolute',
    top: 4,
    left: 8,
    zIndex: 50,
    fontSize: 9,
    fontFamily: 'Fredoka_600SemiBold',
    color: '#F5B84A',
    opacity: 0.7,
  },
  pausedCoverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  pausedCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pausedTitle: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 26,
    color: '#EDEFF7',
    letterSpacing: 1,
  },
  pausedSub: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 14,
    color: '#9DA2B3',
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
