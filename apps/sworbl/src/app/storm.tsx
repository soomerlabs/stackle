// STORM BOARD — the seed-run screen (modes-spec "ghost duels" groundwork).
// A pure practice round on a shared deterministic board: same seed = same
// board for everyone, which is the whole premise of per-seed leaderboards,
// featured seeds, and (soon) ghost races. No sworb, no clues, no day state —
// spell for 3 minutes, the score rides the practice outbox (keep-best per
// seed, server-validated with delta 0).
import { router, useLocalSearchParams } from 'expo-router';
import { AppState, InteractionManager, Share } from 'react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameBoard } from '@/components/game/game-board';
import { Icon } from '@/components/icon';
import { ScoreHeader } from '@/components/game/score-header';
import { bumpNextId, dealPractice } from '@/game/daily';
import { loadRun, saveRun, clearRun, type RunSnap } from '@/game/persist';
import { saveStormCtx, clearStormCtx } from '@/game/storm-runs';
import { type TileT } from '@/game/types';
import { stormIntensity, stormName } from '@/game/storm-seeds';
import { haptic } from '@/game/haptics';
import { type BestWord } from '@/game/persist';
import {
  mkClock, clockStart, clockPause, clockRemaining, clockElapsedMs, clockGrant, type ClockState,
} from '@/game/round-clock';
import { gameSurface } from '@/game/palette';
import { useTheme, ACCENT, ACCENT_EDGE } from '@/game/theme';
import { TUNING } from '@/game/tuning';
import { RaceBar } from '@/components/game/race-bar';
import { track } from '@/net/analytics';
import { fetchDuelGhost, postDuel, resolveShowdown, type ShowdownVerdict } from '@/net/duels';
import { enqueuePractice, fetchPractice } from '@/net/standings-remote';

type Phase = 'ready' | 'settling' | 'live' | 'done';

const SEED_RE = /^[a-z0-9-]{3,24}$/;

function fmtClock(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function StormScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    seed?: string; vs?: string; target?: string; did?: string;
    go?: string; post?: string; stake?: string; sealed?: string; stk?: string;
    callout?: string;
  }>();
  const rawSeed = typeof params.seed === 'string' ? params.seed : '';
  const seed = SEED_RE.test(rawSeed) ? rawSeed : null;
  // THE LADDER (owner): rules derive from the seed itself
  const intensity = stormIntensity(rawSeed);
  const blitz = intensity.key !== 'drizzle';
  const vsName = typeof params.vs === 'string' && params.vs.length <= 24 ? params.vs : null;
  const vsScore = Number(params.target);
  // SEALED HANDS (owner: "you only find out after you commit") — a sealed
  // duel carries NO target: no ghost, no race bar, the reveal is the verdict
  const sealedHand = params.sealed === '1';
  const duel = vsName && (sealedHand || Number.isFinite(vsScore))
    ? { name: vsName, score: sealedHand ? null : vsScore, sealed: sealedHand && !!vsName }
    : null;
  const duelId = Number(params.did);

  // THE GHOST (modes-spec): the poster's recorded run replays beside yours.
  // Real timings when the run carried them; an even synthetic climb across
  // the round otherwise (pre-timing posts). One state change per landed
  // ghost word — never per frame.
  const ghostSched = useRef<Array<{ at: number; total: number }>>([]);
  const [ghostScore, setGhostScore] = useState(0);
  useEffect(() => {
    // sealed hands never fetch the ghost — the run (and its total) stays dark
    if (!duel || duel.sealed || duel.score == null || !Number.isFinite(duelId)) return;
    const target = duel.score;
    let live = true;
    void fetchDuelGhost(duelId).then((words) => {
      if (!live) return;
      const roundMs = CT.baseSecs * 1000;
      const list = words && words.length ? words : null;
      let running = 0;
      ghostSched.current = list
        ? list.map((w, i) => {
            running += w.pts;
            const at = typeof w.t === 'number' ? Math.min(w.t, roundMs) : ((i + 1) / (list.length + 1)) * roundMs;
            return { at, total: running };
          })
        : // no words stored: a smooth 12-step synthetic climb to the target
          Array.from({ length: 12 }, (_, i) => ({
            at: ((i + 1) / 13) * roundMs,
            total: Math.round((target * (i + 1)) / 12),
          }));
      ghostSched.current.sort((a, b) => a.at - b.at);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duelId]);

  // dealNonce lets RUN IT AGAIN rebuild the SAME board fresh (deterministic
  // deal — replays are legal, the server keeps the best)
  const [dealNonce, setDealNonce] = useState(0);
  const deal = useMemo(() => (seed ? dealPractice(seed) : null), [seed, dealNonce]);

  // PAUSE & RESUME (owner: "i hit the X... i open it up, it's paused and
  // we resume") — the daily's RunSnap store, keyed by seed. Read ONCE at
  // mount; runAgain clears it so replays deal fresh.
  const savedRunRef = useRef<RunSnap | null>(null);
  if (savedRunRef.current === null && seed && dealNonce === 0) {
    savedRunRef.current = loadRun(seed);
  }
  const savedRun = dealNonce === 0 ? savedRunRef.current : null;
  const initialTiles = useMemo<TileT[] | undefined>(() => {
    if (!savedRun || savedRun.phase !== 'live') return undefined;
    if (deal) deal.setQueueIdx(savedRun.queueIdx); // the SAME letter stream continues
    bumpNextId(Math.max(...savedRun.tiles.map((t) => t.id)));
    return savedRun.tiles.map((t) => ({ ...t, spawnDrop: 0, bornAt: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal]);

  const [phase, setPhase] = useState<Phase>('ready');
  const [board, setBoard] = useState<Array<{ name: string; score: number; isMe: boolean }> | null>(null);
  // THE CROWN TARGET (owner: the daily's progress bar, here) — the
  // board's current #1; an empty board follows YOUR score (you're the
  // champ until someone shows up)
  const [crownTarget, setCrownTarget] = useState<number | null>(null);
  useEffect(() => {
    if (!seed) return;
    let live = true;
    void fetchPractice(seed, 1).then((rows) => {
      if (!live) return;
      const top = rows?.[0];
      setCrownTarget(top && !top.isMe ? top.score : null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);
  const [score, setScore] = useState(savedRun?.score ?? 0);
  const wordsRef = useRef<BestWord[]>(savedRun?.words ? [...savedRun.words] : []);
  // the board's live tile state — fed by onTiles, read by the pause snap
  const boardTilesRef = useRef<TileT[]>(initialTiles ?? deal?.tiles ?? []);
  const queueIdxRef = useRef(savedRun?.queueIdx ?? 0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const CT = useMemo(() => ({ baseSecs: intensity.clockSecs, capSecs: intensity.capSecs }), []);
  const clockRef = useRef<ClockState>(mkClock(savedRun ?? undefined));
  const [remaining, setRemaining] = useState(() => clockRemaining(clockRef.current, Date.now(), CT));

  // ---- count-in: the stepper speaks 3·2·1 (play-sheet's grammar).
  // Timers are TRACKED (leave mid-count → cleared) and entry is guarded
  // (double-tap can't stack two timelines / restart the clock).
  const countTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => countTimers.current.forEach(clearTimeout), []);
  const [verdict, setVerdict] = useState<ShowdownVerdict | null>(null);
  const startRun = () => {
    if (phaseRef.current !== 'ready') return;
    // NO COUNTDOWN (owner) — one settle beat, then the wake is the ramp
    phaseRef.current = 'settling';
    setPhase('settling');
    countTimers.current.push(
      setTimeout(() => {
        // a resume CONTINUES the paused clock (elapsed + fuel restored);
        // a fresh run starts from zero
        clockRef.current = clockStart(
          savedRunRef.current && dealNonce === 0 ? clockRef.current : mkClock(),
          Date.now()
        );
        phaseRef.current = 'live';
        setPhase('live');
      }, 350)
    );
  };
  const phaseRef = useRef<Phase>('ready');
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // BACKGROUND FAIRNESS (audit): the clock derives from wall-time — without
  // this, backgrounding bled the whole absence off the round. Same contract
  // as the daily: time only passes while you can see the board.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (phaseRef.current !== 'live') return;
      if (st === 'active') clockRef.current = clockStart(clockRef.current, Date.now());
      else clockRef.current = clockPause(clockRef.current, Date.now());
    });
    return () => sub.remove();
  }, []);

  // cold deep links have no history — done/back must always land somewhere.
  // A LIVE run PARKS on the way out (owner: "it's paused, we resume"):
  // board + clock + words snapshot to the seed, launch context to the
  // registry — the showdowns card grows a resume row.
  const leave = () => {
    if (seed && (phaseRef.current === 'live' || phaseRef.current === 'settling')) {
      clockRef.current = clockPause(clockRef.current, Date.now());
      const snap: RunSnap = {
        client: 'rn', v: 1, day: seed, phase: 'live',
        tiles: boardTilesRef.current.map(({ id, letter, col, row, ci, boost }) => ({ id, letter, col, row, ci, boost })),
        queueIdx: queueIdxRef.current,
        score,
        found: [],
        words: wordsRef.current,
        boardElapsedMs: clockElapsedMs(clockRef.current, Date.now()),
        earnedMs: clockRef.current.earnedMs,
        guessesUsed: 0, rows: [], slots: [], colors: [],
      };
      saveRun(snap);
      saveStormCtx({
        seed,
        post: params.post === '1',
        stake: Number(params.stake) > 0 ? Number(params.stake) : undefined,
        sealed: sealedHand || undefined,
        callout: typeof params.callout === 'string' && params.callout ? params.callout : undefined,
        savedAt: Date.now(),
      });
    }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // FROM THE LOBBY (owner: "dismiss that, then launch the gameboard") —
  // the sheet was the ready cover, so the board starts itself
  const autoStarted = useRef(false);
  const ceilingRef = useRef(0); // monotonic — fills only ever grow (audit)
  useEffect(() => {
    if (params.go !== '1' || autoStarted.current) return;
    autoStarted.current = true;
    // wait for the formSheet dismiss + push to SETTLE (audit: the board
    // build landed inside the overlapping native transitions)
    let t: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      t = setTimeout(() => startRun(), 160);
    });
    return () => {
      task.cancel();
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the tick loop: pure clock module decides, this screen renders ----
  useEffect(() => {
    if (phase !== 'live') return;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const h = setInterval(() => {
      const left = clockRemaining(clockRef.current, Date.now(), CT);
      setRemaining(left);
      if (ghostSched.current.length) {
        const el = clockElapsedMs(clockRef.current, Date.now());
        let g = 0;
        for (const ev of ghostSched.current) {
          if (ev.at > el) break;
          g = ev.total;
        }
        setGhostScore((cur) => (cur === g ? cur : g));
      }
      if (left <= 0) {
        clearInterval(h);
        clockRef.current = clockPause(clockRef.current, Date.now());
        // let 0:00 land for a beat, then the run banks
        settle = setTimeout(() => setPhase('done'), 800);
      }
    }, 250);
    return () => {
      clearInterval(h);
      if (settle) clearTimeout(settle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---- banked exactly once per finished run ----
  const submittedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || submittedRef.current || !seed) return;
    submittedRef.current = true;
    haptic.soft();
    // a FINISHED run retires its pause snapshot — resume is for live runs
    clearRun(seed);
    clearStormCtx(seed);
    // NO SCORE, NO SEAT (owner ruling): a zero never posts to the board —
    // quitting mid-run already leaves no trace; whiffing shouldn't either
    if (score === 0) return;
    // SEQUENCED ON VALIDATION (audit: timers raced the drain) — the post
    // and the verdict both wait for the run to be server-validated
    void enqueuePractice(seed, score, wordsRef.current).then(() => {
      void fetchPractice(seed, 5).then((rows) => rows && setBoard(rows));
      // PLAY & POST (lobby intent): fires ONCE EVER (replays never
      // re-post — audit), never over a manual post already in flight
      if (params.post === '1' && !autoPostedRef.current && posted === 'idle') {
        autoPostedRef.current = true;
        // THE NAMED GAMBLE rides the launch params (lobby picker); a
        // call-out reserves the seat for one player
        const stake = Number(params.stake) > 0 ? Number(params.stake) : undefined;
        const challenge = typeof params.callout === 'string' && params.callout ? params.callout : undefined;
        void postDuel(seed, blitz ? 'blitz' : 'themed', { stake, sealed: sealedHand, challenge }).then((r) => {
          setPosted(
            r === 'ok' ? 'ok'
              : r === 'has-open' ? 'has-open'
                : r === 'poor' ? 'poor'
                  : r === 'no-player' ? 'no-player'
                    : 'error'
          );
        });
      }
      if (duel && Number.isFinite(duelId)) {
        void resolveShowdown(duelId).then((v) => {
          if (v === 'pending') {
            setTimeout(() => {
              void resolveShowdown(duelId).then((v2) => {
                if (typeof v2 === 'object') setVerdict(v2);
              });
            }, 2500);
          } else if (typeof v === 'object') {
            setVerdict(v);
          }
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // every spelled word: superlative record + the TIME-FUEL grant (engine-
  // decided, cap-clipped) — the same economy as a daily round. useCallback:
  // the memoized board must not re-render on storm's 1Hz clock ticks.
  const onWordSpelled = useCallback((word: string, pts: number, caughtClue: boolean) => {
    wordsRef.current.push({ word, pts, t: Math.round(clockElapsedMs(clockRef.current, Date.now())) });
    const { clock } = clockGrant(clockRef.current, { len: word.length, isClue: caughtClue }, CT);
    clockRef.current = clock;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the live board reports its tiles — the pause snapshot reads them here
  const onTiles = useCallback((tiles: TileT[], queueIdx: number) => {
    boardTilesRef.current = tiles;
    queueIdxRef.current = queueIdx;
  }, []);

  const [posted, setPosted] = useState<'idle' | 'busy' | 'ok' | 'has-open' | 'poor' | 'no-player' | 'error'>('idle');
  const autoPostedRef = useRef(false);
  const postAsDuel = async () => {
    if (!seed || posted === 'busy' || posted === 'ok') return;
    setPosted('busy');
    const r = await postDuel(seed, blitz ? 'blitz' : 'themed');
    setPosted(r === 'ok' ? 'ok' : r === 'has-open' ? 'has-open' : r === 'poor' ? 'poor' : 'error');
  };

  // the run's one analytics beat — fires when the settle shows
  const trackedDone = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || trackedDone.current || !seed) return;
    trackedDone.current = true;
    track('storm_done', {
      tier: intensity.key, score, words: wordsRef.current.length,
      duel: !!duel, sealed: !!duel?.sealed, posted: params.post === '1',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const runAgain = () => {
    if (seed) {
      clearRun(seed); // replays deal FRESH — the pause snapshot retires
      clearStormCtx(seed);
    }
    savedRunRef.current = null;
    setPosted('idle');
    setGhostScore(0);
    submittedRef.current = false;
    wordsRef.current = [];
    boardTilesRef.current = [];
    queueIdxRef.current = 0;
    setBoard(null);
    setScore(0);
    setRemaining(CT.baseSecs);
    clockRef.current = mkClock();
    setDealNonce((n) => n + 1);
    phaseRef.current = 'ready';
    setPhase('ready');
    // consistency (audit): first entry auto-started, so replays do too
    setTimeout(() => startRun(), 380);
  };

  // board sizing: play-sheet's exact formula
  const { width: winW } = useWindowDimensions();
  const tile = Math.min(64, Math.floor((Math.min(winW, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);

  // SYNCHRONOUS insets (owner: "launched super high then had to come
  // down") — SafeAreaView re-measures natively inside the fullScreenModal
  // and paints frame 1 with ZERO insets, so the whole screen rendered at
  // the notch and dropped. The hook reads the root provider's resolved
  // insets on the very first frame — no jump. Daily never re-measures
  // (the sheet lives inside home), which is why only storms did this.
  const insets = useSafeAreaInsets();
  const rootPad = { paddingTop: insets.top, paddingBottom: insets.bottom };

  if (!seed) {
    return (
      <View style={[styles.root, rootPad, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.ink }]}>bad seed</Text>
        <Text style={[styles.sub, { color: theme.sub }]}>
          storm links look like /storm?seed=first-storm
        </Text>
        <Pressable onPress={leave} style={[styles.cta, styles.ctaCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.ctaText, { color: theme.ink }]}>back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, rootPad, { backgroundColor: theme.bg }]}>
      {/* top bar: seed identity + the clock + live score */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          {/* the modal RISES, so it CLOSES (owner: × not ‹) */}
          <Pressable
            onPress={leave}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="close the board (a live run pauses)">
            <Icon name="close" size={22} color={theme.icon} />
          </Pressable>
        </View>
        <View style={styles.topMid}>
          <Text style={[styles.eyebrow, { color: theme.faint }]}>STORM BOARD</Text>
          <Text style={[styles.seedName, { color: theme.ink }]}>{stormName(seed)}</Text>
        </View>
        <View style={styles.topRight}>
          <Text
            style={[
              styles.clock,
              { color: phase === 'live' && remaining <= 30 ? gameSurface(theme.mode).timerLow : theme.ink },
            ]}>
            {fmtClock(phase === 'live' ? remaining : phase === 'done' ? 0 : CT.baseSecs)}
          </Text>

        </View>
      </View>

      <View
        style={[
          styles.boardWrap,
          (phase === 'live' || phase === 'settling') && styles.boardWrapLive,
        ]}>
        {(!duel || duel.sealed) && (phase === 'live' || phase === 'settling') && (
          <View style={styles.tierStrip}>
            {intensity.key === 'hurricane' ? (
              <View style={styles.stripFlag}>
                <View style={styles.stripFlagCenter} />
              </View>
            ) : (
              <Text style={styles.stripEmoji}>{intensity.emoji}</Text>
            )}
            {/* the NAME lives in the top bar only (owner: "double title") */}
            <Text style={[styles.stripMeta, { color: theme.faint }]}>
              {intensity.key === 'hurricane' ? 'no mercy · ' : ''}best score holds the crown
            </Text>
          </View>
        )}
        {duel && !duel.sealed && duel.score != null && (phase === 'live' || phase === 'settling') && (
          <RaceBar
            theme={theme}
            width={Math.min(winW, 480) - 40}
            you={score}
            ghost={ghostScore}
            ghostName={duel.name}
            ceiling={ceilingRef.current = Math.max(ceilingRef.current, duel.score, score)}
          />
        )}
        {deal && (phase === 'live' || phase === 'settling') && (
          <View style={styles.scoreBarWrap}>
            <ScoreHeader
              score={score}
              target={crownTarget ?? Math.max(score, 1)}
              width={5 * (tile + gap) - gap + 24}
              gs={gameSurface(theme.mode)}
            />
          </View>
        )}
        {deal && phase !== 'ready' && phase !== 'done' && (
          <GameBoard
            key={`${seed}-${dealNonce}`}
            deal={deal}
            size={tile}
            gap={gap}
            initialTiles={initialTiles}
            initialScore={savedRun?.score}
            secsLeft={phase === 'live' ? remaining : undefined}
            onScore={setScore}
            onTiles={onTiles}
            onWordSpelled={onWordSpelled}
            concealed={phase !== 'live'}
            countIn={null}
          />
        )}

        {phase === 'ready' && (
          <View style={styles.cover}>
            {/* ONE title on this screen — the top bar's (owner). The
                description drops the tier name too: the clock says it. */}
            <Text style={[styles.eyebrow, { color: theme.faint }]}>
              {savedRun ? 'PAUSED' : 'SHARED BOARD'}
            </Text>
            <Text style={[styles.sub, { color: theme.sub }]}>
              {savedRun
                ? `your run holds ${savedRun.score.toLocaleString()} pts.\n${fmtClock(clockRemaining(clockRef.current, Date.now(), CT))} on the clock — pick it back up.`
                : duel
                  ? duel.sealed || duel.score == null
                    ? `${duel.name.toLowerCase()}'s hand is sealed on this board.\n${fmtClock(intensity.clockSecs)} — play blind, find out after.`
                    : `${duel.name.toLowerCase()} put up ${duel.score.toLocaleString()} on this board.\n${fmtClock(intensity.clockSecs)} — beat it.`
                  : `everyone gets this exact board.\n${fmtClock(intensity.clockSecs)} — best score counts.`}
            </Text>
            <Pressable onPress={startRun} style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
              <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>
                {savedRun ? 'RESUME' : 'PLAY'}
              </Text>
            </Pressable>
          </View>
        )}

        {phase === 'done' && (
          // THE SETTLE (owner: "the post game looks awful lol") — one
          // hierarchy: verdict · score · ONE status line · the board as a
          // real card · one candy CTA · quiet card actions.
          <View style={styles.cover}>
            <Text style={[styles.eyebrow, { color: theme.faint }]}>
              {duel
                ? verdict
                  ? verdict.won
                    ? 'SHOWDOWN WON ✦'
                    : 'SHOWDOWN LOST'
                  : duel.sealed || duel.score == null
                    ? 'SEALED HAND'
                    : score > duel.score
                      ? 'SHOWDOWN WON ✦'
                      : 'SHOWDOWN LOST'
                : 'YOUR SCORE'}
            </Text>
            <Text style={[styles.bigScore, { color: theme.ink }]}>{score.toLocaleString()}</Text>
            <Text
              // a stuck sealed verdict is TAPPABLE (audit: one missed
              // 2.5s recheck could hang the settle forever)
              onPress={
                duel?.sealed && !verdict && Number.isFinite(duelId)
                  ? () => {
                      void resolveShowdown(duelId).then((v) => {
                        if (typeof v === 'object') setVerdict(v);
                      });
                    }
                  : undefined
              }
              style={[
                styles.sub,
                {
                  color:
                    score === 0
                      ? theme.faint
                      : duel
                        ? (verdict ? verdict.won : !duel.sealed && duel.score != null && score > duel.score)
                          ? '#5FD6A8'
                          : theme.sub
                        : theme.sub,
                },
              ]}>
              {score === 0
                ? 'no score — the board never saw you'
                : duel
                  ? duel.sealed
                    ? verdict
                      ? `the seal breaks — ${duel.name.toLowerCase()} had ${verdict.theirScore.toLocaleString()}${verdict.won ? ` · pot ${verdict.pot} ✦` : ''}`
                      : 'still settling — tap here to check again'
                    : verdict
                      ? verdict.won
                        ? `you beat ${duel.name.toLowerCase()}'s ${verdict.theirScore.toLocaleString()} · pot ${verdict.pot} ✦`
                        : `${duel.name.toLowerCase()} holds it — ${verdict.theirScore.toLocaleString()}`
                      : duel.score != null && score > duel.score
                        ? `you beat ${duel.name.toLowerCase()}'s ${duel.score.toLocaleString()}`
                        : `${duel.name.toLowerCase()} holds it — ${duel.score?.toLocaleString() ?? ''}`
                  : `${wordsRef.current.length} words · best score counts`}
            </Text>
            {params.post === '1' && posted === 'has-open' && (
              <Text style={[styles.sub, { color: '#F58A66' }]}>
                you already have a showdown open — this score wasn&rsquo;t posted
              </Text>
            )}
            {params.post === '1' && posted === 'no-player' && (
              <Text style={[styles.sub, { color: '#F58A66' }]}>
                no player wears that name — posted nothing, ante untouched
              </Text>
            )}
            {/* the board, in a real card — not floating rows */}
            <View style={[styles.resultCard, { backgroundColor: theme.card }]}>
              {board == null && (
                <Text style={[styles.sub, { color: theme.faint }]}>checking the board…</Text>
              )}
              {board != null && board.length === 0 && (
                <Text style={[styles.sub, { color: theme.faint }]}>
                  no one else yet — you set the bar ✦
                </Text>
              )}
              {board != null &&
                board.map((r, i) => (
                  <View key={`${r.name}-${i}`} style={styles.lbRow}>
                    <Text style={[styles.lbRank, { color: theme.faint }]}>{i + 1}</Text>
                    <Text
                      style={[styles.lbName, { color: r.isMe ? ACCENT : theme.ink }]}
                      numberOfLines={1}>
                      {r.name.toLowerCase()}
                    </Text>
                    <Text style={[styles.lbScore, { color: theme.sub }]}>
                      {r.score.toLocaleString()}
                    </Text>
                  </View>
                ))}
            </View>
            <Pressable
              onPress={runAgain}
              style={[styles.cta, styles.ctaWide, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
              <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>PLAY AGAIN</Text>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable
                onPress={postAsDuel}
                style={[styles.cta, styles.ctaHalf, { backgroundColor: theme.card }]}>
                <Text
                  style={[styles.ctaSmallText, { color: posted === 'ok' ? '#5FD6A8' : theme.ink }]}
                  numberOfLines={2}>
                  {posted === 'ok'
                    ? 'posted — waiting ✦'
                    : posted === 'busy'
                      ? 'posting…'
                      : posted === 'has-open'
                        ? 'one open already'
                        : posted === 'poor'
                          ? 'not enough ✦'
                          : posted === 'error'
                            ? 'post failed — again?'
                            : 'post a showdown'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Share.share({
                    // UNIVERSAL LINK (owner: AASA on sworbl.com) — installed
                    // app opens the board; everyone else lands on the web
                    message: `sworbl storm ⛈ ${score} pts in the ${stormName(seed)}. same board, every player. beat my score: https://sworbl.com/storm?seed=${seed}`,
                  }).catch(() => {})
                }
                style={[styles.cta, styles.ctaHalf, { backgroundColor: theme.card }]}>
                <Text style={[styles.ctaSmallText, { color: theme.ink }]}>share</Text>
              </Pressable>
            </View>
            <Pressable onPress={leave} style={styles.homeLink}>
              <Text style={[styles.ctaText, { color: theme.sub }]}>done ›</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  // symmetric rails (owner: "so off center") — the title owns true center
  topLeft: { width: 64, alignItems: 'flex-start' },
  topMid: { flex: 1, alignItems: 'center' },
  topRight: { alignItems: 'flex-end', width: 64 },
  eyebrow: { fontFamily: 'Fredoka_600SemiBold', fontSize: 11, letterSpacing: 1.2 },
  seedName: { fontFamily: 'Fredoka_600SemiBold', fontSize: 17 },
  clock: { fontFamily: 'Fredoka_600SemiBold', fontSize: 19, fontVariant: ['tabular-nums'] },
  scoreLine: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12 },
  boardWrap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  // play matches the DAILY's geometry: board anchored high under the bar
  boardWrapLive: { justifyContent: 'flex-start', paddingTop: 6 },
  scoreBarWrap: {
    marginBottom: 6,
  },
  tierStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  stripEmoji: { fontSize: 22 },
  stripMeta: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  stripFlag: {
    width: 22,
    height: 22,
    borderRadius: 6, borderCurve: 'continuous',
    backgroundColor: '#E5484D',
    boxShadow: 'inset 0 -2.5px 0 #8C2328',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripFlagCenter: {
    width: 8,
    height: 8,
    borderRadius: 2.5, borderCurve: 'continuous',
    backgroundColor: '#17171C',
  },
  cover: { alignItems: 'center', gap: 12, paddingHorizontal: 28, alignSelf: 'stretch' },
  title: { fontFamily: 'Fredoka_600SemiBold', fontSize: 26 },
  bigScore: { fontFamily: 'Fredoka_600SemiBold', fontSize: 54, includeFontPadding: false },
  sub: { fontFamily: 'Fredoka_600SemiBold', fontSize: 13.5, textAlign: 'center', lineHeight: 20 },
  ctaCard: {},
  homeLink: { paddingVertical: 6 },
  cta: {
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 28,
    paddingVertical: 13,
    minWidth: 180,
    alignItems: 'center',
  },
  // the settle's grammar (owner: post game redo)
  resultCard: {
    alignSelf: 'stretch',
    borderRadius: 18, borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 9,
    marginTop: 2,
  },
  ctaWide: { alignSelf: 'stretch' },
  actionRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  ctaHalf: { flex: 1, minWidth: 0, paddingHorizontal: 12, justifyContent: 'center' },
  ctaSmallText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  ctaText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 15, letterSpacing: 0.8 },
  lbBox: { alignSelf: 'stretch', gap: 6, paddingHorizontal: 8 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lbRank: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12, width: 16, textAlign: 'right' },
  lbName: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14, flex: 1 },
  lbScore: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14, fontVariant: ['tabular-nums'] },
});
