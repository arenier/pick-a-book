import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // ADR 0002 — the hexagonal boundaries are enforced here, not merely documented.
      // Three independent tag dimensions:
      //   type:*    the layer          (domain, application, infrastructure, shared, app)
      //   context:* the bounded context (recognition, none for shared libs)
      //   scope:*   the deployed side  (api, web, shared)
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // -- Layers -------------------------------------------------------
            {
              // The domain depends on nothing: no framework, no ORM, no HTTP.
              // The allow-list of external imports forbids everything else.
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:shared'],
              allowedExternalImports: ['tslib'],
            },
            {
              // The application depends on the domain alone and talks to ports only.
              sourceTag: 'type:application',
              onlyDependOnLibsWithTags: ['type:domain', 'type:shared'],
              allowedExternalImports: ['tslib'],
            },
            {
              // Infrastructure implements the ports; it does not know the application.
              sourceTag: 'type:infrastructure',
              onlyDependOnLibsWithTags: ['type:domain', 'type:shared'],
            },
            {
              // A shared lib depends on other shared libs only.
              sourceTag: 'type:shared',
              onlyDependOnLibsWithTags: ['type:shared'],
            },
            {
              // Only an app (composition root) may know about infrastructure.
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:domain',
                'type:application',
                'type:infrastructure',
                'type:shared',
              ],
            },
            // -- Bounded contexts ---------------------------------------------
            {
              // A context never imports another context: the crossing happens in the
              // orchestrator of apps/api (ADR 0003), on boundary DTOs.
              sourceTag: 'context:recognition',
              onlyDependOnLibsWithTags: ['context:recognition', 'context:none'],
            },
            {
              // context:none = libs/shared/*: importable by all, importing no context.
              sourceTag: 'context:none',
              onlyDependOnLibsWithTags: ['context:none'],
            },
            // -- Back / front --------------------------------------------------
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // A parameter prefixed with `_` is intentionally unused: signature imposed by an
      // interface, stub adapter ignoring its input, and so on.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // A type assertion silences the compiler without proving anything. Where a type has
      // to be pinned down, `satisfies` checks the value against it and keeps inference;
      // where the type is genuinely unknown at compile time, a type guard is the answer.
      // `as const` is unaffected — it narrows a literal, it does not assert.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    },
  },
];
