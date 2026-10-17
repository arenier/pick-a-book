# Implementation Plan: Réconciliation bibliographique des livres détectés

**Branch**: `003-bibliographic-reconciliation` | **Date**: 2026-09-28 | **Révisé**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-bibliographic-reconciliation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

**Révision du 17/10/2026** : réalignement sur l'ADR 0014 (BnF, cascade, autorités, score, notices
conservées) et sur la spec 002 livrée par la PR #82 (historique, détail d'un envoi, propriétaire,
`Result`, limite de requêtes). L'enrichissement part dans une spec 004 (research §14).

## Summary

Chaque livre détecté par une analyse est confronté au catalogue général de la BnF et reçoit un
statut — confirmé, ambigu, non trouvé, non vérifié — affiché sous la liste des livres, sur l'écran
de résultat comme dans le détail d'un envoi de l'historique ; l'utilisateur peut lever une
ambiguïté et relancer une vérification depuis l'un ou l'autre. Tout est conservé avec l'analyse,
y compris les notices reçues et les faits qui permettront plus tard d'analyser où l'interprétation
se trompe (US5).

Approche technique :
- **Fondation du contexte `bibliography`** (ADR 0010) : `libs/bibliography/{domain,application,infrastructure}`.
  Le domaine porte la règle d'appariement de l'ADR 0014 — lecture décomposée, notice lue en entier,
  segment expliqué, regroupement par œuvre selon notre règle, notice représentative, score de
  réconciliation — en fonctions pures sur les primitives de `libs/shared/text-match`, et l'agrégat
  `BookReconciliation` (statut déduit, décision unique, tentatives jamais réécrites). Réglages de
  l'étude de l'issue #20 dans un objet validé (research §5).
- **Cascade dans `application`** : titre et auteur, auteur seul, titre seul, segments, arrêtée au
  premier verdict ; formes rejetées des autorités avant d'écarter une notice ; 4 requêtes en
  parallèle, 8 s par requête, une nouvelle tentative, 18 s au total (research §7).
- **Ports** `BibliographicCatalogPort` et `AuthorityPort`, une requête à la fois, `Result` aux
  frontières (ADR 0013). Adapters `bnf` (SRU, `zod`, `fetch` injecté, réponses enregistrées), `stub`
  et `offline`.
- **Premier orchestrateur** d'`apps/api` (ADR 0003) : il lit le détail d'un envoi par
  `GetShelfScanUseCase` (spec 002, propriétaire compris) et le confie à `bibliography`. Trois routes :
  `POST` et `GET /shelf-photos/{id}/reconciliation`, `POST /shelf-photos/{id}/books/{position}/decision`
  (research §3, §10, §15). `recognition` ne change pas.
- **Persistance** : trois tables propres à `bibliography`, migrations et table de suivi séparées ;
  `migrateDatabase` passe dans une lib partagée et l'API n'ouvre plus qu'un pool Postgres pour tous
  les contextes (research §8).
- **Écrans** : une slice `reconciliation`, composée par le shell avec `photo-upload` et avec le
  détail d'`upload-history` (research §11).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 26.5.1 (`mise.toml`) ; React 19 côté `apps/web`.

**Primary Dependencies**: `drizzle-orm`/`pg` (déjà là, ADR 0006) pour la persistance ;
`libs/shared/text-match` et `libs/shared/result` (déjà là) ; `zod` (déjà dans
`recognition-infrastructure`, ajouté à `bibliography-infrastructure` et à `apps/api` pour valider la
réponse SRU et le corps de la décision) ; NestJS pour les trois routes ; `fetch` natif côté API
(BnF) et côté web. Aucun outil nouveau.

**Storage**: Postgres (Neon en production, compose en local) — trois tables nouvelles
(`data-model.md` §Stockage). Rien dans le bucket.

**Testing**: Vitest partout (ADR 0007). Domaine et application sans infra (catalogue factice, dépôt
en mémoire, faux timers pour les délais) ; dépôt Drizzle contre le Postgres du compose ; adapters BnF
sur réponses SRU enregistrées (cas de l'ADR 0014) ; HTTP par spec de bout en bout comme
`shelf-photos.http.spec.ts` ; web avec `fetch` injecté ; `envs/prod` par `terraform test`.
SC-001/SC-002 par le bench, manuel (research §13).

**Target Platform**: API sur Cloud Run (ADR 0004) ; navigateur mobile pour les écrans.

**Project Type**: Application web — nouvelles libs back (`bibliography`, `shared/sql-migrations`),
extension d'`apps/api`, d'`apps/web` et d'`infra/envs/prod`.

**Performance Goals**: tous les statuts d'une étagère de 30 livres en ≤ 20 s après l'affichage de la
liste (SC-003) : 4 requêtes en parallèle, 8 s par requête, échéance globale de 18 s ; l'étude simule
8,0 s médiane, 10,4 s au 90ᵉ centile (research §7).

**Constraints**: une panne de la BnF ne fait jamais échouer l'appel et ne donne jamais « non
trouvé » (FR-008) ; jamais de confirmation sans notice correspondante, ni sur un segment non
expliqué (FR-004) ; jamais d'ambiguïté levée d'office (FR-010) ; une tentative n'est jamais
réécrite (FR-016) ; la confiance du VLM n'entre jamais dans le verdict ni dans le score (FR-021) ;
aucun score ni cause exposé par l'API (FR-018) ; aucun texte utilisateur renvoyé par l'API
(ADR 0011) ; un `GET` ne rappelle jamais la BnF (SC-005) ; 4 requêtes en parallèle et un
`User-Agent` identifiant vers la BnF (ADR 0014).

**Scale/Scope**: 20–200 photos/mois, ~10–40 livres par photo, 1,3 à 2,4 requêtes par livre :
quelques milliers de requêtes BnF par mois au plus, et autant de lignes de tentatives — aucune
préoccupation de volume.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Application à cette feature |
|---|---|
| I. TDD non-négociable | Chaque unité s'écrit rouge/vert/refactor, dans l'ordre de `tasks.md` : décomposition de la lecture et formes de la notice sur tables de cas avant `matchBook` ; agrégat et transitions ; cascade et limites avec doubles ; dépôt Drizzle contre Postgres ; adapters BnF sur réponses enregistrées ; orchestrateur ; routes ; slices web ; câblage Terraform. Les réglages de l'étude sont couverts par les cas de l'ADR 0014, de sorte que le bench pourra les changer sous filet. |
| II. Hexagonal et bounded contexts étanches | `bibliography` n'importe pas `recognition` ni l'inverse — le croisement se fait dans l'orchestrateur d'`apps/api`, sur des DTO (`data-model.md` §DTO de frontière). Le livre détecté est désigné par une référence opaque (analyse, position), sans clé étrangère entre les schémas (research §4). L'orchestrateur séquence et traduit : la règle « pas de livres sans analyse aboutie » vit dans `recognition`, la cascade dans `bibliography-application`, le verdict dans `bibliography-domain`. Chaque nouvelle lib porte ses trois tags ; `eslint.config.mjs` gagne la contrainte `context:bibliography`. Schéma, SQL et migrations restent dans `bibliography-infrastructure`. |
| III. Typage prouvé, jamais affirmé | Value objects validés pour toute donnée du domaine (`data-model.md`) ; statuts, étapes et issues en unions discriminées ; `Result` aux frontières de `domain` et `application`, erreurs à `kind` traduites par `switch` exhaustif (ADR 0013) ; réponse SRU et corps de la décision validés par `zod`, tout ou rien ; pas de `as`. |
| IV. Outillage unique | Aucun outil ajouté ; `zod` est déjà une dépendance du dépôt. Le petit limiteur de parallélisme est écrit localement plutôt que d'importer une lib (`type:application` n'autorise que `tslib`). `libs/shared/sql-migrations` est une lib Nx ordinaire, Vitest + `tsc`. |
| V. Français dans la doc, anglais dans le code | Textes des écrans dans `features/reconciliation/i18n/{fr,en}.json`, clés ajoutées dans les deux langues au même commit ; `model/` et `api/` rendent des types d'échec, traduits par une table explicite dans l'UI. Code, commentaires, commits en anglais. |

**Articulation avec les ADR** : l'ADR 0014 a tranché le référentiel et les principes d'appariement ;
le plan en reporte les réglages mesurés (research §5) et respecte ses deux régimes d'appel — la BnF
critique, aucun complément ici. L'enrichissement et Google Books sont renvoyés à la spec 004
(research §14). ADR 0013 fixe la forme des échecs ; ADR 0010 l'existence de `bibliography`, qui
arrive avec sa première implémentation ; la réconciliation reste synchrone dans la requête, dans le
cadre d'ADR 0003. L'ADR 0014 est encore au statut « proposé » : il passe « accepté » avant ou avec
la première PR de code de cette feature.

Aucune violation : pas d'entrée dans Complexity Tracking.

**Post-Phase 1 re-check** : le modèle de données, le contrat HTTP et les deux refactors
d'exploitation (`migrateDatabase` partagé, pool unique) ne font franchir aucune frontière nouvelle.
`sql-migrations` est `type:shared` / `context:none` / `scope:api` : importable par les deux
`infrastructure` et par `apps/api`, il n'importe aucun contexte. Le shell du front compose deux
slices avec une troisième, sans import entre slices. Gate toujours au vert.

## Project Structure

### Documentation (this feature)

```text
specs/003-bibliographic-reconciliation/
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
├── shelf-book-ref.ts, read-book.ts, catalog-query.ts, catalog-name.ts,
│   catalog-record.ts, catalog-record-id.ts, authority-id.ts,
│   match-score.ts, reconciliation-score.ts, cascade-step.ts     # value objects (data-model.md)
├── title-forms.ts, author-forms.ts               # formes comparables (research §5.1–5.4)
├── match-book.ts                                 # matchBook, regroupement, segment expliqué, notice représentative + MatchingSettings
├── reconciliation-score.ts                       # research §5.8
├── book-reconciliation.ts                        # agrégat : statut déduit, needsAttempt, decide
├── bibliographic-catalog.port.ts, authority.port.ts, book-reconciliation-repository.port.ts
└── *.error.ts                                    # CatalogUnavailable, BookAlreadyReconciled, BookNotAmbiguous, UnknownCandidate, BookReconciliationNotFound

libs/bibliography/application/src/lib/            # nouveau — type:application
├── reconciliation.dto.ts
├── reconcile-detected-books.use-case.ts          # cascade, autorités, limites, not_verified
├── get-shelf-reconciliation.use-case.ts          # état conservé, sans appel
├── decide-ambiguity.use-case.ts
├── run-with-limits.ts                            # parallélisme borné, délais, nouvelle tentative, sans dépendance
└── testing/                                      # catalogue et autorités factices, dépôt en mémoire

libs/bibliography/infrastructure/                 # nouveau — type:infrastructure
├── drizzle.config.ts                             # migrations propres au contexte
└── src/lib/
    ├── drizzle/schema.ts, drizzle/migrations/
    ├── drizzle-book-reconciliation-repository.adapter.ts      # contre Postgres
    ├── bnf/bnf-sru-catalog.adapter.ts, bnf/bnf-authority.adapter.ts, bnf/sru-response.ts (zod)
    ├── bnf/fixtures/                             # réponses SRU enregistrées, avec provenance
    ├── stub-bibliographic-catalog.adapter.ts, stub-authority.adapter.ts
    └── offline-bibliographic-catalog.adapter.ts

libs/shared/sql-migrations/                       # nouveau — type:shared, context:none, scope:api
└── src/lib/migrate-database.ts                   # déplacé depuis recognition-infrastructure/src/lib/persistence/, table de suivi en paramètre

libs/recognition/
└── infrastructure/src/lib/scanner/stub-shelf-scanner.adapter.ts   # + une détection sans auteur (research §12)

apps/api/src/
├── database/database.module.ts                   # pool unique, migrations de chaque contexte au démarrage
├── recognition/                                  # shelf-scan-archive.factory reçoit le pool ; le module exporte GetShelfScanUseCase
├── bibliography/
│   ├── bibliography.module.ts                    # composition root du contexte : ports → adapters
│   ├── bibliographic-catalog.factory.ts
│   └── bibliography-http-error.ts                # switch exhaustif, codes stables
├── orchestration/
│   ├── reconcile-shelf-photo.use-case.ts, get-shelf-photo-reconciliation.use-case.ts,
│   │   decide-shelf-book-ambiguity.use-case.ts   # recognition → bibliography, DTO seulement
│   ├── shelf-scan-not-completed.error.ts, orchestration-http-error.ts
│   ├── shelf-photo-reconciliation.controller.ts  # les trois routes
│   └── reconciliation.http.spec.ts               # de bout en bout sur l'app Nest
├── config/environment.ts                         # + BIBLIOGRAPHIC_CATALOG_PROVIDER
└── app/app.module.ts                             # + DatabaseModule, BibliographyModule, orchestration

apps/api/vite.config.mts                          # copie les migrations des deux contextes
apps/web/src/
├── app/app.tsx                                   # compose reconciliation dans photo-upload et upload-history
└── features/
    ├── photo-upload/                             # UploadState.success + scanId ; prop de rendu du résultat
    ├── upload-history/                           # LoadedEntry : prop de rendu des livres
    └── reconciliation/                           # nouvelle slice
        ├── api/reconciliation-api.ts             # POST et GET …/reconciliation, POST …/decision
        ├── model/reconciled-book.ts, model/reconciliation-state.ts, model/reconciliation-failure.ts
        ├── ui/reconciled-book-list.tsx, ui/ambiguity-picker.tsx, ui/use-reconciliation.ts
        └── i18n/fr.json, i18n/en.json

infra/envs/prod/main.tf (+ tests/)                # BIBLIOGRAPHIC_CATALOG_PROVIDER=bnf dans api_env
eslint.config.mjs                                 # + contrainte context:bibliography
package.json                                      # db:generate couvre les deux contextes
.env.example                                      # + BIBLIOGRAPHIC_CATALOG_PROVIDER
tools/bench/                                      # mode réconciliation (SC-001, SC-002)
docs/parking.md                                   # entrées reprises ou soldées (historique, relance)
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
