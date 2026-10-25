---

description: "Task list for bibliographic reconciliation"
---

# Tasks: Réconciliation bibliographique des livres détectés

**Input**: Design documents from `/specs/003-bibliographic-reconciliation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reconciliation-api.md, quickstart.md

**Tests**: Inclus et obligatoires — la constitution impose le TDD (principe I). **Une tâche = un
cycle rouge/vert/refactor** (`docs/spec-driven-development.md` §5) : chaque tâche nomme d'abord la
spec à écrire, qui doit échouer, puis le code minimal qui la fait passer. Une spec qui passe avant
d'avoir écrit le code ne prouve rien : la faire échouer d'abord.

**Organization**: Setup et Foundational (socle commun : trois libs `bibliography`, migrations par
contexte, pool unique, modèle et dépôt), puis une phase par user story dans l'ordre des priorités —
US1 (P1), US2, US3, US5 (P2), US4 (P3). L'adapter BnF fait partie d'US1 : l'ADR 0014 a choisi le
référentiel.

**Régénéré le 17/10/2026** (réalignement sur l'ADR 0014 et la spec 002, voir `plan.md`) : la
numérotation repart de T001. Ce qui change par rapport à la version du 28/09 :
- plus de `GetDetectedBooksUseCase` ni d'erreur nouvelle dans `recognition` : l'orchestrateur lit
  `GetShelfScanUseCase` (spec 002), qui vérifie le propriétaire ;
- `Result` aux frontières et traduction HTTP par `switch` exhaustif, plus de filtre par contexte
  (ADR 0013) ;
- règle d'appariement de l'ADR 0014 (lecture décomposée, segment expliqué, regroupement par notre
  règle, notice représentative, score) et cascade dans `application`, avec `AuthorityPort` ;
- adapters BnF dans US1, sur réponses enregistrées ; plus de phase bloquée ;
- `GET …/reconciliation` et intégration au détail d'un envoi (US1, US2, US4) ;
- câblage de `BIBLIOGRAPHIC_CATALOG_PROVIDER=bnf` en production (Terraform).

Les corrections de l'analyse du 28/09 restent acquises : course entre deux réconciliations traitée
dès US1 ; analyse sans livre qui garde son message ; US5 après US2 ; dépendances de workspace
déclarées ; lanceur de migrations partagé justifié ; SC-003 prouvé par une spec de 30 livres.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, aucune dépendance sur une tâche non terminée)
- **[Story]** : US1 (statuts), US2 (lever une ambiguïté), US3 (conservation), US4 (relance),
  US5 (faits pour l'analyse des erreurs)

## Rappels valables pour toutes les tâches

- Pas de `as` (hors `as const`), assertions strictes (`toStrictEqual`, `toBe(true)`), specs en
  `*.spec.ts` qui importent `describe`/`expect`/`it` de `vitest`.
- `domain` et `application` ne jettent jamais et n'appellent jamais `unwrap` : échec attendu → `Err`
  (`error-policy.md`, garde-fou ESLint).
- Code, commentaires, messages d'erreur et descriptions de tests en anglais ; textes d'écran dans
  `features/reconciliation/i18n/{fr,en}.json`, **les deux langues dans le même commit**.
- Aucun import de `recognition` depuis `bibliography` ni l'inverse : le croisement se fait dans
  `apps/api/src/orchestration/`, sur des DTO.
- Les specs d'adapters Postgres tournent contre le `db` du compose (`docker compose up -d db bucket`).
- Recherches et vérifications déléguées aux sous-agents (`delegation.md`) : `check-runner`,
  `translations-auditor`, `infra-checker`, `docs-index-auditor`.

---

## Phase 1: Setup

- [X] T001 Créer la lib `libs/bibliography/domain/` sur le modèle de `libs/recognition/domain/`
      (`package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`,
      `vitest.config.mts`, `eslint.config.mjs`, `src/index.ts` vide, `README.md` d'une ligne) :
      nom `@pick-a-book/bibliography-domain`, `nx.name` `bibliography-domain`, tags
      `type:domain`, `context:bibliography`, `scope:api` ; dépendances `tslib`,
      `@pick-a-book/shared-text-match` et `@pick-a-book/shared-result` (`workspace:*`)
- [X] T002 [P] Créer `libs/bibliography/application/` sur le modèle de `libs/recognition/application/` :
      `@pick-a-book/bibliography-application`, tags `type:application`, `context:bibliography`,
      `scope:api`, dépendances `@pick-a-book/bibliography-domain` et `@pick-a-book/shared-result` ;
      `tsconfig.lib.json` exclut `src/**/testing/**` comme la lib modèle
- [X] T003 [P] Créer `libs/bibliography/infrastructure/` sur le modèle de
      `libs/recognition/infrastructure/` : `@pick-a-book/bibliography-infrastructure`, tags
      `type:infrastructure`, `context:bibliography`, `scope:api`, dépendances
      `@pick-a-book/bibliography-domain`, `drizzle-orm`, `pg`, `zod` (mêmes versions que
      `recognition-infrastructure`) ; `drizzle.config.ts` avec
      `schema: './libs/bibliography/infrastructure/src/lib/drizzle/schema.ts'`,
      `out: './libs/bibliography/infrastructure/src/lib/drizzle/migrations'` et
      `migrations: { table: '__drizzle_migrations_bibliography' }` (research §8)
- [X] T004 [P] Créer `libs/shared/sql-migrations/` : `@pick-a-book/shared-sql-migrations`, tags
      `type:shared`, `context:none`, `scope:api`, dépendances `drizzle-orm`, `pg`, `tslib`
- [X] T005 Ajouter à `eslint.config.mjs` la contrainte
      `{ sourceTag: 'context:bibliography', onlyDependOnLibsWithTags: ['context:bibliography', 'context:none'] }`
      (commentaire : ADR 0010), et étendre aux libs `bibliography` la règle qui bannit `throw` et
      `unwrap` dans `domain`/`application` ; puis `yarn install && yarn nx sync` pour lier les
      quatre projets ; vérifier que les garde-fous opèrent : un import temporaire de
      `@pick-a-book/recognition-domain`, puis un `throw`, dans `libs/bibliography/domain/src/index.ts`
      font échouer `yarn lint` — puis les retirer
- [X] T006 [P] Dans `package.json` racine, faire générer par `db:generate` les migrations des deux
      contextes (`drizzle-kit generate --config libs/recognition/infrastructure/drizzle.config.ts
      && drizzle-kit generate --config libs/bibliography/infrastructure/drizzle.config.ts`) ;
      mettre à jour la ligne `yarn db:generate` de `CLAUDE.md` (« des deux contextes »)
- [X] T007 [P] Documenter dans `.env.example` `BIBLIOGRAPHIC_CATALOG_PROVIDER=stub` : optionnel,
      défaut `stub`, valeurs `bnf` (catalogue général de la BnF, sans clé), `stub` (catalogue en
      mémoire) et `offline` (catalogue toujours indisponible, pour voir « non vérifié » et la
      relance) — research §12

---

## Phase 2: Foundational (bloquant — commun à toutes les user stories)

**But** : migrations par contexte et pool unique (research §8), modèle du domaine, schéma et dépôt,
DTO et configuration. Rien de visible pour l'utilisateur à la fin de cette phase.

### Migrations et pool

- [X] T008 Déplacer `migrateDatabase` de
      `libs/recognition/infrastructure/src/lib/persistence/migrate-database.ts` (et sa spec) vers
      `libs/shared/sql-migrations/src/lib/migrate-database.ts`, avec la signature
      `migrateDatabase(pool, { migrationsFolder, migrationsTable })`. **Rouge** : la spec déplacée
      gagne un cas « deux dossiers, deux tables de suivi, appliqués l'un après l'autre sans se
      gêner » (contre Postgres) et garde le cas du verrou consultatif partagé. **Vert** :
      implémenter, exporter depuis `src/index.ts`, retirer l'export de `recognition-infrastructure`
      et faire pointer ses specs vers la lib partagée, `migrationsTable` = `__drizzle_migrations`
      (la table actuelle, pour ne pas rejouer les migrations déjà appliquées de `recognition`) ;
      ajouter `@pick-a-book/shared-sql-migrations` (`workspace:*`) aux dépendances de
      `libs/recognition/infrastructure/package.json` (sinon `@nx/dependency-checks` échoue)
- [X] T009 Créer `apps/api/src/database/database.module.ts` (+ `.spec.ts`) : fournit un `Pool`
      unique (`DATABASE_POOL`) depuis `environment.databaseUrl`, applique au démarrage les
      migrations de `recognition` (`dist/migrations/recognition`, table `__drizzle_migrations`)
      puis de `bibliography` (`dist/migrations/bibliography`, table
      `__drizzle_migrations_bibliography`), ferme le pool à l'arrêt (`onApplicationShutdown`).
      **Rouge** : la spec vérifie l'ordre des migrations et la fermeture avec un pool factice.
      Adapter `apps/api/src/recognition/shelf-scan-archive.factory.ts` (+ spec) pour **recevoir**
      le pool au lieu de l'ouvrir (aujourd'hui `new Pool(...)`), et `recognition.module.ts` pour ne
      plus migrer ni fermer ; ajouter `@pick-a-book/shared-sql-migrations` à `apps/api/package.json`
- [X] T010 Dans `apps/api/vite.config.mts`, copier les deux dossiers de migrations vers
      `dist/migrations/recognition` et `dist/migrations/bibliography` ; vérifier par
      `yarn nx build api && ls apps/api/dist/migrations/*` ; relire `docker/` pour s'assurer que
      l'image embarque `dist/migrations/` en entier

### Domaine `bibliography` (`libs/bibliography/domain/src/lib/`)

- [X] T011 [P] `shelf-book-ref.ts`, `catalog-name.ts`, `catalog-record-id.ts`, `authority-id.ts`,
      `match-score.ts`, `reconciliation-score.ts`, `cascade-step.ts`, `not-verified-cause.ts`
      (+ specs) : fabriques `of()` → `Result<VO, InvalidValue>`, validations de `data-model.md`
      §Value objects ; type guards pour relire `CascadeStep` et `NotVerifiedCause` depuis le stockage
- [X] T012 [P] `read-book.ts` (+ spec) : `ReadBook.of(title, author?)` et sa décomposition
      (research §5.1). **Rouge**, table de cas : parenthèses retirées (« La Peste (Folio) ») ;
      segments sur ` - `, ` : `, ` / ` (« Percy Jackson - La Mer des Monstres ») ; mention de tome
      extraite et gardée (« Éternels (tome 3) » → volume 3 ; « T2 », « 2e ») ; noms sur `-`, `/`,
      ` et `, `&`, `,` (« D. Pennac - J. Ferrandez » → deux noms) ; titre vide ou > 500 caractères
      refusé ; auteur vide ou blanc refusé, jamais converti en absent
- [X] T013 [P] `catalog-query.ts`, `catalog-record.ts` (+ specs) : `CatalogQuery` — au moins un de
      titre et auteur, `maxRecords` dans [1, 100], `format` ; `CatalogRecord` — `id`, `title`,
      `titleComplement?`, `authors` (`name`, `role`, `authorityId?`), `context`, `raw`, `format`
- [X] T014 `*.error.ts` : `CatalogUnavailable` (avec `cause` : `unavailable` | `invalid_response`),
      `BookAlreadyReconciled`, `BookNotAmbiguous`, `UnknownCandidate`,
      `BookReconciliationNotFound` — une classe par fichier, `readonly kind` littéral
      (`data-model.md` §Erreurs) ; `match-outcome.ts` : types `ScoredRecord` et `MatchOutcome`
      (`confirmed` | `ambiguous` avec `partial` | `not_found`, chacun avec `examined` et
      `needsAuthorityCheck`)
- [X] T015 `book-reconciliation.ts` (+ `.spec.ts`) : `ReconciliationAttempt`, `AmbiguityDecision`,
      agrégat `BookReconciliation`. **Rouge** : table de cas du statut déduit (`data-model.md`
      §Statut courant, lignes sans décision), `needsAttempt()` vrai seulement pour `pending` et
      `not_verified`, `recordAttempt()` qui rend `Err(BookAlreadyReconciled)` sur un statut
      définitif. La décision (`decide`) arrive en US2 (T048)
- [X] T016 `bibliographic-catalog.port.ts`, `authority.port.ts`,
      `book-reconciliation-repository.port.ts` : signatures de `data-model.md` §Ports, en `Result` ;
      jetons chaîne `BIBLIOGRAPHIC_CATALOG_PORT`, `AUTHORITY_PORT`,
      `BOOK_RECONCILIATION_REPOSITORY_PORT` (`domain-modeling.md`) ; tout exporter depuis
      `src/index.ts`

### Persistance (`libs/bibliography/infrastructure/src/lib/`)

- [X] T017 `drizzle/schema.ts` : les trois tables de `data-model.md` §Stockage, contraintes
      recopiées telles quelles — `reconciliation_attempts` (verdict, `cascade_step` non nul pour un
      confirmé ou un ambigu, `reconciliation_score` nul si et seulement si `not_verified`,
      `not_verified_cause` « non nul si et seulement si `verdict = 'not_verified'` », `position >= 0`,
      index `(scan_ref, position)`, **index unique partiel**
      `(scan_ref, position) where verdict <> 'not_verified'`), `reconciliation_candidates`
      (PK `(attempt_id, rank)`, `rank >= 1`, scores dans [0, 1], `authors` et `context` en `jsonb`,
      `raw`, `format`, `retained`), `reconciliation_decisions` (PK `attempt_id`,
      `kind in ('chosen','rejected')`, `record_id` « non nul si et seulement si `kind = 'chosen'` »).
      Aucune clé étrangère vers les tables de `recognition` (research §4). Puis `yarn db:generate`
      → `drizzle/migrations/0000_*.sql`, commité, jamais écrit à la main ; `drizzle/test-database.ts`
      sur le modèle de celui de `recognition`
- [X] T018 `drizzle-book-reconciliation-repository.adapter.ts` (+ `.spec.ts` contre Postgres) :
      `saveAttempt` écrit la tentative et ses notices (retenues et écartées, `raw` compris) **dans
      une transaction** et rend `Err(BookAlreadyReconciled)` sur violation de l'index unique
      partiel ; `findByScan` et `find` reconstruisent les agrégats, tentatives ordonnées par
      `attempted_at`, `authors` et `context` relus par un schéma `zod`. **Rouge** : aller-retour de
      chaque verdict, deux tentatives définitives sur un même livre refusées, une tentative
      `not_verified` suivie d'une définitive acceptée. `saveDecision` en US2 (T049)

### Application et composition

- [X] T019 [P] `libs/bibliography/application/src/lib/testing/` : dépôt en mémoire qui respecte la
      même règle d'unicité que l'index partiel ; catalogue factice scriptable (notices par requête —
      titre, auteur, format —, `Err` avec une cause, délai, compteur d'appels par requête) ;
      autorités factices (formes rejetées, `Err`, compteur)
- [X] T020 [P] `libs/bibliography/application/src/lib/reconciliation.dto.ts` (+ `to-dto.spec.ts`) :
      `DetectedBookInput`, `ShelfReconciliationDto`, `BookReconciliationDto`, `ReferenceDto` tels que
      `data-model.md` §DTO de frontière, et `toBookReconciliationDto(aggregate)`. **Rouge** : une
      ligne par statut (dont `pending`), `confirmedBy`, `titleOnly`, `author` absent — jamais `""` —,
      auteurs principaux avant les secondaires, et **aucun** score, catalogue, étape ni cause dans
      le DTO (FR-018)
- [X] T021 [P] `apps/api/src/config/environment.ts` (+ spec) : `bibliographicCatalog: { provider:
      'bnf' | 'stub' | 'offline' }`, lu de `BIBLIOGRAPHIC_CATALOG_PROVIDER`, défaut `stub` ; toute
      autre valeur ajoute un problème listé au démarrage, comme `SHELF_SCANNER_PROVIDER`

**Checkpoint** : `yarn check` vert ; l'API démarre et crée les tables de `bibliography`
(quickstart §Prérequis) ; aucun comportement visible nouveau.

---

## Phase 3: User Story 1 — Savoir quels livres détectés existent vraiment (P1) 🎯 MVP

**Goal** : après l'analyse, et dans le détail d'un envoi, chaque livre porte un statut — confirmé
(forme de référence, BnF citée), ambigu, inconnu du catalogue, non vérifié — sans action de
l'utilisateur.

**Independent Test** : quickstart scénarios 1 (stub), 3 (offline) et 5 (BnF) : statuts affichés,
un titre inventé jamais confirmé, un catalogue en panne n'empêche pas l'affichage des livres.

### Règle d'appariement (`libs/bibliography/domain/src/lib/`)

- [X] T022 [P] [US1] `title-forms.ts` (+ spec) : formes comparables d'un titre (research §5.1–5.2) —
      `normalizeText` de `@pick-a-book/shared-text-match`, article initial retiré ; côté notice,
      titre propre, titre avec complément, formes coupées avant ` : ` ou ` / ` ;
      `titleScore(segment, record)` = maximum de `similarity` sur ces formes. **Rouge** :
      « La Peste » vs « La peste / Albert Camus » = 1 ; « La Pest » ≥ 0,85 ; « Cuisine évasion » vs
      « La Cuisine évasion » = 1 ; deux titres différents < 0,85
- [X] T023 [P] [US1] `author-forms.ts` (+ spec) : `authorScore(name, record, rejectedForms?)`
      (research §5.2–5.4) — tous les auteurs, principaux et secondaires, dans les deux ordres du nom ;
      dates entre parenthèses retirées ; nom de famille seul et forme abrégée compatible
      (« A. Camus ») correspondent ; formes rejetées de l'autorité comparées au même seuil.
      **Rouge** : chacun de ces cas ; « J. Ferrandez » contre un illustrateur ; « Alaa El Aswany »
      contre « Aswānī, ʿAlāʾ al- » sans puis avec la forme rejetée « Aswany, Alaa el- » ; un auteur
      franchement différent < 0,85
- [X] T024 [US1] `match-book.ts` (+ spec) : `MatchingSettings` validé à la construction, valeurs de
      l'étude (data-model.md) ; `matchBook(read, records, settings, rejectedForms?)` (research
      §5.3–5.7). **Rouge**, une table de cas : lecture exacte → confirmé ; une lettre en moins →
      confirmé (FR-003) ; auteur lu contradictoire → notice écartée et listée dans
      `needsAuthorityCheck` ; aucun titre proche → non trouvé (FR-004) ; titre seul porté par une
      œuvre → confirmé, par deux œuvres d'auteurs différents → ambigu (FR-005) ; plusieurs éditions
      d'une même œuvre (« Exercices de style » et « Exercices de style : nouvelle édition ») →
      confirmé, pas ambigu (FR-007) ; « 17 lunes » et « 18 lunes » jamais regroupés ; segment
      expliqué par le contexte → confirmé, segment non expliqué → ambigu `partial` (FR-004) ; tome
      qui nomme la série lue → retenu, la série seule n'est pas candidate (FR-019) ; « tome 3 » lu →
      la notice du tome 1 écartée ; roman et adaptation BD de même titre avec l'auteur lu → le roman
      est la notice représentative (FR-020) ; une œuvre hors marge n'est pas candidate ; au plus 5
      candidats, rangs 1..n sans trou ; score combiné = titre seul sans auteur lu,
      0,7 × titre + 0,3 × auteur sinon
- [X] T025 [US1] `reconciliation-score.ts` (+ spec) : `reconciliationScore(outcome, step, authorRead)`
      (research §5.8). **Rouge** : dans [0, 1] ; une confirmation sans auteur lu note moins que la
      même avec l'auteur ; l'étape « titre et auteur » note plus que « segment » ; aucun paramètre
      ne reçoit la confiance de lecture (FR-021)

### Réconciliation (`libs/bibliography/application/src/lib/`)

- [X] T026 [US1] `run-with-limits.ts` (+ spec, faux timers de Vitest) : exécute des requêtes avec
      **4** en parallèle au plus, un `AbortSignal` par requête déclenché à **8 s**, **une nouvelle
      tentative** sur `Err` `unavailable` s'il reste du budget, et une **échéance globale de 18 s**
      au-delà de laquelle rien n'est plus lancé ; rend, par requête, `ok`, `failed` (avec la cause)
      ou `timed_out`. Sans dépendance (research §7)
- [X] T027 [US1] `reconcile-detected-books.use-case.ts` (+ spec avec T019) :
      `ReconcileDetectedBooksUseCase(catalog, authorities, repository, settings, limits)`.
      **Rouge** : cascade — titre et auteur (20, `full`), auteur seul (100, `light`), titre seul
      (20, `full`), segments — les deux premières étapes seulement si un auteur est lu, arrêt à la
      première étape qui rend `confirmed` ou `ambiguous`, étape enregistrée ; formes rejetées
      demandées seulement quand `needsAuthorityCheck` n'est pas vide, et une seule fois par autorité
      (compteur) ; échec des autorités → la notice reste écartée, pas de « non vérifié » ;
      `catalog.name` et score enregistrés ; `Err(CatalogUnavailable)` après la nouvelle tentative →
      `not_verified` avec sa cause, **jamais** `not_found` ; requête au-delà de 8 s → `not_verified`
      / `timeout` ; livres au-delà de l'échéance → `not_verified` / `timeout` sans appel ; réponse =
      **tous** les livres, triés par position ; liste vide → `{ books: [] }` ; jamais d'`Err` à cause
      du catalogue (FR-008) ; **deux exécutions concurrentes** sur la même analyse — le
      `BookAlreadyReconciled` de `saveAttempt` pour la seconde n'est pas une erreur : le use case
      relit l'état et le rend ; **SC-003** — 30 livres, catalogue factice à 1,5 s par requête et
      1,3 requête par livre, faux timers : tous les livres ont un statut définitif en ≤ 18 s
      simulées, aucun en `timeout`. Exporter depuis `src/index.ts`
- [X] T028 [US1] `get-shelf-reconciliation.use-case.ts` (+ spec) : rend l'état conservé de chaque
      livre fourni, `pending` pour un livre jamais tenté ; **aucun** appel au catalogue ni aux
      autorités (compteurs à zéro, SC-005)

### Adapters (`libs/bibliography/infrastructure/src/lib/`)

- [X] T029 [P] [US1] `stub-bibliographic-catalog.adapter.ts`, `stub-authority.adapter.ts` (+ specs) :
      `name` = `stub`, catalogue en mémoire qui, avec `matchBook`, confirme les livres du scanner
      stub — « L'Amant » (Duras, **deux éditions**), « Les Choses » (Perec), « La Place » (Ernaux,
      **plus** une autre œuvre « La Place » d'un autre auteur, écartée par l'auteur lu) — et ne
      connaît rien d'approchant « Titre peu lisible » ; filtre par titre et auteur normalisés,
      respecte `maxRecords` ; une autorité stub rend une forme rejetée
- [X] T030 [P] [US1] `offline-bibliographic-catalog.adapter.ts` (+ spec) : `name` = `offline`, rend
      toujours `Err(CatalogUnavailable('unavailable'))`, pour la recherche comme pour les autorités
- [X] T031 [US1] Enregistrer les réponses SRU de la BnF dans `bnf/fixtures/` pour les cas de
      l'ADR 0014 (« Percy Jackson - La Mer des Monstres », « 17 lunes », « 18 lunes », « Éternels
      (tome 3) », « Alaa El Aswany » et sa notice d'autorité, « Le Mystère des pavots blancs »,
      « D. Pennac - J. Ferrandez », « Exercices de style », un titre fauté, un témoin permuté, un
      témoin fabriqué), en UNIMARC et, pour une requête « auteur seul », en Dublin Core ; chaque
      fixture avec sa provenance (URL de la requête, date) — `adapters.md`
- [X] T032 [US1] `bnf/sru-response.ts` et `bnf/bnf-sru-catalog.adapter.ts` (+ spec sur T031) :
      `fetch` injecté ; requête CQL sur `catalogue.bnf.fr/api/SRU`, filtrée `bib.doctype any "a"`,
      par titre et/ou auteur, `maximumRecords` et `recordSchema` (`unimarcXchange` ou `dublincore`)
      selon `CatalogQuery` ; `User-Agent` qui identifie le projet ; `signal` transmis à `fetch` ;
      réponse validée par `zod`, tout ou rien — hors contrat → `Err('invalid_response')` ; erreur
      réseau ou 5xx → `Err('unavailable')` ; UNIMARC lu en `CatalogRecord` (200 titre, 700–702
      auteurs avec rôle et identifiant d'autorité, 225/410 collection et numéro, 461 série, 210/214
      éditeur), `raw` et `format` gardés. **Rouge** : chaque fixture lue en notices attendues
- [X] T033 [US1] `bnf/bnf-authority.adapter.ts` (+ spec sur T031) : formes rejetées (4xx UNIMARC
      d'autorité) d'une `AuthorityId`, `zod`, mêmes erreurs que T032 ; cache en mémoire par
      instance — **rouge** : un second appel pour la même autorité ne rappelle pas `fetch`
- [X] T034 [US1] `bnf/bnf-matching.spec.ts` : de bout en bout sur les fixtures de T031, adapter puis
      `matchBook` avec les réglages par défaut — chaque cas de l'ADR 0014 rend le verdict attendu,
      et aucun témoin n'est confirmé. Protège les réglages de research §5

### Composition root et orchestration (`apps/api/src/`)

- [X] T035 [US1] `bibliography/bibliographic-catalog.factory.ts` (+ spec) : `bnf` → adapters BnF
      (`fetch` global), `stub` → stubs, `offline` → offline
- [X] T036 [US1] `bibliography/bibliography.module.ts` (+ spec) : lie
      `BOOK_RECONCILIATION_REPOSITORY_PORT` à l'adapter Drizzle sur le pool de `DatabaseModule`,
      `BIBLIOGRAPHIC_CATALOG_PORT` et `AUTHORITY_PORT` à la fabrique, construit
      `ReconcileDetectedBooksUseCase` et `GetShelfReconciliationUseCase` avec les réglages et
      limites par défaut, et les **exporte** ; `bibliography-http-error.ts` (+ spec) :
      `toHttpException`, `switch` exhaustif sur `kind` terminé par `const unhandled: never`, codes
      stables de `contracts/reconciliation-api.md` §Correspondance ; ajouter
      `@pick-a-book/bibliography-domain`, `-application`, `-infrastructure` (`workspace:*`) et `zod`
      à `apps/api/package.json`
- [X] T037 [US1] `recognition/recognition.module.ts` : **exporter** `GetShelfScanUseCase` s'il ne
      l'est pas (spec du module)
- [X] T038 [US1] `orchestration/shelf-scan-not-completed.error.ts`,
      `orchestration/reconcile-shelf-photo.use-case.ts` et
      `orchestration/get-shelf-photo-reconciliation.use-case.ts` (+ specs avec doubles des use
      cases) : lisent le détail par `GetShelfScanUseCase` ; `Err(ShelfScanNotFound)` passé tel quel
      (inconnu ou autre propriétaire) ; `outcome` autre que `completed` →
      `Err(ShelfScanNotCompleted)` ; livres traduits en `DetectedBookInput` (`position` = index,
      `title`, `author` seulement s'il est présent, **jamais** la confiance) ; DTO de `bibliography`
      rendu tel quel. **N'importent aucun `*-domain`** : DTO seulement (ADR 0003)
- [X] T039 [US1] `orchestration/orchestration-http-error.ts` (+ spec) : `switch` exhaustif —
      `shelf-scan-not-found` → 404, `shelf-scan-not-completed` → 409 `SCAN_NOT_COMPLETED` ;
      `orchestration/shelf-photo-reconciliation.controller.ts` (+ spec) :
      `POST /shelf-photos/:id/reconciliation` (`@HttpCode(200)`) et
      `GET /shelf-photos/:id/reconciliation` ; `orchestration.module.ts` importe
      `RecognitionModule` et `BibliographyModule` ; `app/app.module.ts` importe `DatabaseModule`,
      `BibliographyModule`, `OrchestrationModule` ; journaliser par le `Logger` de Nest, jamais
      `console.*`
- [X] T040 [US1] `orchestration/reconciliation.http.spec.ts` (de bout en bout sur l'app Nest, scanner
      et catalogue stub, Postgres du compose, comme `shelf-photos.http.spec.ts`) : envoi → analyse
      → `POST …/reconciliation` rend un élément par livre, trié, aux statuts attendus, `read` intact ;
      `GET` rend le même état sans appel au catalogue ; `GET` avant tout `POST` rend des `pending` ;
      404 sur id inconnu **et** sur un envoi d'un autre propriétaire ; 409 `SCAN_NOT_COMPLETED` sur
      une analyse `pending` ou `failed` ; avec le catalogue `offline`, **200** et tous les livres
      `not_verified` (FR-008, SC-004) ; deux `POST` simultanés sur la même analyse rendent tous deux
      200 et le même état, sans doublon de tentative en base ; la réconciliation ne consomme pas le
      plafond d'analyses du jour (FR-025)

### Écrans (`apps/web/src/`)

- [X] T041 [US1] `features/photo-upload/api/` et `model/upload-state.ts` : l'état `success` porte
      `scanId` (l'`id` rendu par `POST /shelf-photos`) — **rouge** dans la spec de l'API, puis mettre
      à jour les specs qui construisent un `success`
- [X] T042 [US1] `features/photo-upload/ui/photo-upload-screen.tsx` : prop optionnelle
      `renderResult?: (result: { scanId: string; books: readonly DetectedBook[] }) => ReactNode`,
      `ScanResult` par défaut. **Rouge** dans `photo-upload-screen.spec.tsx` : la prop reçoit
      `scanId` et les livres, et remplace la liste par défaut ; elle **n'est pas appelée** pour une
      analyse sans livre, qui garde le message « aucun livre détecté » de `ScanResult` (spec 001,
      US1 scénario 3)
- [X] T043 [US1] `features/upload-history/ui/detail/loaded-entry.tsx` et `entry-detail-screen.tsx` :
      prop optionnelle `renderBooks?: (entry: { id: string; books: readonly DetectedBook[] }) => ReactNode`,
      `DetectedBooksList` par défaut. **Rouge** dans les specs du détail : la prop reçoit l'`id` et
      les livres d'un envoi abouti, y compris juste après une relance d'analyse qui aboutit ; elle
      n'est pas appelée pour un envoi sans livre, en échec ou non lancé, qui garde ses messages
      (spec 002, US2)
- [X] T044 [P] [US1] `features/reconciliation/model/` : `reconciled-book.ts` (copie locale du DTO,
      `pending` compris, plus le statut d'affichage `checking`), `reconciliation-state.ts`
      (`checking` | `ready { books }` | `failed { failure }`), `reconciliation-failure.ts` (`offline` |
      `rate_limited` | `unexpected`, un type jamais une phrase — ADR 0011)
- [X] T045 [P] [US1] `features/reconciliation/api/reconciliation-api.ts` (+ spec, `fetch` injecté) :
      `reconcile(id)` → `POST …/reconciliation`, `read(id)` → `GET …/reconciliation` ; ne rejettent
      jamais ; valident chaque élément selon son `status` (`reference`, `confirmedBy`, `titleOnly`
      pour `confirmed` ; 2 à 5 `candidates` pour `ambiguous`), tout ou rien ; absence de réponse →
      `offline`, 429 → `rate_limited`, tout autre statut ou corps invalide → `unexpected`
- [X] T046 [US1] `features/reconciliation/ui/use-reconciliation.ts` et `ui/reconciled-book-list.tsx`
      (+ specs, français) : deux modes — **après analyse** (`reconcile`) et **à l'ouverture d'un
      détail** (`read`, puis `reconcile` s'il reste des `pending`) ; **un seul appel par `scanId` et
      par mode**, même si le composant est monté deux fois (`StrictMode`) ; les livres détectés
      s'affichent « vérification en cours », puis leur statut — confirmé : forme de référence
      (titre — auteurs) et, si elle diffère, la lecture en second, mention « confirmé sur le titre
      seul » si `titleOnly` (FR-022) ; ambigu : « plusieurs œuvres possibles » (le choix arrive en
      US2) ; non trouvé : « inconnu du catalogue », jamais « inexistant » (FR-009) ; non vérifié ;
      en `failed`, tous les livres « non vérifiés » (FR-008), avec le message de la spec 002 pour
      `rate_limited` ; mention « Source : catalogue général de la BnF » dès qu'une forme de
      référence ou un candidat s'affiche (FR-023). Textes dans `i18n/fr.json` et `i18n/en.json`,
      namespace `reconciliation` enregistré dans `apps/web/src/i18n/resources.ts` ; composants de
      `@pick-a-book/shared-ui` et classes Tailwind sur les tokens ; mise en page qui tient à 360 px
      (SC-006) ; `translations-auditor` vert
- [X] T047 [US1] `apps/web/src/app/app.tsx` : branche `ReconciledBookList` dans `renderResult` de
      `PhotoUploadScreen` (mode après analyse) et dans `renderBooks` du détail d'un envoi (mode
      détail, et mode après analyse juste après une relance) ; `app.spec.tsx` et
      `app.history.spec.tsx` couvrent les deux parcours avec des `fetch` factices

**Checkpoint** : quickstart scénarios 1, 3 (sans la relance) et 5 passent ; MVP livrable.

---

## Phase 4: User Story 2 — Lever une ambiguïté (P2)

**Goal** : l'utilisateur choisit l'œuvre parmi les candidats, ou indique qu'aucune ne correspond,
depuis l'écran de résultat comme depuis le détail d'un envoi.

**Independent Test** : quickstart scénario 2.

- [X] T048 [US2] `libs/bibliography/domain/src/lib/book-reconciliation.ts` : `decide(decision)`.
      **Rouge** : `chosen` sur un ambigu → `confirmed`, origine `user`, notice choisie ; `rejected`
      → `not_found` ; `Err(BookNotAmbiguous)` « si le statut n'est pas `ambiguous` — donc aussi
      après une première décision » ; `Err(UnknownCandidate)` si `recordId` n'est pas un candidat ;
      la tentative ambiguë reste inchangée (FR-016)
- [X] T049 [US2] `drizzle-book-reconciliation-repository.adapter.ts` : `saveDecision(bookRef,
      decision)`, rattachée à l'unique tentative définitive du livre ; une seconde décision →
      `Err(BookNotAmbiguous)` (contrainte unique). **Rouge** (contre Postgres) : aller-retour des
      deux genres, seconde décision refusée, ligne de tentative identique avant et après
- [X] T050 [P] [US2] `libs/recognition/infrastructure/src/lib/scanner/stub-shelf-scanner.adapter.ts`
      (+ spec) : ajouter une détection **sans auteur** dont le titre est porté, dans le catalogue
      stub, par deux œuvres d'auteurs différents ; ajouter ces deux œuvres à
      `stub-bibliographic-catalog.adapter.ts` (+ spec : `matchBook` rend `ambiguous`) — research §12
- [X] T051 [US2] `libs/bibliography/application/src/lib/decide-ambiguity.use-case.ts` (+ spec) :
      `execute({ scanRef, position, decision })` → `Result<BookReconciliationDto, …>`. **Rouge** :
      candidat choisi → `confirmed`/`user` ; `none` → `not_found` ; livre non ambigu →
      `Err(BookNotAmbiguous)` ; candidat inconnu → `Err(UnknownCandidate)` ; livre jamais réconcilié
      → `Err(BookReconciliationNotFound)`
- [X] T052 [US2] `apps/api/src/orchestration/decide-shelf-book-ambiguity.use-case.ts` (+ spec) :
      vérifie l'envoi par `GetShelfScanUseCase` (propriétaire), puis appelle
      `DecideAmbiguityUseCase` ; route `POST /shelf-photos/:id/books/:position/decision` dans le
      contrôleur d'orchestration, `@HttpCode(200)`, corps validé par `zod` —
      `{ choice: 'candidate', recordId: string }` | `{ choice: 'none' }`, sinon 400 ; `position`
      entier ≥ 0, sinon 400 ; erreurs par `bibliography-http-error.ts`. Étendre
      `reconciliation.http.spec.ts` : 200 pour chaque choix, 400 (dont `UNKNOWN_CANDIDATE`), 404
      (dont un envoi d'un autre propriétaire), 409 `BOOK_NOT_AMBIGUOUS` en rejouant la même décision
- [X] T053 [P] [US2] `apps/web/src/features/reconciliation/api/reconciliation-api.ts` : `decide(id,
      position, decision)` (+ spec) — rend le livre mis à jour ou un échec `conflict` (409) |
      `rate_limited` | `offline` | `unexpected`
- [X] T054 [US2] `features/reconciliation/ui/ambiguity-picker.tsx` (+ spec) et intégration dans
      `reconciled-book-list.tsx` / `use-reconciliation.ts` : sur un livre ambigu, candidats dépliables
      (titre — auteurs, dans l'ordre reçu), un bouton par candidat et « aucun ne correspond » ; le
      livre est remplacé par la réponse ; sur `conflict`, l'état est relu par `read` ; sur
      `rate_limited`, le choix reste ouvert avec le message de la spec 002 ; cibles tactiles de
      44 px ; clés i18n dans les deux langues ; fonctionne dans les deux hôtes (T047)

**Checkpoint** : quickstart scénario 2 passe, sur l'écran de résultat et dans le détail d'un envoi.

---

## Phase 5: User Story 3 — Conserver le résultat avec l'analyse (P2)

**Goal** : le résultat de chaque livre est retrouvable après coup, sans réinterroger le catalogue,
et la lecture de la reconnaissance reste intacte.

**Independent Test** : après une analyse, lire la base (quickstart scénario 4, colonnes de statut et
de notice) sans passer par l'écran.

- [ ] T055 [US3] Étendre `apps/api/src/orchestration/reconciliation.http.spec.ts` : après
      réconciliation, `BookReconciliationRepositoryPort.findByScan` (résolu depuis l'app) rend pour
      chaque livre son statut, et pour un confirmé l'ARK, la forme de référence et la notice telle
      que reçue (FR-012) ; `attempted_at` renseigné ; les livres de l'analyse dans `recognition`
      identiques avant et après (FR-013) ; un second `POST` et un `GET` ne créent **aucune**
      tentative et ne rappellent pas le catalogue (compteur du catalogue factice injecté par
      surcharge du module de test, SC-005)
- [ ] T056 [US3] `reconcile-detected-books.use-case.spec.ts` : cas « livre non vérifié » — la lecture
      (`query_title`, `query_author`) est conservée telle que reçue, auteur absent compris (US3
      scénario 2)

**Checkpoint** : US3 vérifiée par la base seule.

---

## Phase 6: User Story 5 — Garder de quoi comprendre où le système se trompe (P2)

**Goal** : chaque livre conserve lecture, catalogue, étape de la cascade, score, scores des notices
retenues et écartées, cause d'un « non vérifié », et résultat automatique à côté de la décision
(FR-015 à FR-018).

**Independent Test** : quickstart scénario 4 ; SC-007 prouvé par T059.

- [ ] T057 [US5] `libs/bibliography/domain/src/lib/match-book.ts` : `examined` — les notices
      examinées **non retenues**, « 3 au plus, les mieux notées », avec leurs scores. **Rouge**
      dans `match-book.spec.ts` : présent pour les trois verdicts, jamais une notice retenue, trié
      par score
- [ ] T058 [US5] `drizzle-book-reconciliation-repository.adapter.ts` : écrire `examined` avec
      `retained = false` et des rangs qui suivent les retenues ; relire `title_score`,
      `author_score` (nul sans auteur lu), `score`, `catalog`, `cascade_step`,
      `reconciliation_score`, `not_verified_cause`. **Rouge** (contre Postgres) : aller-retour exact
      de ces valeurs pour chaque verdict ; après une décision, la tentative ambiguë et ses candidats
      sont inchangés (FR-016)
- [ ] T059 [US5] `libs/bibliography/infrastructure/src/lib/error-categories.spec.ts` (contre
      Postgres) : enregistrer via l'adapter un lot couvrant chaque catégorie de `data-model.md`
      §Catégories d'écart, puis prouver par une requête SQL écrite dans la spec que chaque livre se
      range dans exactement sa catégorie, rang du candidat choisi et étape compris (SC-007) — sans
      code de production d'analyse (FR-018)
- [ ] T060 [US5] `apps/api/src/orchestration/reconciliation.http.spec.ts` : les réponses des trois
      endpoints ne contiennent **aucune** clé `score`, `titleScore`, `authorScore`,
      `reconciliationScore`, `catalog`, `step`, `cause`, `confidence` (FR-018, FR-021)

**Checkpoint** : quickstart scénario 4 passe.

---

## Phase 7: User Story 4 — Relancer la vérification (P3)

**Goal** : depuis l'écran de résultat ou le détail d'un envoi, relancer la réconciliation des livres
« non vérifiés », sans renvoyer la photo ni refaire l'analyse.

**Independent Test** : quickstart scénario 3 complet.

- [ ] T061 [US4] `reconcile-detected-books.use-case.spec.ts` : relance — après un premier appel où
      le catalogue factice échoue pour certains livres, un second appel ne cherche **que** ces
      livres, laisse les définitifs intacts, et ajoute une tentative sans effacer la
      `not_verified` précédente (FR-014, US5)
- [ ] T062 [US4] `reconciliation.http.spec.ts` : relance pendant une réconciliation encore en
      cours (double appui sur « relancer ») — les deux réponses sont 200 et décrivent le même état,
      une seule tentative définitive par livre en base (la règle elle-même est posée en US1, T027)
- [ ] T063 [US4] `reconciliation.http.spec.ts` : avec un catalogue factice injecté (surcharge du
      port dans le module de test), indisponible puis rétabli — second `POST …/reconciliation` →
      les `not_verified` reçoivent un statut définitif, sans nouvel appel au scanner
- [ ] T064 [US4] `apps/web/src/features/reconciliation/ui/reconciled-book-list.tsx` et
      `use-reconciliation.ts` (+ specs) : un bouton « relancer la vérification » s'affiche quand au
      moins un livre est non vérifié ou que l'appel a échoué, désactivé pendant la relance ; il
      rappelle `reconcile` et remplace l'état ; absent quand tous les statuts sont définitifs (US4
      scénario 2) ; présent aussi dans le détail d'un envoi (US4 scénario 3) ; clés i18n dans les
      deux langues

**Checkpoint** : quickstart scénarios 1 à 4 passent en entier.

---

## Phase 8: Production et mesure

- [X] T065 `infra/envs/prod` : **rouge** d'abord dans `tests/*.tftest.hcl` (`command = plan`,
      `mock_provider`) — `api_env` porte `BIBLIOGRAPHIC_CATALOG_PROVIDER = "bnf"`, avec un
      `error_message` qui dit pourquoi (sans lui, la prod réconcilie contre le stub) ; puis
      l'ajouter à `api_env` dans `main.tf`. Aucun secret : la BnF n'a pas de clé. `infra-checker`
      vert ; jamais d'`apply` sans `plan` relu (`infra.md`)
- [ ] T066 Mode réconciliation du bench (`tools/bench/`, `README.md`) : sur le jeu de référence
      (#10) et ses sorties VLM, avec l'adapter BnF, mesurer SC-001 (≥ 80 % des livres présents et
      bien lus confirmés) et SC-002 (< 2 % de confirmations sans livre correspondant), par étape de
      la cascade (condition de bascule « filet » de l'ADR 0014) — manuel, hors CI
- [ ] T067 Caler `MatchingSettings`, les coefficients du score et `ReconciliationLimits` sur la
      mesure de T066 ; mettre à jour research §5 et §7 avec les valeurs retenues

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T068 [P] `CLAUDE.md` : arborescence (`libs/bibliography/{domain,application,infrastructure}`,
      `libs/shared/sql-migrations`, `apps/api/src/orchestration/`), `bibliography` désormais fondé en
      code (paragraphe « `recognition` est le seul bounded context fondé… »), ligne `yarn db:generate`
      ; `module-boundaries.md` : une lib partagée n'importe aucun contexte, mais peut être
      `scope:api` quand elle ne sert qu'au back (`sql-migrations`, research §8) ; `adapters.md` :
      « les migrations restent dans `infrastructure` » vise les fichiers SQL et le schéma, pas le
      lanceur générique ; `docs-index-auditor` vert
- [ ] T069 [P] `README.md` des quatre nouvelles libs, au format de ceux de `libs/recognition/*`
      (rôle, API publique, frontières)
- [ ] T070 [P] Vérifier que la CI (`.github/workflows/ci.yml`) fait tourner les specs de
      `bibliography-infrastructure` et `shared-sql-migrations` contre son Postgres (même
      `DATABASE_URL` que `recognition-infrastructure`) ; ajuster sinon
- [ ] T071 Exécuter `quickstart.md` en entier dans Chromium à 360 px de large, contre l'API buildée
      (`yarn nx build api`) : scénarios 1 à 5 ; SC-003 est prouvé par la spec de T027, et se
      remesure sur la BnF par le scénario 5
- [ ] T072 `yarn check` vert (`check-runner`) ; vérifier que les garde-fous opèrent (import interdit
      `bibliography` → `recognition`, `throw` dans `bibliography-domain`, qui font échouer
      `yarn lint`, puis retirés)
- [ ] T073 Passer l'ADR 0014 au statut « accepté » dans le fichier et dans l'index de
      `docs/adr/README.md`, avant ou avec la première PR de code (procédure de `docs/adr/README.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance.
- **Foundational (Phase 2)** : après Setup ; bloque toutes les user stories.
- **US1 (Phase 3)** : après Foundational. MVP.
- **US2 (Phase 4)**, **US3 (Phase 5)** : après US1 — elles s'appuient sur les routes de
  réconciliation et la liste réconciliée ; indépendantes entre elles.
- **US5 (Phase 6)** : après US1 **et US2** — T058 et T059 ont besoin de `saveDecision` (T049),
  T060 de la route de décision (T052).
- **US4 (Phase 7)** : après US1 ; T064 réutilise la liste de T046.
- **Production et mesure (Phase 8)** : T065 après US1 (avant tout déploiement de la feature) ; T066,
  T067 après US1.
- **Polish (Phase 9)** : après les stories voulues.

### Within Each User Story

- Domaine → application → adapters → composition root → HTTP → écran.
- Chaque tâche commence par sa spec en échec.
- Dans US1 : T022, T023 avant T024 ; T024 avant T025 ; T024–T026 avant T027 ; T031 avant T032–T034 ;
  T027–T037 avant T038–T040 ; T041–T043 avant T047 ; T044–T045 avant T046.

### Parallel Opportunities

- Setup : T002, T003, T004 après T001 ; T006, T007 à tout moment.
- Foundational : T011, T012, T013 ensemble ; T019, T020, T021 ensemble une fois T016 fait.
- US1 : T022 ‖ T023 ; T029 ‖ T030 ‖ T031 ; T044 ‖ T045 (et tout le front ‖ le back à partir de
  T041, le contrat étant fixé).
- US2 : T048 ‖ T050 ; T053 ‖ back.
- Après US1 : US2, US3 et US4 peuvent avancer en parallèle ; US5 après US2.

## Parallel Example: User Story 1

```bash
# Règle d'appariement — deux fichiers indépendants :
Task: "T022 title-forms.ts (+ spec) in libs/bibliography/domain/src/lib/"
Task: "T023 author-forms.ts (+ spec) in libs/bibliography/domain/src/lib/"

# Adapters sans réseau, et fixtures BnF :
Task: "T029 stub adapters in libs/bibliography/infrastructure/src/lib/"
Task: "T030 offline-bibliographic-catalog.adapter.ts in libs/bibliography/infrastructure/src/lib/"
Task: "T031 recorded SRU responses in libs/bibliography/infrastructure/src/lib/bnf/fixtures/"

# Front, une fois le contrat fixé :
Task: "T044 model/ in apps/web/src/features/reconciliation/"
Task: "T045 api/reconciliation-api.ts in apps/web/src/features/reconciliation/"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 puis Phase 2 — `yarn check` vert, tables créées.
2. Phase 3 (US1) — statuts affichés avec le catalogue stub, « non vérifié » avec `offline`, puis
   contre la BnF ; sur l'écran de résultat et dans le détail d'un envoi.
3. **Valider** : quickstart scénarios 1, 3 et 5 ; `yarn check`.
4. T065 avant de déployer. PR possible à ce stade : la réconciliation est utile même sans levée
   d'ambiguïté ni relance.

### Incremental Delivery

1. MVP (US1), avec T065.
2. US2 — les ambigus deviennent exploitables.
3. US3, puis US5 (après US2) — surtout des specs : la persistance est posée dès la Phase 2.
4. US4 — relance depuis l'écran et le détail.
5. T066, T067 : mesure de SC-001/SC-002 par le bench et calage des réglages.

## Notes

- Le schéma de la Phase 2 porte déjà toutes les colonnes de US2 et US5 : une seule migration pour la
  feature, pas de migration intermédiaire.
- Committer après chaque tâche ou groupe logique, messages en anglais.
- Tout hors-scope découvert en route va dans `docs/parking.md`, dans le même commit.
- Ce qui relève de l'enrichissement (Google Books, champs de la notice, état par source) n'entre pas
  ici : spec 004 (research §14).
