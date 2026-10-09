import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Catches real mistakes (undefined names, unused code, broken hook order) rather than style.
export default [
  {ignores: ['dist/**', 'node_modules/**', 'vendor/**', 'public/**', 'docs/**']},
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {ecmaVersion: 'latest', sourceType: 'module', parserOptions: {ecmaFeatures: {jsx: true}}, globals: {...globals.browser, ...globals.node}},
    plugins: {react, 'react-hooks': reactHooks},
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'no-unused-vars': ['error', {args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_'}],
      'no-empty': ['error', {allowEmptyCatch: true}],
    },
  },
];
