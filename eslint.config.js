import js from '@eslint/js';
import globals from 'globals';
import tsESLint from 'typescript-eslint';

export default [
  { ignores: ['node_modules/', 'dist/', 'coverage/', 'build/'] },
  js.configs.recommended,
  ...tsESLint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': 'off', // Allow console.log for debugging
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
      'no-unused-vars': 'off',
    },
  },
];
