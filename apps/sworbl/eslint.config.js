// ESLint for the app (audit M8: none existed — every eslint-disable in
// src was decoration). Lean on purpose: the monorepo's hoisted plugin
// soup broke eslint-config-expo, and the rules that PAY here are the
// hooks rules — the codebase's hardest bugs were all effect/dep bugs.
const tsParser = require('@typescript-eslint/parser');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  { ignores: ['dist/**', 'ios/**', 'android/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },
];
