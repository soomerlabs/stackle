'use strict';
const assert = require('assert');
const S = require('../sworbl-solver.js');
const expand = (l) => (l === 'q' ? 'qu' : l);
// 3x3 board:  c a t
//             o d o
//             g x e
const T = [
  { id: 1, row: 0, col: 0, letter: 'c' }, { id: 2, row: 0, col: 1, letter: 'a' }, { id: 3, row: 0, col: 2, letter: 't' },
  { id: 4, row: 1, col: 0, letter: 'o' }, { id: 5, row: 1, col: 1, letter: 'd' }, { id: 6, row: 1, col: 2, letter: 'o' },
  { id: 7, row: 2, col: 0, letter: 'g' }, { id: 8, row: 2, col: 1, letter: 'x' }, { id: 9, row: 2, col: 2, letter: 'e' },
];
const cat = S.findWord(T, { word: 'cat', expand, diag: true });
assert.deepStrictEqual(cat, [1, 2, 3], 'cat spells left-to-right across the top row');
const cod = S.findWord(T, { word: 'cod', expand, diag: true });
assert.deepStrictEqual(cod, [1, 4, 5], 'cod uses c(0,0)->o(1,0)->d(1,1) diagonally');
assert.strictEqual(S.findWord(T, { word: 'zzz', expand, diag: true }), null, 'absent word -> null');
assert.strictEqual(S.findWord(T, { word: 'coo', expand, diag: true }), null, 'only one o adjacent to c; no reuse -> null');
console.log('sworbl-solver: findWord passed');
