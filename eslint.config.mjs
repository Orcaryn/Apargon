import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noLongDashes from './eslint-rules/no-long-dashes.js';
import requireElseIf from './eslint-rules/require-else-if.js';
import requireIntentionalComments from './eslint-rules/require-intentional-comments.js';

const constFunctionDeclaration = {
  selector: "VariableDeclaration[kind='const']:has(VariableDeclarator[init.type=/^(ArrowFunctionExpression|FunctionExpression)$/][init.body.type='BlockStatement'])",
};
const avoidOrDefaultMessage = 'Avoid || defaults because they collapse distinct falsy values. Handle the expected state explicitly.';
const restrictedSyntax = [
  {
    selector: "CatchClause ReturnStatement[argument.type='Literal'][argument.value=true]",
    message: 'Never convert an exception into success. Translate it to the boundary contract or let it propagate.',
  },
  { selector: "LogicalExpression[operator='||'][right.type='ArrayExpression'][right.elements.length=0]", message: avoidOrDefaultMessage },
  { selector: "LogicalExpression[operator='||'][right.type='ObjectExpression'][right.properties.length=0]", message: avoidOrDefaultMessage },
  { selector: "LogicalExpression[operator='||'][right.type='Literal']", message: avoidOrDefaultMessage },
  { selector: "LogicalExpression[operator='||'][right.type='TemplateLiteral'][right.expressions.length=0]", message: avoidOrDefaultMessage },
];

export default defineConfig([
  { name: 'workspace/ignores', ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    name: 'workspace/prose',
    files: ['**/*.{js,mjs,cjs,ts}'],
    plugins: {
      dashes: { rules: { 'no-long-dashes': noLongDashes } },
      personal: { rules: { 'require-else-if': requireElseIf, 'require-intentional-comments': requireIntentionalComments } },
    },
    rules: { 'dashes/no-long-dashes': 'error' },
  },
  {
    name: 'workspace/config',
    files: ['eslint.config.mjs', 'eslint-rules/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },
  {
    name: 'workspace/app',
    files: ['src/**/*.ts', 'test/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { '@stylistic': stylistic },
    languageOptions: { globals: globals.node, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'init-declarations': ['error', 'always'],
      'arrow-body-style': ['error', 'as-needed'],
      'no-unneeded-ternary': 'error',
      'object-shorthand': 'error',
      'prefer-const': 'error',
      'prefer-object-spread': 'error',
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'never', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
        { blankLine: 'always', prev: '*', next: constFunctionDeclaration },
        { blankLine: 'always', prev: constFunctionDeclaration, next: '*' },
        { blankLine: 'always', prev: '*', next: ['for', 'if', 'switch', 'function'] },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: ['return', 'throw'] },
      ],
      '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'personal/require-else-if': 'error',
    },
  },
]);
