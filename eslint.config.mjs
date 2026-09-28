import nx from '@nx/eslint-plugin';
import oxlint from 'eslint-plugin-oxlint';

// Hybrid lint setup (ADR 0008): oxlint is the primary linter (correctness, TypeScript, React,
// imports) and runs first through `yarn lint`. ESLint is kept ONLY for the rules oxlint cannot
// express — both driven by the Nx project graph:
//   - @nx/enforce-module-boundaries: the hexagonal boundaries by tag (ADR 0002), below.
//   - @nx/dependency-checks: each package.json must list the deps its code imports (per-lib config).
// `eslint-plugin-oxlint` is spread last and disables every ESLint rule oxlint already owns, so the
// two linters never report the same finding twice. The `no-as` and `no-unused-vars` conventions
// now live in .oxlintrc.json.
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
              // The allow-list of external imports forbids everything else. `vitest` is on it
              // because the specs import it explicitly (ADR 0008) instead of relying on globals;
              // it is the test runner of the lib, never reachable from the production code, which
              // no spec file is part of.
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:shared'],
              allowedExternalImports: ['tslib', 'vitest'],
            },
            {
              // The application depends on the domain alone and talks to ports only.
              sourceTag: 'type:application',
              onlyDependOnLibsWithTags: ['type:domain', 'type:shared'],
              allowedExternalImports: ['tslib', 'vitest'],
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
              // i18next lives behind the facade of libs/shared/i18n (ADR 0011): an app reads its
              // messages through `useMessages`, never through the library itself. Radix lives
              // inside the components of libs/shared/ui (ADR 0012), in the same way.
              bannedExternalImports: [
                'i18next',
                'react-i18next',
                'i18next-browser-languagedetector',
                'radix-ui',
                '@radix-ui/*',
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
    // ADR 0013 — `domain` and `application` never throw: an expected failure is a `Result`, an
    // exceptional one has no channel here and lives in `infrastructure`/`apps`. A core ESLint
    // rule rather than a custom one: oxlint does not know `no-restricted-syntax`, so this is
    // the layer of "what oxlint cannot express" (ADR 0008), and `eslint-plugin-oxlint` cannot
    // switch it off. `unwrap` is banned too — it throws in the caller's place, which would
    // reopen through the side door what the first selector closes.
    // Specs and test doubles are exempt: a double stands where an adapter would, and a spec
    // builds its fixtures with `unwrap` on purpose.
    // `basePath` anchors the globs at the workspace root: ESLint runs from each lib
    // (`eslint .` in its folder) and resolves `files` against the config in effect, where a
    // root-relative glob would otherwise match nothing.
    basePath: import.meta.dirname,
    files: ['libs/*/domain/**/*.ts', 'libs/*/application/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/testing/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement',
          message:
            'domain and application never throw (ADR 0013): return an Err instead. Exceptions belong to infrastructure and apps.',
        },
        {
          selector: "CallExpression[callee.name='unwrap']",
          message:
            'unwrap throws, and domain and application never do (ADR 0013): handle the Err. unwrap is for infrastructure, apps and specs.',
        },
      ],
    },
  },
  // Must stay last: disable every ESLint rule that oxlint already reports, leaving only the
  // Nx-graph rules above active under ESLint.
  ...oxlint.configs['flat/all'],
];
