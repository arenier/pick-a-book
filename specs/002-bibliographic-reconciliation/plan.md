# Implementation Plan: Réconciliation bibliographique des livres détectés

**Branch**: `002-bibliographic-reconciliation` | **Date**: 2026-09-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-bibliographic-reconciliation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Chaque livre détecté par une analyse est confronté à un référentiel bibliographique et reçoit un
statut — confirmé, ambigu, non trouvé, non vérifié — affiché sous la liste des livres, que
l'utilisateur peut compléter en levant une ambiguïté ; tout est conservé avec l'analyse, y compris
les faits qui permettront plus tard d'analyser où l'interprétation se trompe (US5).

Approche technique :
- **Fondation du contexte `bibliography`** (ADR 0010) : `libs/bibliography/{domain,application,infrastructure}`.
  Le domaine porte la règle de correspondance — une fonction pure, `matchBook`, sur les primitives
  de `libs/shared/text-match` — et l'agrégat `BookReconciliation` (statut déduit, décision unique,
  tentatives jamais réécrites). Réglages d'appariement provisoires, rassemblés dans un objet que
  l'ADR #20 confirmera (research §5).
- **Référentiel derrière un port**, `BibliographicCatalogPort`, livré avec deux adapters sans réseau
  (`stub`, `offline`). L'adapter du vrai référentiel est **bloqué par l'ADR #20** (research §1) : tout
  le reste se construit et se démontre sans lui.
- **Premier orchestrateur** d'`apps/api` (ADR 0003) : `ReconcileShelfPhotoUseCase` lit les livres
  détectés dans `recognition` (nouveau `GetDetectedBooksUseCase`) et les confie à `bibliography`.
  Exposé par `POST /shelf-photos/{id}/reconciliation`, **idempotent** : le même appel réconcilie la
  première fois et relance les « non vérifiés » ensuite (research §3). La levée d'ambiguïté,
  `POST /shelf-photos/{id}/books/{position}/decision`, ne touche que `bibliography`.
- **Persistance** : trois tables propres à `bibliography`, migrations et table de suivi séparées ;
  `migrateDatabase` passe dans une lib partagée et l'API n'ouvre plus qu'un pool Postgres pour tous
  les contextes (research §8).
- **Écran** : une slice `reconciliation` composée avec `photo-upload` par le shell (research §11).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 26.5.1 ; React 19 côté `apps/web`.

**Primary Dependencies**: aucune nouvelle. `drizzle-orm`/`pg` (déjà là, ADR 0006) pour la
persistance ; `libs/shared/text-match` (déjà là) pour la comparaison approchée ; NestJS pour les deux
routes ; `fetch` natif côté web. Le client HTTP du vrai référentiel sera `fetch` natif lui aussi
(tâche bloquée par l'ADR #20).

**Storage**: Postgres (Neon en production, compose en local) — trois tables nouvelles
(`data-model.md` §Stockage). Rien dans le bucket.

**Testing**: Vitest partout (ADR 0007). Domaine et application sans infra (référentiel factice, dépôt
en mémoire, faux timers pour les délais) ; dépôt Drizzle contre le Postgres du compose ; adapter réel
sur réponses enregistrées ; HTTP par spec de bout en bout comme `shelf-photos.http.spec.ts` ; web
avec `fetch` injecté. SC-001/SC-002 par le bench, manuel, après l'ADR #20 (research §13).

**Target Platform**: API sur Cloud Run (ADR 0004) ; navigateur mobile pour l'écran.

**Project Type**: Application web — nouvelles libs back (`bibliography`), extension de
`recognition`, de `apps/api` et d'`apps/web`.

**Performance Goals**: tous les statuts d'une étagère de 30 livres en ≤ 20 s après l'affichage de la
liste (SC-003) : 4 recherches en parallèle, 8 s par recherche, échéance globale de 18 s (research §7).

**Constraints**: une panne du référentiel ne fait jamais échouer l'appel (FR-008) ; jamais de
confirmation sans notice correspondante (FR-004) ; jamais d'ambiguïté levée d'office (FR-010) ; une
tentative n'est jamais réécrite (FR-016) ; aucun score ni cause exposé par l'API (FR-018) ; aucun
texte utilisateur renvoyé par l'API (ADR 0011).

**Scale/Scope**: 20–200 photos/mois, ~10–40 livres par photo : quelques milliers de recherches par
mois au plus, et autant de lignes de tentatives — aucune préoccupation de volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Application à cette feature |
|---|---|
| I. TDD non-négociable | Chaque unité s'écrit rouge/vert/refactor, dans l'ordre que fixera `tasks.md` : `matchBook` sur tables de cas avant toute règle ; agrégat et transitions ; use cases avec doubles ; dépôt Drizzle contre Postgres ; adapters ; orchestrateur ; routes ; slice web. Les réglages provisoires d'appariement sont couverts par les cas de FR-003 à FR-007, de sorte que l'ADR #20 pourra les changer sous filet. |
| II. Hexagonal et bounded contexts étanches | `bibliography` n'importe pas `recognition` ni l'inverse — le croisement se fait dans l'orchestrateur d'`apps/api`, sur des DTO (`data-model.md` §DTO de frontière). Le livre détecté est désigné par une référence opaque (analyse, position), sans clé étrangère entre les schémas (research §4). L'orchestrateur séquence et traduit : la règle « pas de livres sans analyse aboutie » vit dans `recognition`, les règles de correspondance dans `bibliography`. Chaque nouvelle lib porte ses trois tags ; `eslint.config.mjs` gagne la contrainte `context:bibliography`. Schéma, SQL et migrations restent dans `bibliography-infrastructure`. |
| III. Typage prouvé, jamais affirmé | Value objects validés pour toute donnée du domaine (`data-model.md`) ; statuts et issues en unions discriminées ; corps de la décision et réponses du référentiel validés par type guards (JSON `unknown` à la réception) ; pas de `as`. |
| IV. Outillage unique | Aucun outil ni dépendance ajouté. Le petit limiteur de parallélisme est écrit localement plutôt que d'importer une lib (`type:application` n'autorise que `tslib`). `libs/shared/sql-migrations` est une lib Nx ordinaire, Vitest + `tsc`. |
| V. Français dans la doc, anglais dans le code | Textes de l'écran dans `features/reconciliation/i18n/{fr,en}.json`, clés ajoutées dans les deux langues au même commit ; `model/` et `api/` rendent des types d'échec, traduits par une table explicite dans l'UI. Code, commentaires, commits en anglais. |

**Articulation avec les ADR** : la spec ne tranche pas le référentiel, le plan non plus — il
**isole** la décision derrière un port et **bloque** la seule tâche qui en dépend (research §1).
Les réglages d'appariement sont posés comme provisoires, à confirmer par l'ADR #20, qui reste
l'instance de décision (constitution § Articulation). Fonder `bibliography` n'ouvre pas d'ADR : ADR
0010 l'a acté et prévoit que la lib arrive avec sa première implémentation. La réconciliation reste
synchrone dans la requête, dans le cadre d'ADR 0003.

Aucune violation : pas d'entrée dans Complexity Tracking.

**Post-Phase 1 re-check** : le modèle de données, le contrat HTTP et les deux refactors d'exploitation
(`migrateDatabase` partagé, pool unique) ne font franchir aucune frontière nouvelle. `sql-migrations`
est `type:shared` / `context:none` / `scope:api` : importable par les deux `infrastructure` et par
`apps/api`, il n'importe aucun contexte. Gate toujours au vert.

## Project Structure

### Documentation (this feature)

```text
specs/002-bibliographic-reconciliation/
├── plan.md                        # This file (/speckit-plan command output)
├── research.md                    # Phase 0 output (/speckit-plan command)
├── data-model.md                  # Phase 1 output (/speckit-plan command)
├── quickstart.md                  # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── reconciliation-api.md      # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md            # /speckit-specify
└── tasks.md                       # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
libs/bibliography/domain/src/lib/                 # nouveau — type:domain, context:bibliography, scope:api
├── shelf-book-ref.ts, book-query.ts, catalog-name.ts, catalog-record.ts,
│   catalog-record-id.ts, work-key.ts, match-score.ts          # value objects (data-model.md)
├── match-book.ts                                 # matchBook + MatchingSettings (research §5)
├── match-book.spec.ts                            # tables de cas FR-003 à FR-007
├── book-reconciliation.ts                        # agrégat : statut déduit, needsAttempt, decide
├── book-reconciliation.spec.ts
├── bibliographic-catalog.port.ts                 # BibliographicCatalogPort, CatalogUnavailable
├── book-reconciliation-repository.port.ts
└── *.error.ts                                    # BookAlreadyReconciled, BookNotAmbiguous, UnknownCandidate, BookReconciliationNotFound

libs/bibliography/application/src/lib/            # nouveau — type:application
├── reconciliation.dto.ts                         # DTO de frontière (data-model.md)
├── reconcile-detected-books.use-case.ts (+ .spec.ts)   # limites, délais, not_verified
├── decide-ambiguity.use-case.ts (+ .spec.ts)
├── run-with-limits.ts (+ .spec.ts)               # parallélisme borné + échéances, sans dépendance
└── testing/                                      # référentiel factice, dépôt en mémoire

libs/bibliography/infrastructure/                 # nouveau — type:infrastructure
├── drizzle.config.ts                             # migrations propres au contexte
└── src/lib/
    ├── drizzle/schema.ts, drizzle/migrations/
    ├── drizzle-book-reconciliation-repository.adapter.ts (+ .spec.ts, contre Postgres)
    ├── stub-bibliographic-catalog.adapter.ts (+ .spec.ts)
    └── offline-bibliographic-catalog.adapter.ts (+ .spec.ts)
    # plus tard, après l'ADR #20 : <référentiel>-bibliographic-catalog.adapter.ts, sur réponses enregistrées

libs/shared/sql-migrations/                       # nouveau — type:shared, context:none, scope:api
└── src/lib/migrate-database.ts (+ .spec.ts)      # déplacé depuis recognition-infrastructure, table de suivi en paramètre

libs/recognition/
├── domain/src/lib/shelf-scan-not-completed.error.ts
├── application/src/lib/get-detected-books.use-case.ts (+ .spec.ts)
└── infrastructure/src/lib/stub-shelf-scanner.adapter.ts   # + une détection sans auteur (research §12)

apps/api/src/
├── database/database.module.ts (+ .spec.ts)      # pool unique, migrations de chaque contexte au démarrage
├── recognition/                                  # archive reçoit le pool ; filtre : + ShelfScanNotCompleted → 409 ; module exporte GetDetectedBooksUseCase
├── bibliography/
│   ├── bibliography.module.ts                    # composition root du contexte : ports → adapters
│   ├── bibliographic-catalog.factory.ts (+ .spec.ts)
│   ├── bibliography-exception.filter.ts
│   └── book-decisions.controller.ts (+ .spec.ts) # POST …/books/{position}/decision
├── orchestration/
│   ├── reconcile-shelf-photo.use-case.ts (+ .spec.ts)   # recognition → bibliography, DTO seulement
│   ├── shelf-photo-reconciliation.controller.ts (+ .spec.ts)
│   └── reconciliation.http.spec.ts               # de bout en bout sur l'app Nest
├── config/environment.ts (+ .spec.ts)            # + BIBLIOGRAPHIC_CATALOG_PROVIDER
└── app/app.module.ts                             # + DatabaseModule, BibliographyModule, orchestration

apps/api/vite.config.mts                          # copie les migrations des deux contextes
apps/web/src/
├── app/app.tsx                                   # compose photo-upload et reconciliation
└── features/
    ├── photo-upload/                             # UploadState.success + scanId ; prop de rendu du résultat
    └── reconciliation/                           # nouvelle slice
        ├── api/reconcile-shelf-photo.ts, api/decide-ambiguity.ts (+ specs)
        ├── model/reconciled-book.ts, model/reconciliation-state.ts, model/reconciliation-failure.ts
        ├── ui/reconciled-book-list.tsx, ui/ambiguity-picker.tsx, ui/use-reconciliation.ts (+ specs)
        └── i18n/fr.json, i18n/en.json

eslint.config.mjs                                 # + contrainte context:bibliography
package.json                                      # db:generate couvre les deux contextes
.env.example                                      # + BIBLIOGRAPHIC_CATALOG_PROVIDER
tools/bench/                                      # après l'ADR #20 : mode réconciliation (SC-001, SC-002)
docs/parking.md                                   # + revenir sur une décision d'ambiguïté
```

**Structure Decision** : le contexte `bibliography` naît en trois libs sous `libs/bibliography/`,
calquées sur `libs/recognition/` (même découpage, mêmes conventions de tags, de tests et de
composition root dans `apps/api/src/<contexte>/`). Le seul code qui connaît deux contextes est
`apps/api/src/orchestration/`, dossier nouveau, comme ADR 0003 le prévoit. Côté front, une slice par
feature, composées par le shell. Deux refactors d'exploitation accompagnent la seconde persistance
du projet — migrations partagées, pool unique — et restent en `infrastructure`, `shared` et
composition root (research §8).

## Complexity Tracking

*Sans objet — aucune violation de la Constitution Check ci-dessus.*
