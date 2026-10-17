---
paths:
  - "**/*.spec.{ts,tsx}"
  - "**/test-setup.ts"
  - "**/vitest.config.mts"
---

# Écrire une spec

Vitest partout ([ADR 0007](../../docs/adr/0007-vite-et-vitest-outillage-unique.md)). Le code de
test a son propre jeu de règles oxlint, dans le bloc `overrides` de `.oxlintrc.json` ; la liste et
son relevé sont dans l'[ADR 0008](../../docs/adr/0008-lint-et-format-oxlint-oxfmt.md).

- **Nom de fichier en `*.spec.ts`**, jamais `*.test.ts` — `consistent-test-filename` le fait
  échouer.
- **Importer ce qu'on utilise** — `import { describe, expect, it } from 'vitest'`. Les globales de
  Vitest sont désactivées (pas de `globals: true`) : un fichier de test se lit seul.
- **Côté front, pas d'auto-nettoyage** de Testing Library : le `afterEach(cleanup)` est explicite
  dans `apps/web/src/test-setup.ts`. Ne pas le retirer.
- **Assertions strictes** : `toStrictEqual` plutôt que `toEqual`, `toBe(true)` plutôt que
  `toBeTruthy`. Les matchers flous affirment au lieu de prouver, comme le `as`. Le lint le fait
  respecter.
- **Descriptions en anglais** : `it('rejects an empty image')`.
- **Deux `it` de même titre dans un `describe`** font échouer `yarn lint`.
- `vitest` est le seul import externe autorisé en plus de `tslib` dans `type:domain` et
  `type:application` (`allowedExternalImports`, `eslint.config.mjs`).
- **Specs de `apps/web`** : elles lisent le français, fixé par `test-setup.ts` (jsdom annonce
  `en-US`). Une clé i18n inconnue ou un paramètre d'interpolation manquant fait échouer le test.
- **Specs d'adapters** : contre la vraie techno ou sur réponses enregistrées — voir [`tdd.md`](tdd.md).
