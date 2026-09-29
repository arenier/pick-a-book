---
paths:
  - "**/*.{ts,tsx,mts}"
---

# Écrire du TypeScript

## Typage prouvé, jamais affirmé

- TypeScript strict, pas de `any` implicite. Le lint type-aware (`no-unsafe-*`) bloque la fuite
  d'un `any`.
- **Pas de `as`.** `typescript/consistent-type-assertions` en `assertionStyle: 'never'` fait
  échouer `yarn lint` sur une assertion.
  - Pour contraindre un type sans perdre l'inférence : **`satisfies`**.
  - Quand le type n'est réellement pas connu à la compilation (`process.env`, réponse HTTP,
    `document.getElementById`) : un **type guard** ou une vérification explicite, qui prouve au
    lieu d'affirmer.
  - `as const` n'est pas concerné : il restreint un littéral, il n'affirme rien.
- **Pas de primitives nues dans le domaine** : value objects qui valident à la construction.

## Asynchrone

Le lint type-aware (`oxlint-tsgolint`) vérifie la justesse asynchrone : `no-floating-promises`,
`no-misused-promises`, `await-thenable`, `promise-function-async`.

- Une promesse qu'on n'attend pas volontairement se marque par **`void`**.
- **Une fonction qui rend une `Promise` porte `async`**, même sans `await` dans le corps : un échec
  doit **rejeter**, pas jeter de façon synchrone. `require-await` est désactivée pour cette raison
  ([ADR 0008](../../docs/adr/0008-lint-et-format-oxlint-oxfmt.md)). Ne pas « corriger » un `async`
  qui paraît inutile.

## Nommage et langue

- Fichiers en `kebab-case`, classes en `PascalCase`, use cases en verbe explicite
  (`pick-book-for-user.use-case.ts`).
- **Anglais dans le code** : identifiants, commentaires, messages d'erreur, logs.
- Dans `apps/web`, aucun texte affiché à l'utilisateur n'est écrit dans le code — voir
  [`web-interface.md`](web-interface.md).
