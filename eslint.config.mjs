import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs' } },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  { rules: { eqeqeq: 'warn', semi: 'warn', quotes: ['warn', 'single'] } },
];
