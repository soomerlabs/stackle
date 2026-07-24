// STORM BOARD — the seed-run screen (modes-spec "ghost duels" groundwork).
// A pure practice round on a shared deterministic board: same seed = same
// board for everyone, which is the whole premise of per-seed leaderboards,
// featured seeds, and (soon) ghost races. No sworb, no clues, no day state —
// spell for 3 minutes, the score rides the practice outbox (keep-best per
// seed, server-validated with delta 0).
import { router, useLocalSearchParams } from 'expo-router';
import { AppState, Share } from 'react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameBoard } from '@/components/game/game-board';
import { dealPractice } from '@/game/daily';
import { stormName } from '@/game/storm-seeds';
import { haptic } from '@/game/haptics';
import { type BestWord } from '@/game/persist';
import {
  mkClock, clockStart, clockPause, clockRemaining, clockElapsedMs, clockGrant, type ClockState,
} from '@/game/round-clock';
import { gameSurface } from '@/game/palette';
import { useTheme, ACCENT, ACCENT_EDGE } from '@/game/theme';
import { TUNING } from '@/game/tuning';
import { RaceBar } from '@/components/game/race-bar';
import { claimShowdown, fetchDuelGhost, postDuel, resolveShowdown, type ShowdownVerdict } from '@/net/duels';
import { enqueuePractice, fetchPractice } from '@/net/standings-remote';

type Phase = 'ready' | 'countin' | 'live' | 'done';

const SEED_RE = /^[a-z0-9-]{3,24}$/;

function fmtClock(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function StormScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ seed?: string; clock?: string; vs?: string; target?: string; did?: string }>();
  const rawSeed = typeof params.seed === 'string' ? params.seed : '';
  const seed = SEED_RE.test(rawSeed) ? rawSeed : null;
  // DUEL CONTEXT (open duels): vs+target = a posted run to beat; clock=120
  // is the blitz format (2:00, pure points)
  const blitz = params.clock === '120';
  const vsName = typeof params.vs === 'string' && params.vs.length <= 24 ? params.vs : null;
  const vsScore = Number(params.target);
  const duel = vsName && Number.isFinite(vsScore) ? { name: vsName, score: vsScore } : null;
  const duelId = Number(params.did);

  // THE GHOST (modes-spec): the poster's recorded run replays beside yours.
  // Real timings when the run carried them; an even synthetic climb across
  // the round otherwise (pre-timing posts). One state change per landed
  // ghost word — never per frame.
  const ghostSched = useRef<Array<{ at: number; total: number }>>([]);
  const [ghostScore, setGhostScore] = useState(0);
  useEffect(() => {
    if (!duel || !Number.isFinite(duelId)) return;
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
            total: Math.round((duel.score * (i + 1)) / 12),
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

  const [phase, setPhase] = useState<Phase>('ready');
  const [board, setBoard] = useState<Array<{ name: string; score: number; isMe: boolean }> | null>(null);
  const [countStep, setCountStep] = useState<'3' | '2' | '1' | null>(null);
  const [score, setScore] = useState(0);
  const wordsRef = useRef<BestWord[]>([]);

  const CT = { baseSecs: blitz ? 120 : TUNING.BASE_SECS, capSecs: blitz ? 200 : TUNING.CAP_SECS };
  const clockRef = useRef<ClockState>(mkClock());
  const [remaining, setRemaining] = useState(CT.baseSecs);

  // ---- count-in: the stepper speaks 3·2·1 (play-sheet's grammar).
  // Timers are TRACKED (leave mid-count → cleared) and entry is guarded
  // (double-tap can't stack two timelines / restart the clock).
  const countTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => countTimers.current.forEach(clearTimeout), []);
  const [claimLost, setClaimLost] = useState(false);
  const [verdict, setVerdict] = useState<ShowdownVerdict | null>(null);
  const startRun = () => {
    if (phaseRef.current !== 'ready') return;
    // SHOWDOWN CLAIM (owner: taking locks it 1v1) — fire-and-check; a
    // lost race flips the cover instead of wasting the run
    if (duel && Number.isFinite(duelId)) {
      void claimShowdown(duelId).then((r) => {
        if (r === 'taken') setClaimLost(true);
      });
    }
    // NO COUNTDOWN (owner) — one settle beat, then the wake is the ramp
    phaseRef.current = 'countin';
    setPhase('countin');
    countTimers.current.push(
      setTimeout(() => {
        setCountStep(null);
        clockRef.current = clockStart(mkClock(), Date.now());
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

  // cold deep links have no history — done/back must always land somewhere
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

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
    enqueuePractice(seed, score, wordsRef.current);
    // give the outbox a beat to land, then standings + the showdown verdict
    // (retry once — the validated run may still be in flight)
    const t = setTimeout(() => {
      void fetchPractice(seed, 5).then((rows) => rows && setBoard(rows));
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
    }, 900);
    return () => clearTimeout(t);
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

  const [posted, setPosted] = useState<'idle' | 'busy' | 'ok' | 'has-open' | 'error'>('idle');
  const postAsDuel = async () => {
    if (!seed || posted === 'busy' || posted === 'ok') return;
    setPosted('busy');
    const r = await postDuel(seed, blitz ? 'blitz' : 'themed');
    setPosted(r === 'ok' ? 'ok' : r === 'has-open' ? 'has-open' : 'error');
  };

  const runAgain = () => {
    setPosted('idle');
    setGhostScore(0);
    submittedRef.current = false;
    wordsRef.current = [];
    setBoard(null);
    setScore(0);
    setRemaining(CT.baseSecs);
    clockRef.current = mkClock();
    setDealNonce((n) => n + 1);
    setPhase('ready');
  };

  // board sizing: play-sheet's exact formula
  const { width: winW } = useWindowDimensions();
  const tile = Math.min(64, Math.floor((Math.min(winW, 480) - 32) / (5 + 4 * 0.16)));
  const gap = Math.round(tile * 0.16);

  if (!seed) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
        <Text style={[styles.title, { color: theme.ink }]}>bad seed</Text>
        <Text style={[styles.sub, { color: theme.sub }]}>
          storm links look like /storm?seed=first-storm
        </Text>
        <Pressable onPress={leave} style={[styles.cta, styles.ctaCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.ctaText, { color: theme.ink }]}>back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
      {/* top bar: seed identity + the clock + live score */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Pressable onPress={leave} hitSlop={12}>
            <Text style={[styles.backGlyph, { color: theme.icon }]}>‹</Text>
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
          <Text style={[styles.scoreLine, { color: theme.sub }]}>{score} pts</Text>
        </View>
      </View>

      <View style={styles.boardWrap}>
        {duel && (phase === 'live' || phase === 'countin') && (
          <RaceBar
            theme={theme}
            width={Math.min(winW, 480) - 40}
            you={score}
            ghost={ghostScore}
            ghostName={duel.name}
            ceiling={Math.max(duel.score, score)}
          />
        )}
        {deal && phase !== 'ready' && phase !== 'done' && (
          <GameBoard
            key={`${seed}-${dealNonce}`}
            deal={deal}
            size={tile}
            gap={gap}
            secsLeft={phase === 'live' ? remaining : undefined}
            onScore={setScore}
            onWordSpelled={onWordSpelled}
            concealed={phase !== 'live'}
            countIn={phase === 'countin' ? countStep : null}
          />
        )}

        {phase === 'ready' && (
          <View style={styles.cover}>
            <Text style={[styles.eyebrow, { color: theme.faint }]}>SHARED BOARD</Text>
            <Text style={[styles.title, { color: theme.ink }]}>{stormName(seed)}</Text>
            <Text style={[styles.sub, { color: theme.sub }]}>
              {claimLost
                ? 'someone took this showdown first — the board is still yours to run.'
                : duel
                  ? `${duel.name.toLowerCase()} put up ${duel.score.toLocaleString()} on this board.\n${blitz ? '2:00, pure points' : '3 minutes'} — beat it.`
                  : `everyone gets this exact board.\n${blitz ? '2:00, pure points' : '3 minutes'} — best run counts.`}
            </Text>
            <Pressable onPress={startRun} style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
              <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>RUN IT</Text>
            </Pressable>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.cover}>
            <Text style={[styles.eyebrow, { color: theme.faint }]}>
              {duel ? (score > duel.score ? 'DUEL WON ✦' : 'DUEL LOST') : 'RUN BANKED'}
            </Text>
            <Text style={[styles.bigScore, { color: theme.ink }]}>{score}</Text>
            {duel && (
              <Text style={[styles.sub, { color: score > duel.score ? '#5FD6A8' : theme.sub }]}>
                {score > duel.score
                  ? `you beat ${duel.name.toLowerCase()}'s ${duel.score.toLocaleString()}`
                  : `${duel.name.toLowerCase()} holds it — ${duel.score.toLocaleString()}`}
              </Text>
            )}
            {verdict && (
              <Text style={[styles.sub, { color: verdict.won ? '#5FD6A8' : theme.faint }]}>
                {verdict.won ? '+12 showdown points ✦' : '+2 for the fight'} · settled
              </Text>
            )}
            <Text style={[styles.sub, { color: theme.sub }]}>
              {wordsRef.current.length} words · score sent — best run counts
            </Text>
            {board != null && board.length === 0 && (
              <Text style={[styles.sub, { color: theme.faint }]}>first run on this board ✦</Text>
            )}
            {board != null && board.length > 0 && (
              <View style={styles.lbBox}>
                {board.map((r, i) => (
                  <View key={`${r.name}-${i}`} style={styles.lbRow}>
                    <Text style={[styles.lbRank, { color: theme.faint }]}>{i + 1}</Text>
                    <Text
                      style={[styles.lbName, { color: r.isMe ? ACCENT : theme.ink }]}
                      numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={[styles.lbScore, { color: theme.sub }]}>{r.score}</Text>
                  </View>
                ))}
              </View>
            )}
            <Pressable onPress={runAgain} style={[styles.cta, { backgroundColor: ACCENT, boxShadow: `0 4px 0 ${ACCENT_EDGE}` }]}>
              <Text style={[styles.ctaText, { color: '#FFFFFF' }]}>RUN IT AGAIN</Text>
            </Pressable>
            <Pressable
              onPress={postAsDuel}
              style={[styles.cta, styles.ctaCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.ctaText, { color: posted === 'ok' ? '#5FD6A8' : theme.ink }]}>
                {posted === 'ok'
                  ? 'showdown posted — waiting for a taker ✦'
                  : posted === 'busy'
                    ? 'posting…'
                    : posted === 'has-open'
                      ? 'you already have one open — one at a time'
                      : posted === 'error'
                        ? 'post failed — again?'
                        : 'post a showdown'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Share.share({
                  message: `sworbl storm ⛈ ${seed} — ${score} pts in 3:00. same board, every player. beat my run: sworbl://storm?seed=${seed}`,
                }).catch(() => {})
              }
              style={[styles.cta, styles.ctaCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.ctaText, { color: theme.ink }]}>share this board</Text>
            </Pressable>
            <Pressable onPress={leave} style={styles.homeLink}>
              <Text style={[styles.ctaText, { color: theme.sub }]}>done ›</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
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
  backGlyph: { fontFamily: 'Fredoka_600SemiBold', fontSize: 30, marginTop: -4 },
  // symmetric rails (owner: "so off center") — the title owns true center
  topLeft: { width: 64, alignItems: 'flex-start' },
  topMid: { flex: 1, alignItems: 'center' },
  topRight: { alignItems: 'flex-end', width: 64 },
  eyebrow: { fontFamily: 'Fredoka_600SemiBold', fontSize: 11, letterSpacing: 1.2 },
  seedName: { fontFamily: 'Fredoka_600SemiBold', fontSize: 17 },
  clock: { fontFamily: 'Fredoka_600SemiBold', fontSize: 19, fontVariant: ['tabular-nums'] },
  scoreLine: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12 },
  boardWrap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  cover: { alignItems: 'center', gap: 14, paddingHorizontal: 32 },
  title: { fontFamily: 'Fredoka_600SemiBold', fontSize: 26 },
  bigScore: { fontFamily: 'Fredoka_600SemiBold', fontSize: 54 },
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
  ctaText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 15, letterSpacing: 0.8 },
  lbBox: { alignSelf: 'stretch', gap: 6, paddingHorizontal: 8 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lbRank: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12, width: 16, textAlign: 'right' },
  lbName: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14, flex: 1 },
  lbScore: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14, fontVariant: ['tabular-nums'] },
});
