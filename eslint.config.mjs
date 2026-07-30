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
      // ADR 0002 — les frontieres hexagonales sont appliquees ici, pas seulement documentees.
      // Trois dimensions de tags, independantes :
      //   type:*    la couche          (domain, application, infrastructure, shared, app)
      //   context:* le bounded context (recognition, none pour les libs partagees)
      //   scope:*   le cote deploye    (api, web, shared)
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // -- Couches ------------------------------------------------------
            {
              // Le domaine ne depend de rien : ni framework, ni ORM, ni HTTP.
              // La liste blanche d'imports externes vaut interdiction de tout le reste.
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:shared'],
              allowedExternalImports: ['tslib'],
            },
            {
              // L'application depend du domaine seul et ne parle qu'aux ports.
              sourceTag: 'type:application',
              onlyDependOnLibsWithTags: ['type:domain', 'type:shared'],
              allowedExternalImports: ['tslib'],
            },
            {
              // L'infrastructure implemente les ports ; elle ne connait pas l'application.
              sourceTag: 'type:infrastructure',
              onlyDependOnLibsWithTags: ['type:domain', 'type:shared'],
            },
            {
              // Une lib partagee ne depend que d'autres libs partagees.
              sourceTag: 'type:shared',
              onlyDependOnLibsWithTags: ['type:shared'],
            },
            {
              // Seule une app (composition root) a le droit de connaitre l'infrastructure.
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
              // Un contexte n'importe jamais un autre contexte : le croisement se fait
              // dans l'orchestrateur de apps/api (ADR 0003), sur des DTO de frontiere.
              sourceTag: 'context:recognition',
              onlyDependOnLibsWithTags: ['context:recognition', 'context:none'],
            },
            {
              // context:none = libs/shared/* : importables par tous, n'importent aucun contexte.
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
      // Un parametre prefixe par `_` est intentionnellement inutilise : signature imposee
      // par une interface, adaptateur bouchon qui ignore son entree, etc.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
