// eslint.config.js — flat config (ESLint 10). Scope is DELIBERATELY narrow: the 8 pure
// kernel modules (sworble-*.js), words.js, and tests/*.js. That's it.
//
// index.html is NOT linted and NEVER will be by this config: it's ~7k lines of hand-tuned
// inline styles/markup/logic. Running a formatter (or even a strict linter) over it is a
// diff bomb for zero benefit — the pure modules are where behavior bugs actually hide;
// index.html's presentation code is reviewed by eye. If logic keeps migrating out of
// index.html into pure modules (the ongoing trend), it inherits this config for free the
// moment it lands in a sworble-*.js file.
//
// Rule philosophy: catch REAL bugs (no-undef, no-unused-vars, eqeqeq footguns), never fight
// the established house style. This codebase mixes `var`-based ES5-ish modules (sworble-core,
// sworble-daily, sworble-seed, sworble-solver) with more modern `const`/`let`/arrow/async
// modules (sworble-net, sworble-run, sworble-status, sworble-store) — both are intentional,
// neither is "wrong", so this config doesn't force one style over the other (no `no-var`,
// no `prefer-const`). Every file leans on the `catch (e) {}` swallow-and-fall-back idiom and
// `!= null` / `== null` (intentionally loose — checks null OR undefined in one comparison) —
// both are load-bearing house idioms, not oversights, so they're allowed rather than fought.
'use strict';

// NOTE: deliberately NOT pulling in `@eslint/js`'s `recommended` preset — that's a second
// devDependency for a bundle of ~90 rules when this codebase only needs a dozen, hand-picked
// below (core rules ship inside `eslint` itself; only the "recommended" BUNDLE lives in the
// separate package). Keeps this repo's total devDependency count at exactly one.
const CORE_RULES = {
  // correctness — the "catch real problems" tier
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-func-assign': 'error',
  'no-const-assign': 'error',
  'no-redeclare': 'error',
  'no-fallthrough': 'error',
  'no-irregular-whitespace': 'error',
  'no-self-compare': 'error',
  'no-sparse-arrays': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};

// Only the globals actually referenced across the pure modules + tests (grep-verified) — no
// wildcard "browser"/"node" env pulled in as a dependency; hand-listing keeps this config's
// only devDependency to eslint itself.
const sharedBuiltins = {
  Array: 'readonly', Boolean: 'readonly', JSON: 'readonly', Math: 'readonly',
  Number: 'readonly', Object: 'readonly', Promise: 'readonly', Set: 'readonly',
  String: 'readonly', isFinite: 'readonly', parseInt: 'readonly',
  console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
};

const pureModuleGlobals = {
  ...sharedBuiltins,
  // the IIFE wrapper's root-detection ternary + a couple of runtime feature checks
  window: 'readonly', globalThis: 'readonly', module: 'writable',
  fetch: 'readonly', AbortController: 'readonly', localStorage: 'readonly',
};

const nodeTestGlobals = {
  ...sharedBuiltins,
  require: 'readonly', module: 'writable', process: 'readonly',
  __dirname: 'readonly', __filename: 'readonly',
};

module.exports = [
  {
    // the 8 pure kernel modules: IIFE scripts, `window.Foo = API` + `module.exports = API`
    // dual-export tail. Mixed var/const/let and function/arrow styles are both native here.
    files: ['sworble-core.js', 'sworble-daily.js', 'sworble-net.js', 'sworble-run.js',
      'sworble-seed.js', 'sworble-solver.js', 'sworble-status.js', 'sworble-store.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: pureModuleGlobals,
    },
    rules: {
      ...CORE_RULES,
      eqeqeq: ['error', 'smart'], // smart = strict, EXCEPT `== null`/`!= null` (the house idiom)
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }], // `catch (e) {}` swallow-and-fall-back is load-bearing throughout
      'no-var': 'off', // the ES5-ish modules use `var` on purpose (see file header)
      'no-console': 'error', // pure modules must stay silent — a stray console.log is always a debug leftover
    },
  },
  {
    // words.js: a real ES module (`export const FALLBACK_WORDS = \`...\``), nothing else —
    // no logic to speak of, but sourceType must match or the parser rejects the export.
    files: ['words.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: sharedBuiltins,
    },
    rules: CORE_RULES,
  },
  {
    files: ['tests/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeTestGlobals,
    },
    rules: {
      ...CORE_RULES,
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off', // tests print their own pass/fail lines on purpose
    },
  },
];
