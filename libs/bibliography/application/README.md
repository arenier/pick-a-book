# bibliography-application

Use cases du contexte de réconciliation bibliographique.

Ne dépendent que du domaine et ne parlent qu'aux ports (ADR 0002). Les types de
`reconciliation.dto.ts` sont les **DTO de frontière** du contexte : c'est tout ce que
l'orchestrateur de `apps/api` a le droit de manipuler (ADR 0003).

## Use cases

- `ReconcileDetectedBooksUseCase` : réconcilie les livres d'une analyse. Pilote la **cascade de
  requêtes** (titre + auteur, auteur seul, titre seul, segments), demande à `matchBook` le verdict
  de chaque étape, consulte l'autorité quand il le demande, et enregistre chaque tentative. Ne
  cherche que les livres sans verdict définitif : le rejouer est sans risque.
- `GetShelfReconciliationUseCase` : relit l'état conservé, sans interroger le catalogue.
- `DecideAmbiguityUseCase` : enregistre le choix de l'utilisateur sur un livre ambigu.

`run-with-limits.ts` borne les appels au catalogue : 4 en parallèle, 8 s chacun, un nouvel essai sur
`unavailable`, 18 s pour l'ensemble. Un livre non joint est « non vérifié », jamais « inconnu ».

## Doubles de test

`src/testing/` (`@pick-a-book/bibliography-application/testing`) : `InMemoryBookReconciliationRepository`,
`FakeBibliographicCatalog`, `FakeAuthority` et `reconcile-scenario.ts`. Ils sont la seule copie :
`apps/api` les importe pour ses specs.

## Commandes

```bash
yarn nx test bibliography-application
yarn nx lint bibliography-application
yarn nx build bibliography-application
```
