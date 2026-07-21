# Foundation Cleanup Implementation Plan (pre-redesign)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the score model cumulative (locked decision A) and collapse the dead mode-switch
branches + dead surfaces the audit found, so the UI redesign starts on a legible single-path base.

**Architecture:** Three independent tasks against the `index.html` monolith (mirrored to
`Sworble.dc.html`) plus the pure `sworble-status.js` selector. Task 1 is a scoring-logic change with
Node unit tests; Tasks 2 and 3 are deletions/inlining verified by the mirror check + browser smoke.

**Tech Stack:** Vanilla ES5-ish JS, Claude "dc" template runtime, `node:assert` tests, `npm test`.

## Global Constraints

- **`index.html` MUST be mirrored** to `Sworble.dc.html` after every change:
  `cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html`. Enforced by
  `tests/mirror-check.js` in `npm test`. Never edit `Sworble.dc.html` directly.
- **Immutability:** never mutate state/objects in place; return new copies (repo + user rule).
- **Every `{{ binding }}` referenced by a template must be defined in the render-vals for every
  state**, or the runtime leaves a literal `{{ }}` hole. When deleting a surface, delete BOTH its
  template block AND its render-val keys.
- **Determinism unchanged:** no new `Math.random`/`Date.now` in seeded paths.
- **Mode identity = `(dailyMode-opt, stacklMode-state)`:** `(true,false)`=casual, `(false,true)`=stacks,
  `(false,false)`=practice. `puzzleOn()` is a retired always-true switch.
- **Locked decision A (this plan):** score is CUMULATIVE — the running total of your best points per
  distinct word (no top-7 cap, no double-count for re-spelling). Casual = a personal running total;
  stacks = the 2-min total that banks `STACKL_BEST_PREFIX`.
- **Locked decision B (NOT this plan):** casual leaderboard ranks by `sworb.rank`, stacks by best
  score. The basis is already built (`dailyStatus().sworb.rank`, `STACKL_BEST_PREFIX`); the wiring is
  deferred into the redesign, which rebuilds `homeLeadersVals`/`lbStub`/`submitScore`. Do NOT wire it
  here.
- **Keep the words-list display machinery** (`sevenFromWords`, `seven.words`, `SEVEN_PREFIX`,
  `mergeDailySeven`) intact — the current home/recap still render `seven.words`. This plan changes
  only the TOTAL those surfaces read (best-7 → cumulative); the redesign deletes the machinery when it
  replaces the surfaces.

---

### Task 1: Cumulative scoring (decision A)

Make the score you watch climb — and the "best today" that persists — a cumulative total instead of
the best-7 sum, in both casual and stacks. The words-list display stays; only the total changes.

**Files:**
- Modify: `sworble-status.js` (add `cumulativeTotal`; use it for `seven.total` + `bestToday`)
- Modify: `index.html` (`bestSevenTotal` method `1401`; live score `3508`; `endRound` banking
  `2533`, `2558`, `2565`)
- Mirror: `Sworble.dc.html`
- Test: `tests/sworble-status.test.js`

**Interfaces:**
- Consumes: `roundWords` = `[{ word, pts, best, colors }]` (each committed word; `pts>0` scored).
- Produces: `SworbleStatus.cumulativeTotal(roundWords) -> number` — sum of the best `pts` per
  DISTINCT lowercased word (uncapped). `dailyStatus().seven.total` and `.bestToday` now equal this
  cumulative total; `.seven.words` (the top-7 display list) is unchanged.

- [ ] **Step 1: Write the failing test** — add to the sworble-status test file:

```js
// cumulativeTotal: sums best-pts per distinct word, uncapped, no double-count
{
  const S = require('../sworble-status.js');
  assert.strictEqual(typeof S.cumulativeTotal, 'function', 'cumulativeTotal exported');
  // 8 distinct words -> ALL count (best-7 would drop the smallest); dup word -> best pts only
  const rw = [
    { word: 'a', pts: 10 }, { word: 'b', pts: 9 }, { word: 'c', pts: 8 },
    { word: 'd', pts: 7 }, { word: 'e', pts: 6 }, { word: 'f', pts: 5 },
    { word: 'g', pts: 4 }, { word: 'h', pts: 3 },        // 8th word: +3 (best-7 would drop it)
    { word: 'A', pts: 2 },                                // dup of 'a' at lower pts -> ignored
    { word: 'z', pts: 0 }, { word: '', pts: 5 },          // zero/blank -> ignored
  ];
  assert.strictEqual(S.cumulativeTotal(rw), 10+9+8+7+6+5+4+3, 'uncapped sum of best-per-word');
  assert.strictEqual(S.cumulativeTotal([]), 0, 'empty -> 0');
  assert.strictEqual(S.cumulativeTotal(null), 0, 'null-safe');
  // dailyStatus.seven.total + bestToday reflect the cumulative total (not the best-7 cap)
  const ds = S.dailyStatus({ live: { active: true, over: false, roundWords: rw, tilesCount: 5 } });
  assert.strictEqual(ds.seven.total, 52, 'live seven.total is cumulative');
  assert.strictEqual(ds.bestToday, 52, 'bestToday is cumulative');
  assert.strictEqual(ds.seven.words.length, 7, 'display list still capped at 7');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` (or `node tests/sworble-status.test.js`)
Expected: FAIL — `cumulativeTotal` is not a function / totals still capped at 7 (=49, not 52).

- [ ] **Step 3: Add `cumulativeTotal` to `sworble-status.js`** — insert after `sevenFromWords`
(after line 26), and export it:

```js
  // Cumulative score: sum of the best pts per DISTINCT word, UNCAPPED (no top-7 slice) and no
  // double-count for re-spelling. This is the running total the arcade/daily now shows (decision A).
  function cumulativeTotal(roundWords) {
    const map = {};
    for (const w of (Array.isArray(roundWords) ? roundWords : [])) {
      const word = (w && w.word) ? String(w.word).toLowerCase() : '';
      const pts = num(w && w.pts);
      if (!word || pts <= 0) continue;
      if (!map[word] || pts > map[word]) map[word] = pts;
    }
    return Object.values(map).reduce((a, b) => a + b, 0);
  }
```

Then in `dailyStatus`, keep `seven.words` from `sevenFromWords` but set the TOTAL to cumulative.
Change the three `seven`-total assignments (lines 49, 50, 54) so `.total` is cumulative while
`.words` stays top-7, and make `bestToday`'s live/saved terms cumulative:

```js
    if (liveNow) { seven = sevenFromWords(live.roundWords); seven.total = cumulativeTotal(live.roundWords); sevenLive = true; }
    else if (!s.done && s.savedRun && Array.isArray(s.savedRun.roundWords) && s.savedRun.roundWords.length) { seven = sevenFromWords(s.savedRun.roundWords); seven.total = cumulativeTotal(s.savedRun.roundWords); sevenLive = true; }
    else {
      const st = s.storedSeven;
      const words = (st && Array.isArray(st.words)) ? st.words.slice(0, 7) : [];
      seven = { words, total: num(st && st.score) || num(s.storedDailyBest) };
      sevenLive = false;
    }
```

and the `bestToday` block (line 58) last two terms:

```js
      liveNow ? seven.total : 0,
      (!s.done && s.savedRun) ? cumulativeTotal(s.savedRun.roundWords) : 0
```

and add to the export (line 93): `cumulativeTotal` →
`const API = { sevenFromWords, cumulativeTotal, rankFor, dailyStatus };`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (status tests green; cumulative = 52; words list length 7).

- [ ] **Step 5: Rewire `index.html` live score + banking to cumulative**

Replace the `bestSevenTotal` method (`1401-1410`) with a thin delegate (single source of truth):

```js
  cumulativeTotal(roundWords) { return SworbleStatus.cumulativeTotal(roundWords); }
```

Live score (`3508`) — drop the `puzzleOn` ternary, always cumulative:

```js
      const score = this.cumulativeTotal(nextRoundWords); // decision A: cumulative running total (all modes)
```

`endRound` casual banking — `mergeDailySeven` (`2533`) still writes `seven.words` for the current
home display, but its stored TOTAL must be the cumulative score. In `mergeDailySeven` (`2438-2447`),
change the stored total from the seven total to `runScore` (which is now cumulative). Read the
function and set the persisted `{ score }` field to the passed `runScore`, keeping `words` from
`sevenFromWords`. (The stacks best at `2565` already banks `this.state.score`, now cumulative — no
change; the `PUZZLE_BEST_PREFIX` write at `2558` already uses `this.state.score` — no change.)

- [ ] **Step 6: Mirror + full test + browser smoke**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html
npm test
```
Expected: all green (mirror check + status tests). Then browser (hard reload `cmd+shift+r`): spell
8+ words in casual — the score climbs cumulatively past what a best-7 cap would show; the 8th word
adds points. In stacks, the round score accumulates and banks as today's best.

- [ ] **Step 7: Commit**

```bash
git add sworble-status.js tests/ index.html Sworble.dc.html
git commit -m "feat: cumulative scoring (decision A) — running total per distinct word, all modes"
```

---

### Task 2: Collapse baked mode switches + dead branches

Make the single live path legible: inline the always-true `puzzleOn()` / always-false `dailyDone()`,
delete their dead arms, re-home the low-time warning onto stacks, drop dead `toggleDaily`, fix the
duplicate style key.

**Files:**
- Modify: `index.html` (`puzzleOn` `1391`; `dailyDone` `2511`; the two `!puzzleOn()` arms;
  `timeHudLabel`/`timeText`/`timeKey` `6017-6021`; low-time warning `~2656`; `toggleDaily` `5848`;
  `timeValStyle` duplicate `animation` `~6020/6026`)
- Mirror: `Sworble.dc.html`

**Interfaces:**
- Consumes: nothing new. Produces: nothing new — pure simplification; live behavior identical.

- [ ] **Step 1: Inline `puzzleOn()`** — it returns `true` unconditionally (`1391`). For each
`this.puzzleOn()` read, replace with the live truth and delete the dead `!puzzleOn()` (classic) arm.
Grep first: `grep -n "puzzleOn" index.html`. For a `this.puzzleOn() ? A : B`, keep `A`; for
`!this.puzzleOn()`-guarded blocks, delete the block. Note `roundSecs()` (`1411`)
`this.stacklOn() ? 120 : (this.puzzleOn() ? 180 : ...)` collapses to `this.stacklOn() ? 120 : 180`.
Remove the `puzzleOn()` method definition last, once no references remain.

- [ ] **Step 2: Re-home the ≤60s low-time warning** — the warning near `2656` is gated on the dead
`!this.puzzleOn()`. Stacks is the mode that actually wants a low-time cue: change the gate to
`this.stacklOn()`. Read the block first to confirm the exact condition.

- [ ] **Step 3: Inline `dailyDone()`** — returns `false` unconditionally (`2511`). Delete
`dailyDone()`-guarded dead branches (the "swipe up to practice" fallback among them — Task 3 removes
its template). Remove the method once unreferenced.

- [ ] **Step 4: Delete `toggleDaily`** (`5848`) — referenced nowhere (`grep -n toggleDaily index.html`
should show only the definition). Remove the whole `toggleDaily: () => { ... }` render-val.

- [ ] **Step 5: Fix duplicate `animation` key** in `timeValStyle` (`~6020` and `~6026`) — an object
literal with two `animation:` keys silently keeps the second. Read the block, decide the intended
value per mode, and leave exactly one `animation` key.

- [ ] **Step 6: Simplify the 4th HUD cell** — with `puzzleOn` inlined, `timeHudLabel`/`timeText`/
`timeKey` (`6017-6021`) reduce to two live cases: `stacklOn()` → TIME countdown, else casual → WORDS
count. Remove the dead classic/`tut` arms that keyed off `puzzleOn()`. (Naming/meaning polish for
this cell is decision E, deferred to the redesign — here, only remove the dead arm.)

- [ ] **Step 7: Mirror + test + browser smoke**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html
npm test
```
Expected: green. Browser (hard reload): casual HUD shows WORDS, stacks HUD shows the TIME countdown
and a low-time cue under 60s; no literal `{{ }}` holes appear in either mode.

- [ ] **Step 8: Commit**

```bash
git add index.html Sworble.dc.html
git commit -m "refactor: collapse baked puzzleOn/dailyDone switches; re-home low-time warning to stacks"
```

---

### Task 3: Delete dead surfaces

Remove the surfaces the audit confirmed never render, template + render-vals together.

**Files:**
- Modify: `index.html` (dead sworb modal `~1000-1021`; practice dock `~505-516`; desktop aside
  `~331-356`; word-budget: "Words per run" stepper `~803-812` + how-to `htTimeLine` `~5527`)
- Mirror: `Sworble.dc.html`

**Interfaces:**
- Consumes/Produces: none. Deletion only — every removed `{{ binding }}` must have its render-val key
  removed in the same commit (and vice-versa) so no hole or dead key remains.

- [ ] **Step 1: Delete the dead sworb guess MODAL** (`~1000-1021`) and its render-val cluster.
Grep each key to confirm it is used ONLY by the modal before deleting:
`openSworbModal`, `sworbHeaderShow`, `sworbPip*`, `sworbGuessBtnStyle`, `onSworbInput`, `onSworbKey`,
`submitSworb`, `cancelSworb`, `closeSworb`, `sworbInput*Style`, `sworbClueLine`, `sworbGuessesLine`,
`sworbShakeKey`. (The live stepper+keyboard sworb flow — `sworbGuess`/`sworbSlots` — is DIFFERENT;
keep it. Verify by grep that the kept names are distinct from the deleted ones.)

- [ ] **Step 2: Delete the dead "swipe up to practice" dock** (`~505-516`) and any render-vals unique
to it (the `dailyDone()` fallback was already de-branched in Task 2; here remove its template + keys).

- [ ] **Step 3: Delete the dead desktop aside** (`~331-356`, `asideStyle:{display:'none'}`) and the
`asideStyle` key + any stale classic-timer copy vals it referenced.

- [ ] **Step 4: Remove the word-budget UI ghosts** — the settings "Words per run" stepper
(`~803-812`) and the how-to `htTimeLine` copy describing the removed budget (`~5527`). Grep the
stepper's opt key (`parGuesses` / "Words per run") to confirm nothing live reads it before removing
the control; if `parGuesses()` (`1398`) is now referenced only by dead code, remove it too.

- [ ] **Step 5: Mirror + test + browser smoke**

```bash
cp index.html Sworble.dc.html && printf '\n' >> Sworble.dc.html
npm test
grep -c "{{ " index.html   # sanity: no NEW unresolved bindings vs. before
```
Expected: green. Browser (hard reload): home, casual, and stacks all render with no `{{ }}` holes and
no console "never resolved" warnings; settings sheet has no "Words per run" row; no desktop aside.

- [ ] **Step 6: Commit**

```bash
git add index.html Sworble.dc.html
git commit -m "chore: delete dead surfaces (sworb modal, practice dock, desktop aside, word-budget UI)"
```

---

## Out of scope (deferred to the redesign)

- **Decision B wiring** — theme-first casual leaderboard + best-score stacks. Basis is built
  (`sworb.rank`, `STACKL_BEST_PREFIX`); implement it as the redesign rebuilds `homeLeadersVals` /
  `lbStub` / `submitScore`.
- **Full deletion of the seven machinery** (`sevenFromWords`, `SEVEN_PREFIX`, `mergeDailySeven`,
  `dailySeven`) — happens when the redesign replaces the home/recap surfaces that still render
  `seven.words`.
- **Decisions D (sworb-safe naming) and E (4th HUD cell meaning)** — cosmetic, decided in the redesign.
- **The `clues` → `themeWords` alias removal** (still load-bearing) and the internal
  `sworble`→`sworbl` / `stackl`→`stacks` code rename — separate logged TODOs.

## Self-Review

- **Coverage:** A = Task 1 (cumulative total + rewired consumers). Mode-switch/dead-code cleanup =
  Tasks 2-3. B and machinery deletion are explicitly deferred with reasons. ✅
- **Placeholders:** none — every code step shows the code or the exact grep-and-transform. ✅
- **Type consistency:** `cumulativeTotal(roundWords)->number` defined in Task 1 Step 3, consumed in
  Step 5 and by `dailyStatus`; `seven.words` stays `[{word,pts,best}]`, `seven.total`/`bestToday`
  become the cumulative number. ✅
