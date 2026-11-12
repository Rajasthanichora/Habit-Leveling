// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // React Compiler-readiness rules (enabled by eslint-config-expo v58's
      // react-hooks v7). The codebase relies on well-established legacy
      // patterns — Animated values via `useRef(x).current`, props-to-state
      // sync effects in modals. These advisory rules would require a full
      // Compiler migration; disable until that happens.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/component-tag-factory': 'off',
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
