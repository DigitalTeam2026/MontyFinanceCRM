import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Theme regression guard: hardcoded colors must not creep back into
      // components. Use the CSS-variable theme tokens (var(--surface), var(--text),
      // var(--primary), …) defined in src/index.css instead. Warn-first so the
      // existing backlog doesn't break the build; tighten changed files to error
      // over time. The override layer in index.css re-tints neutral/colored
      // Tailwind utilities in dark themes, so those are allowed — only raw hex
      // color literals (inline styles and arbitrary `[#hex]` classes) are flagged.
      'no-restricted-syntax': [
        'warn',
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            'Hardcoded hex color — use a theme token instead (var(--surface), var(--text), var(--primary), var(--link), var(--success)/--danger/--warn-*, …). See the token set in src/index.css.',
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]",
          message:
            'Hardcoded hex color in a className/template literal — use a theme token (var(--…)) instead. See src/index.css.',
        },
      ],
    },
  },
  {
    // The theme system itself legitimately defines raw colors (theme swatches,
    // token values). Exempt it from the no-hardcoded-color guard.
    files: ['src/services/themeService.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  }
);
