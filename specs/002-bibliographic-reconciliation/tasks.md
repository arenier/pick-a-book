---

description: "Task list for bibliographic reconciliation"
---

# Tasks: Réconciliation bibliographique des livres détectés

**Input**: Design documents from `/specs/002-bibliographic-reconciliation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/reconciliation-api.md, quickstart.md

**Tests**: Inclus et obligatoires — la constitution impose le TDD (principe I). **Une tâche = un
cycle rouge/vert/refactor** (`docs/spec-driven-development.md` §5) : chaque tâche nomme d'abord la
spec à écrire, qui doit échouer, puis le code minimal qui la fait passer. Une spec qui passe avant
d'avoir écrit le code ne prouve rien : la faire échouer d'abord.

**Organization**: Setup et Foundational (socle commun : trois libs `bibliography`, migrations par
contexte, pool unique, modèle et dépôt), puis une phase par user story dans l'ordre des priorités —
US1 (P1), US2, US3, US5 (P2), US4 (P3). La Phase 8 (référentiel réel) est **bloquée par l'ADR #20**
et ne conditionne aucune autre phase.

**Révisé le 28/09/2026** (`/speckit-analyze`) : sans renumérotation —
- *I1* : la course entre deux réconciliations de la même analyse est traitée dès US1 (T026, T040,
  T035) : `StrictMode` monte l'écran deux fois en développement, et le second appel levait
  `BookAlreadyReconciled` en 500 ; T056 devient le test de bout en bout de ce cas, via la relance ;
- *G1* : une analyse sans livre garde le message « aucun livre détecté » de la spec 001 (T037) ;
- *I2* : US5 dépend de US2 (T052, T053 ont besoin de `saveDecision`, T044) ;
- *U1* : dépendances de workspace à déclarer (T008, T009, T032) ;
- *C1* : le lanceur de migrations partagé est justifié dans research §8, et `CLAUDE.md` nuancé (T063) ;
- *U2* : SC-003 prouvé par une spec de 30 livres (T026) plutôt que par un stub ralenti.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, aucune dépendance sur une tâche non terminée)
- **[Story]** : US1 (statuts), US2 (lever une ambiguïté), US3 (conservation), US4 (relance),
  US5 (faits pour l'analyse des erreurs)

## Rappels valables pour toutes les tâches

- Pas de `as` (hors `as const`), assertions strictes (`toStrictEqual`, `toBe(true)`), specs en
  `*.spec.ts` qui importent `describe`/`expect`/`it` de `vitest`.
- Code, commentaires, messages d'erreur et descriptions de tests en anglais ; textes d'écran dans
  `features/reconciliation/i18n/{fr,en}.json`, **les deux langues dans le même commit**.
- Aucun import de `recognition` depuis `bibliography` ni l'inverse : le croisement se fait dans
  `apps/api/src/orchestration/`, sur des DTO.
- Les specs d'adapters Postgres tournent contre le `db` du compose (`docker compose up -d db bucket`).

---

## Phase 1: Setup

- [ ] T001 Créer la lib `libs/bibliography/domain/` sur le modèle de `libs/recognition/domain/`
      (`package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`,
      `vitest.config.mts`, `eslint.config.mjs`, `src/index.ts` vide, `README.md` d'une ligne) :
      nom `@pick-a-book/bibliography-domain`, `nx.name` `bibliography-domain`, tags
      `type:domain`, `context:bibliography`, `scope:api` ; dépendances `tslib` et
      `@pick-a-book/shared-text-match` (`workspace:*`)
- [ ] T002 [P] Créer `libs/bibliography/application/` sur le modèle de `libs/recognition/application/` :
      `@pick-a-book/bibliography-application`, tags `type:application`, `context:bibliography`,
      `scope:api`, dépendance `@pick-a-book/bibliography-domain` ; `tsconfig.lib.json` exclut
      `src/**/testing/**` comme la lib modèle
- [ ] T003 [P] Créer `libs/bibliography/infrastructure/` sur le modèle de
      `libs/recognition/infrastructure/` : `@pick-a-book/bibliography-infrastructure`, tags
      `type:infrastructure`, `context:bibliography`, `scope:api`, dépendances
      `@pick-a-book/bibliography-domain`, `drizzle-orm`, `pg` (mêmes versions que
      `recognition-infrastructure`) ; `drizzle.config.ts` avec
      `schema: './libs/bibliography/infrastructure/src/lib/drizzle/schema.ts'`,
      `out: './libs/bibliography/infrastructure/src/lib/drizzle/migrations'` et
      `migrations: { table: '__drizzle_migrations_bibliography' }` (research §8)
- [ ] T004 [P] Créer `libs/shared/sql-migrations/` : `@pick-a-book/shared-sql-migrations`, tags
      `type:shared`, `context:none`, `scope:api`, dépendances `drizzle-orm`, `pg`, `tslib`
- [ ] T005 Ajouter à `eslint.config.mjs` la contrainte
      `{ sourceTag: 'context:bibliography', onlyDependOnLibsWithTags: ['context:bibliography', 'context:none'] }`
      (commentaire : ADR 0010), puis `yarn install && yarn nx sync` pour lier les quatre projets ;
      vérifier que le garde-fou opère : un import temporaire de `@pick-a-book/recognition-domain`
      dans `libs/bibliography/domain/src/index.ts` fait échouer `yarn lint` — puis le retirer
- [ ] T006 [P] Dans `package.json` racine, faire générer par `db:generate` les migrations des deux
      contextes (`drizzle-kit generate --config libs/recognition/infrastructure/drizzle.config.ts
      && drizzle-kit generate --config libs/bibliography/infrastructure/drizzle.config.ts`) ;
      mettre à jour la ligne `yarn db:generate` de `CLAUDE.md` (« des deux contextes »)
- [ ] T007 [P] Documenter dans `.env.example` `BIBLIOGRAPHIC_CATALOG_PROVIDER=stub` : optionnel,
      défaut `stub`, valeurs `stub` (catalogue en mémoire) et `offline` (référentiel toujours
      indisponible, pour voir « non vérifié » et la relance) — research §12

---

## Phase 2: Foundational (bloquant — commun à toutes les user stories)

**But** : migrations par contexte et pool unique (research §8), modèle du domaine, schéma et dépôt,
DTO et configuration. Rien de visible pour l'utilisateur à la fin de cette phase.

### Migrations et pool

- [ ] T008 Déplacer `migrateDatabase` de `libs/recognition/infrastructure/src/lib/migrate-database.ts`
      (et sa spec) vers `libs/shared/sql-migrations/src/lib/migrate-database.ts`, avec la
      signature `migrateDatabase(pool, { migrationsFolder, migrationsTable })`. **Rouge** : la spec
      déplacée gagne un cas « deux dossiers, deux tables de suivi, appliqués l'un après l'autre
      sans se gêner » (contre Postgres) et garde le cas du verrou consultatif partagé
      (`pick-a-book/migrations`). **Vert** : implémenter, exporter depuis `src/index.ts`, retirer
      l'export de `recognition-infrastructure` et faire pointer ses specs (`test-database.ts`) vers
      la lib partagée, `migrationsTable` = `__drizzle_migrations` (la table actuelle, pour ne pas
      rejouer les migrations déjà appliquées de `recognition`) ; ajouter
      `@pick-a-book/shared-sql-migrations` (`workspace:*`) aux dépendances de
      `libs/recognition/infrastructure/package.json` (sinon `@nx/dependency-checks` échoue)
- [ ] T009 Créer `apps/api/src/database/database.module.ts` (+ `.spec.ts`) : fournit un `Pool`
      unique (`DATABASE_POOL`) depuis `environment.databaseUrl`, applique au démarrage les
      migrations de `recognition` (`dist/migrations/recognition`, table `__drizzle_migrations`)
      puis de `bibliography` (`dist/migrations/bibliography`, table
      `__drizzle_migrations_bibliography`), ferme le pool à l'arrêt (`onApplicationShutdown`).
      **Rouge** : la spec vérifie l'ordre des migrations et la fermeture avec un pool factice.
      Adapter `apps/api/src/recognition/shelf-scan-archive.factory.ts` (+ spec) pour **recevoir**
      le pool au lieu de l'ouvrir, et `recognition.module.ts` pour ne plus migrer ni fermer ;
      ajouter `@pick-a-book/shared-sql-migrations` et `pg` (s'il n'y est pas) à
      `apps/api/package.json`
- [ ] T010 Dans `apps/api/vite.config.mts`, copier les deux dossiers de migrations vers
      `dist/migrations/recognition` et `dist/migrations/bibliography` ; vérifier par
      `yarn nx build api && ls apps/api/dist/migrations/*` ; relire `docker/` pour s'assurer que
      l'image embarque `dist/migrations/` en entier

### Domaine `bibliography` (`libs/bibliography/domain/src/lib/`)

- [ ] T011 [P] `shelf-book-ref.ts`, `book-query.ts` (+ specs) : `ShelfBookRef` — « `scanRef` UUID ;
      `position` entier ≥ 0 » ; `BookQuery` — « titre non vide après normalisation des espaces,
      ≤ 500 caractères ; auteur absent ou non vide » (un auteur vide ou blanc est refusé, jamais
      converti en absent)
- [ ] T012 [P] `catalog-name.ts`, `catalog-record-id.ts`, `work-key.ts`, `catalog-record.ts`
      (+ specs) : `CatalogName` — « non vide, `[a-z0-9-]+` » ; `CatalogRecordId` et `WorkKey` —
      « non vide, ≤ 200 caractères » ; `CatalogRecord` — `id`, `workKey`, `title` non vide,
      `authors` (liste éventuellement vide)
- [ ] T013 [P] `match-score.ts`, `not-verified-cause.ts` (+ specs) : `MatchScore` — « nombre fini
      dans [0, 1] » ; `NotVerifiedCause` — `unavailable` | `timeout` | `invalid_response`, avec un
      type guard pour relire la valeur depuis le stockage
- [ ] T014 `match-outcome.ts` : types `ScoredRecord` (`record`, `titleScore`, `authorScore?`,
      `score`, `rank`, `retained`) et `MatchOutcome` (`confirmed` | `ambiguous` | `not_found`, chacun
      avec `examined`) exactement comme `data-model.md` §MatchOutcome ; errors
      `book-already-reconciled.error.ts`, `book-not-ambiguous.error.ts`,
      `unknown-candidate.error.ts`, `book-reconciliation-not-found.error.ts` (une classe par
      fichier, `name` renseigné, comme `shelf-scan-not-found.error.ts`)
- [ ] T015 `book-reconciliation.ts` (+ `.spec.ts`) : `ReconciliationAttempt`, `AmbiguityDecision`,
      agrégat `BookReconciliation`. **Rouge** : table de cas du statut déduit (`data-model.md`
      §Statut courant, lignes sans décision), `needsAttempt()` vrai seulement pour `pending` et
      `not_verified`, `recordAttempt()` qui rejette `BookAlreadyReconciled` sur un statut
      définitif. La décision (`decide`) arrive en US2 (T043)
- [ ] T016 `bibliographic-catalog.port.ts`, `book-reconciliation-repository.port.ts` (+ spec de
      forme comme `shelf-scan-repository.port.spec.ts`) : `BibliographicCatalogPort`
      (`name: CatalogName`, `search(query: BookQuery, signal: AbortSignal): Promise<CatalogRecord[]>`),
      classe `CatalogUnavailable` portant sa `cause` (`unavailable` | `invalid_response`) ;
      `BookReconciliationRepositoryPort` (`findByScan`, `find`, `saveAttempt`, `saveDecision`) ;
      jetons `BIBLIOGRAPHIC_CATALOG_PORT`, `BOOK_RECONCILIATION_REPOSITORY_PORT` ; tout exporter
      depuis `src/index.ts`

### Persistance (`libs/bibliography/infrastructure/src/lib/`)

- [ ] T017 `drizzle/schema.ts` : les trois tables de `data-model.md` §Stockage, contraintes
      recopiées telles quelles — `reconciliation_attempts` (`verdict in ('confirmed','ambiguous',
      'not_found','not_verified')` ; `not_verified_cause` « non nul si et seulement si
      `verdict = 'not_verified'` » ; `position >= 0` ; index `(scan_ref, position)` ; **index
      unique partiel** `(scan_ref, position) where verdict <> 'not_verified'`),
      `reconciliation_candidates` (PK `(attempt_id, rank)`, `rank >= 1`, scores dans [0, 1],
      `author_score` nullable, `authors text[]`, `retained boolean`), `reconciliation_decisions`
      (PK `attempt_id`, `kind in ('chosen','rejected')`, `record_id` « non nul si et seulement si
      `kind = 'chosen'` »). Aucune clé étrangère vers les tables de `recognition` (research §4).
      Puis `yarn db:generate` → `drizzle/migrations/0000_*.sql`, commité ; `drizzle/test-database.ts`
      sur le modèle de celui de `recognition`
- [ ] T018 `drizzle-book-reconciliation-repository.adapter.ts` (+ `.spec.ts` contre Postgres) :
      `saveAttempt` écrit la tentative et ses notices (retenues et écartées) **dans une
      transaction** et traduit la violation de l'index unique partiel en `BookAlreadyReconciled` ;
      `findByScan` et `find` reconstruisent les agrégats, tentatives ordonnées par `attempted_at`.
      **Rouge** : aller-retour de chaque verdict, deux tentatives définitives sur un même livre
      refusées, une tentative `not_verified` suivie d'une définitive acceptée. `saveDecision` en
      US2 (T044)

### Application et composition

- [ ] T019 [P] `libs/bibliography/application/src/lib/testing/in-memory-book-reconciliation-repository.ts`
      et `testing/fake-bibliographic-catalog.ts` : dépôt en mémoire qui respecte la même règle
      d'unicité que l'index partiel ; référentiel factice scriptable (notices par titre, échec avec
      une cause, délai, compteur d'appels)
- [ ] T020 [P] `libs/bibliography/application/src/lib/reconciliation.dto.ts` (+ `to-dto.spec.ts`) :
      `DetectedBookInput`, `ShelfReconciliationDto`, `BookReconciliationDto`, `ReferenceDto` tels que
      `data-model.md` §DTO de frontière, et `toBookReconciliationDto(aggregate)`. **Rouge** : une
      ligne par statut, `confirmedBy`, `author` absent — jamais `""` —, et **aucun** score,
      référentiel ni cause dans le DTO (FR-018)
- [ ] T021 [P] `apps/api/src/config/environment.ts` (+ spec) : `bibliographicCatalog: { provider:
      'stub' | 'offline' }`, lu de `BIBLIOGRAPHIC_CATALOG_PROVIDER`, défaut `stub` ; toute autre
      valeur ajoute un problème listé au démarrage, comme `SHELF_SCANNER_PROVIDER`

**Checkpoint** : `yarn check` vert ; l'API démarre et crée les tables de `bibliography`
(quickstart §Prérequis) ; aucun comportement visible nouveau.

---

## Phase 3: User Story 1 — Savoir quels livres détectés existent vraiment (P1) 🎯 MVP

**Goal** : après l'analyse, chaque livre porte un statut — confirmé (forme de référence), ambigu,
inconnu du référentiel, non vérifié — sans action de l'utilisateur.

**Independent Test** : quickstart scénario 1 (stub) et scénario 3 (offline) : statuts affichés, un
titre inventé jamais confirmé, un référentiel en panne n'empêche pas l'affichage des livres.

### Règle de correspondance (`libs/bibliography/domain/src/lib/`)

- [ ] T022 [P] [US1] `title-forms.ts` (+ spec) : formes comparables d'un titre (research §5.1) —
      `normalizeText` de `@pick-a-book/shared-text-match`, article initial retiré (`le, la, les,
      l', un, une, des, the, a, an`), titre principal d'une notice (avant ` : `, ` - `, ` / `) ;
      `titleScore(read, recordTitle)` = maximum de `similarity` sur ces formes. **Rouge** :
      « La Peste » vs « La peste / Albert Camus » = 1 ; « La Pest » ≥ 0,85 ; « L'Amant » vs
      « Amant » = 1 ; deux titres différents < 0,85
- [ ] T023 [P] [US1] `author-match.ts` (+ spec) : `authorScore(read, recordAuthors)` (research §5.3)
      — indépendant de l'ordre (« Camus, Albert » = « Albert Camus »), dates entre parenthèses
      retirées, forme abrégée compatible (« A. Camus », « Camus ») = 0,9 ; maximum sur les auteurs
      de la notice ; 0 si la notice n'a pas d'auteur. **Rouge** : chacun de ces cas, plus un auteur
      franchement différent < 0,85
- [ ] T024 [US1] `match-book.ts` (+ spec) : `MatchingSettings` validé à la construction (« seuils
      dans [0, 1], entiers ≥ 1 ») avec les valeurs par défaut provisoires — seuil titre 0,85, seuil
      auteur 0,85, poids titre 0,7, marge 0,1, candidats max 5, écartés conservés max 3 — et
      `matchBook(query, records, settings)` (research §5.4–6). **Rouge**, une table de cas : lecture
      exacte → confirmé ; une lettre en moins → confirmé (FR-003) ; auteur lu contradictoire →
      notice écartée même si le titre correspond ; aucun titre proche → non trouvé (FR-004) ; titre
      seul porté par une œuvre → confirmé, par deux œuvres d'auteurs différents → ambigu (FR-005) ;
      trois éditions d'une même `workKey` → confirmé, pas ambigu (FR-007) ; une œuvre hors marge
      n'est pas candidate ; au plus 5 candidats, rangs 1..n sans trou, classés par score
      décroissant ; score combiné = titre seul sans auteur lu, 0,7 × titre + 0,3 × auteur sinon

### Réconciliation (`libs/bibliography/application/src/lib/`)

- [ ] T025 [US1] `run-with-limits.ts` (+ spec, faux timers de Vitest) : exécute des tâches avec
      **4** en parallèle au plus, un `AbortSignal` par tâche déclenché à **8 s**, et une **échéance
      globale de 18 s** au-delà de laquelle les tâches pas encore lancées ne le sont pas ; rend,
      par tâche, `ok`, `failed` ou `timed_out`, dans l'ordre d'entrée. Sans dépendance (research §7)
- [ ] T026 [US1] `reconcile-detected-books.use-case.ts` (+ spec avec T019) :
      `ReconcileDetectedBooksUseCase(catalog, repository, settings, limits)`. **Rouge** : premier
      appel → une tentative par livre, verdict issu de `matchBook`, `catalog.name` enregistré ;
      `CatalogUnavailable` → `not_verified` avec sa cause ; recherche au-delà de 8 s →
      `not_verified` / `timeout` ; livres au-delà de l'échéance → `not_verified` / `timeout` sans
      appel au référentiel ; réponse = **tous** les livres, triés par position ; liste vide →
      `{ books: [] }` ; jamais de rejet à cause du référentiel (FR-008) ; **deux exécutions
      concurrentes** sur la même analyse — le `BookAlreadyReconciled` levé par `saveAttempt` pour
      la seconde n'est pas une erreur : le use case relit l'état et le rend (dépôt en mémoire de
      T019, qui applique la même unicité) ; **SC-003** — 30 livres, référentiel factice à 1,5 s par
      recherche, faux timers : tous les livres ont un statut définitif en ≤ 18 s simulées, aucun en
      `timeout`. Exporter depuis `src/index.ts`

### Adapters (`libs/bibliography/infrastructure/src/lib/`)

- [ ] T027 [P] [US1] `stub-bibliographic-catalog.adapter.ts` (+ spec) : `name` = `stub`, catalogue
      en mémoire qui, avec `matchBook`, confirme les livres du scanner stub — « L'Amant » (Duras,
      **deux éditions** de même `workKey`), « Les Choses » (Perec), « La Place » (Ernaux, **plus**
      une autre œuvre « La Place » d'un autre auteur, écartée par l'auteur lu) — et ne connaît rien
      d'approchant « Titre peu lisible » ; filtre par titre normalisé, rend au plus 20 notices
- [ ] T028 [P] [US1] `offline-bibliographic-catalog.adapter.ts` (+ spec) : `name` = `offline`,
      rejette toujours `CatalogUnavailable('unavailable')`

### Côté `recognition`

- [ ] T029 [US1] `libs/recognition/domain/src/lib/shelf-scan-not-completed.error.ts` et
      `libs/recognition/application/src/lib/get-detected-books.use-case.ts` (+ spec avec les
      doubles existants de `testing/`) : `execute({ id })` → `{ books: PositionedDetectedBookDto[] }`
      (`position` = index dans la liste). **Rouge** : analyse `completed` → livres positionnés,
      auteur absent préservé ; `pending` ou `failed` → `ShelfScanNotCompleted` ; id inconnu ou non
      UUID → `ShelfScanNotFound`. Exporter les deux
- [ ] T030 [US1] `apps/api/src/recognition/recognition-exception.filter.ts` : `ShelfScanNotCompleted`
      → 409 (spec du filtre) ; `recognition.module.ts` fournit et **exporte**
      `GetDetectedBooksUseCase` (spec du module)

### Composition root et orchestration (`apps/api/src/`)

- [ ] T031 [US1] `bibliography/bibliographic-catalog.factory.ts` (+ spec) : `stub` →
      `StubBibliographicCatalogAdapter`, `offline` → `OfflineBibliographicCatalogAdapter`
- [ ] T032 [US1] `bibliography/bibliography.module.ts` (+ spec) : lie
      `BOOK_RECONCILIATION_REPOSITORY_PORT` à l'adapter Drizzle sur le pool de `DatabaseModule`,
      `BIBLIOGRAPHIC_CATALOG_PORT` à la fabrique, construit `ReconcileDetectedBooksUseCase` avec
      les réglages et limites par défaut, et l'**exporte** ; `bibliography-exception.filter.ts`
      traduit les erreurs du contexte comme `contracts/reconciliation-api.md` §Correspondance
      (404, 409, 400), sans jamais propager `CatalogUnavailable` ni `BookAlreadyReconciled` ;
      ajouter `@pick-a-book/bibliography-domain`, `-application` et `-infrastructure`
      (`workspace:*`) à `apps/api/package.json`
- [ ] T033 [US1] `orchestration/reconcile-shelf-photo.use-case.ts` (+ spec avec doubles des deux
      use cases) : lit les livres par `GetDetectedBooksUseCase`, les traduit en
      `DetectedBookInput` (`position`, `title`, `author` seulement s'il est présent), passe l'`id`
      comme `scanRef`, rend le DTO de `bibliography` tel quel ; laisse passer
      `ShelfScanNotFound`/`ShelfScanNotCompleted`. **N'importe aucun `*-domain`** : DTO seulement
      (ADR 0003)
- [ ] T034 [US1] `orchestration/shelf-photo-reconciliation.controller.ts` (+ spec) :
      `POST /shelf-photos/:id/reconciliation`, `@HttpCode(200)` ; `orchestration.module.ts`
      importe `RecognitionModule` et `BibliographyModule` ; `app/app.module.ts` importe
      `DatabaseModule`, `BibliographyModule`, `OrchestrationModule`
- [ ] T035 [US1] `orchestration/reconciliation.http.spec.ts` (de bout en bout sur l'app Nest, scanner
      et référentiel stub, Postgres du compose, comme `shelf-photos.http.spec.ts`) : envoi → analyse
      → réconciliation rend un élément par livre, trié, aux statuts attendus, `read` intact ; 404
      sur id inconnu ; 409 sur analyse `pending` ; avec le référentiel `offline`, **200** et tous les
      livres `not_verified` (FR-008, SC-004) ; deux `POST …/reconciliation` simultanés sur la même
      analyse rendent tous deux 200 et le même état, sans doublon de tentative en base

### Écran (`apps/web/src/`)

- [ ] T036 [US1] `features/photo-upload/api/scan-shelf-photo.ts` et `model/upload-state.ts` :
      l'état `success` porte `scanId` (l'`id` rendu par `POST /shelf-photos`) — **rouge** dans
      `api/scan-shelf-photo.spec.ts`, puis mettre à jour les specs qui construisent un `success`
- [ ] T037 [US1] `features/photo-upload/ui/photo-upload-screen.tsx` : prop optionnelle
      `renderResult?: (result: { scanId: string; books: readonly DetectedBook[] }) => ReactNode`,
      `ScanResult` par défaut. **Rouge** dans `photo-upload-screen.spec.tsx` : la prop reçoit
      `scanId` et les livres, et remplace la liste par défaut ; elle **n'est pas appelée** pour une
      analyse sans livre, qui garde le message « aucun livre détecté » de `ScanResult` (spec 001,
      US1 scénario 3 ; spec 002, Edge Cases)
- [ ] T038 [P] [US1] `features/reconciliation/model/` : `reconciled-book.ts` (copie locale du DTO,
      plus le statut d'affichage `checking`), `reconciliation-state.ts` (`checking` |
      `ready { books }` | `failed { failure }`), `reconciliation-failure.ts` (`offline` |
      `unexpected`, un type jamais une phrase — ADR 0011)
- [ ] T039 [P] [US1] `features/reconciliation/api/reconcile-shelf-photo.ts` (+ spec, `fetch` injecté) :
      `POST {base}/shelf-photos/{id}/reconciliation`, ne rejette jamais ; valide chaque élément par
      type guards selon son `status` (`reference` + `confirmedBy` pour `confirmed`, 2 à 5
      `candidates` pour `ambiguous`) ; absence de réponse → `offline`, tout autre statut ou corps
      invalide → `unexpected`
- [ ] T040 [US1] `features/reconciliation/ui/use-reconciliation.ts` et
      `ui/reconciled-book-list.tsx` (+ specs, français) : **un seul appel par `scanId`**, même si le
      composant est monté deux fois (`StrictMode` en développement) — le second montage reprend
      l'appel en cours au lieu d'en lancer un autre ; au montage, les livres détectés s'affichent
      « vérification en cours », puis leur statut — confirmé : forme de référence (titre — auteurs)
      et, si elle diffère, la lecture en second ; ambigu : mention « plusieurs œuvres possibles »
      (le choix arrive en US2) ; non trouvé : « inconnu du référentiel », jamais « inexistant »
      (FR-009) ; non vérifié ; en `failed`, tous les livres affichés « non vérifiés » (FR-008). Texte
      dans `i18n/fr.json` et `i18n/en.json`, namespace `reconciliation` enregistré dans
      `apps/web/src/i18n/resources.ts` ; mise en page qui tient à 360 px (`overflow-wrap: anywhere`
      sur les titres, SC-006) ; `yarn nx translations web` vert
- [ ] T041 [US1] `apps/web/src/app/app.tsx` : branche `ReconciledBookList` dans `renderResult` de
      `PhotoUploadScreen` ; `app.spec.tsx` couvre le parcours analyse → statuts avec des `fetch`
      factices

**Checkpoint** : quickstart scénarios 1 et 3 (sans la relance) passent ; MVP livrable.

---

## Phase 4: User Story 2 — Lever une ambiguïté (P2)

**Goal** : l'utilisateur choisit l'œuvre parmi les candidats, ou indique qu'aucune ne correspond.

**Independent Test** : quickstart scénario 2.

- [ ] T042 [P] [US2] `libs/recognition/infrastructure/src/lib/stub-shelf-scanner.adapter.ts` (+ spec) :
      ajouter une détection **sans auteur** dont le titre est porté, dans le catalogue stub, par
      deux œuvres d'auteurs différents ; ajouter ces deux œuvres à
      `stub-bibliographic-catalog.adapter.ts` (+ spec : `matchBook` rend `ambiguous`) — research §12
- [ ] T043 [US2] `libs/bibliography/domain/src/lib/book-reconciliation.ts` : `decide(decision)`.
      **Rouge** : `chosen` sur un ambigu → `confirmed`, origine `user`, notice choisie ; `rejected`
      → `not_found` ; refusé (`BookNotAmbiguous`) « si le statut n'est pas `ambiguous` — donc aussi
      après une première décision » ; refusé (`UnknownCandidate`) si `recordId` n'est pas un
      candidat ; la tentative ambiguë reste inchangée (FR-016)
- [ ] T044 [US2] `drizzle-book-reconciliation-repository.adapter.ts` : `saveDecision(bookRef,
      decision)`, rattachée à l'unique tentative définitive du livre ; une seconde décision →
      `BookNotAmbiguous` (contrainte unique). **Rouge** (contre Postgres) : aller-retour des deux
      genres, seconde décision refusée, ligne de tentative identique avant et après
- [ ] T045 [US2] `libs/bibliography/application/src/lib/decide-ambiguity.use-case.ts` (+ spec) :
      `execute({ scanRef, position, decision })` → `BookReconciliationDto`. **Rouge** : candidat
      choisi → `confirmed`/`user` ; `none` → `not_found` ; livre non ambigu → `BookNotAmbiguous` ;
      candidat inconnu → `UnknownCandidate` ; livre jamais réconcilié → `BookReconciliationNotFound`
- [ ] T046 [US2] `apps/api/src/bibliography/book-decisions.controller.ts` (+ spec) :
      `POST /shelf-photos/:id/books/:position/decision`, `@HttpCode(200)` ; corps validé par type
      guard — `{ choice: 'candidate', recordId: string }` | `{ choice: 'none' }`, sinon 400 ;
      `position` entier ≥ 0, sinon 400. Fournir `DecideAmbiguityUseCase` dans
      `bibliography.module.ts`. Étendre `reconciliation.http.spec.ts` : 200 pour chaque choix, 400,
      404, et 409 en rejouant la même décision
- [ ] T047 [P] [US2] `apps/web/src/features/reconciliation/api/decide-ambiguity.ts` (+ spec) : rend
      le livre mis à jour ou un échec `conflict` (409) | `offline` | `unexpected`
- [ ] T048 [US2] `features/reconciliation/ui/ambiguity-picker.tsx` (+ spec) et intégration dans
      `reconciled-book-list.tsx` / `use-reconciliation.ts` : sur un livre ambigu, candidats dépliables
      (titre — auteurs, dans l'ordre reçu), un bouton par candidat et « aucun ne correspond » ; le
      livre est remplacé par la réponse ; sur `conflict`, l'état est rechargé par
      `reconcile-shelf-photo` ; cibles tactiles de 44 px ; clés i18n dans les deux langues

**Checkpoint** : quickstart scénario 2 passe.

---

## Phase 5: User Story 3 — Conserver le résultat avec l'analyse (P2)

**Goal** : le résultat de chaque livre est retrouvable après coup, sans réinterroger le référentiel,
et la lecture de la reconnaissance reste intacte.

**Independent Test** : après une analyse, lire la base (quickstart scénario 4, colonnes de statut et
de notice) sans passer par l'écran.

- [ ] T049 [US3] Étendre `apps/api/src/orchestration/reconciliation.http.spec.ts` : après
      réconciliation, `BookReconciliationRepositoryPort.findByScan` (résolu depuis l'app) rend pour
      chaque livre son statut, et pour un confirmé l'identifiant de notice et la forme de référence
      (FR-012) ; `attempted_at` renseigné ; `detected_books` de `shelf_scans` identique avant et
      après (FR-013) ; un second appel ne crée **aucune** tentative et ne rappelle pas le référentiel
      (compteur du référentiel factice injecté par surcharge du module de test, SC-005)
- [ ] T050 [US3] `libs/bibliography/application/src/lib/reconcile-detected-books.use-case.spec.ts` :
      cas « livre non vérifié » — la lecture (`query_title`, `query_author`) est conservée telle
      que reçue, auteur absent compris (US3 scénario 2)

**Checkpoint** : US3 vérifiée par la base seule.

---

## Phase 6: User Story 5 — Garder de quoi comprendre où le système se trompe (P2)

**Goal** : chaque livre conserve lecture, référentiel, scores des notices retenues et écartées, cause
d'un « non vérifié », et résultat automatique à côté de la décision (FR-015 à FR-018).

**Independent Test** : quickstart scénario 4 ; SC-007 prouvé par T053.

- [ ] T051 [US5] `libs/bibliography/domain/src/lib/match-book.ts` : `examined` — les notices
      examinées **non retenues**, « 3 au plus, les mieux notées », avec leurs scores. **Rouge**
      dans `match-book.spec.ts` : présent pour les trois verdicts, jamais une notice retenue, trié
      par score
- [ ] T052 [US5] `drizzle-book-reconciliation-repository.adapter.ts` : écrire `examined` avec
      `retained = false` et des rangs qui suivent les retenues ; relire `title_score`,
      `author_score` (nul sans auteur lu), `score`, `catalog`, `not_verified_cause`. **Rouge**
      (contre Postgres) : aller-retour exact de ces valeurs pour chaque verdict ; après une décision,
      la tentative ambiguë et ses candidats sont inchangés (FR-016)
- [ ] T053 [US5] `libs/bibliography/infrastructure/src/lib/error-categories.spec.ts` (contre
      Postgres) : enregistrer via l'adapter un lot couvrant chaque catégorie de `data-model.md`
      §Catégories d'écart, puis prouver par une requête SQL écrite dans la spec que chaque livre se
      range dans exactement sa catégorie, rang du candidat choisi compris (SC-007) — sans code de
      production d'analyse (FR-018)
- [ ] T054 [US5] `apps/api/src/orchestration/reconciliation.http.spec.ts` : les réponses des deux
      endpoints ne contiennent **aucune** clé `score`, `titleScore`, `authorScore`, `catalog`,
      `cause` (FR-018)

**Checkpoint** : quickstart scénario 4 passe.

---

## Phase 7: User Story 4 — Relancer la vérification (P3)

**Goal** : depuis l'écran de résultat, relancer la réconciliation des livres « non vérifiés », sans
renvoyer la photo ni refaire l'analyse.

**Independent Test** : quickstart scénario 3 complet.

- [ ] T055 [US4] `reconcile-detected-books.use-case.spec.ts` : relance — après un premier appel où
      le référentiel factice échoue pour certains livres, un second appel ne cherche **que** ces
      livres, laisse les définitifs intacts, et ajoute une tentative sans effacer la
      `not_verified` précédente (FR-014, US5)
- [ ] T056 [US4] `reconciliation.http.spec.ts` : relance pendant une réconciliation encore en
      cours (double appui sur « relancer ») — les deux réponses sont 200 et décrivent le même état,
      une seule tentative définitive par livre en base (la règle elle-même est posée en US1, T026)
- [ ] T057 [US4] `reconciliation.http.spec.ts` : avec un référentiel factice injecté (surcharge du
      port dans le module de test), indisponible puis rétabli — second `POST …/reconciliation` →
      les `not_verified` reçoivent un statut définitif, sans nouvel appel au scanner
- [ ] T058 [US4] `apps/web/src/features/reconciliation/ui/reconciled-book-list.tsx` et
      `use-reconciliation.ts` (+ specs) : un bouton « relancer la vérification » s'affiche quand au
      moins un livre est non vérifié ou que l'appel a échoué, désactivé pendant la relance ; il
      rappelle `reconcile-shelf-photo` et remplace l'état ; absent quand tous les statuts sont
      définitifs (US4 scénario 2) ; clés i18n dans les deux langues

**Checkpoint** : quickstart scénarios 1 à 4 passent en entier.

---

## Phase 8: Référentiel réel — ⛔ bloquée par l'ADR #20

**Ne pas démarrer** avant que l'ADR d'enrichissement bibliographique (#20) soit accepté. Aucune
autre phase n'en dépend.

- [ ] T059 `libs/bibliography/infrastructure/src/lib/<référentiel>-bibliographic-catalog.adapter.ts`
      (+ spec sur **réponses enregistrées**, fixtures dans `src/lib/testing/`) : `name` du
      référentiel, recherche par titre et auteur lu, 20 notices au plus, `workKey` dérivée comme
      l'ADR le décide, réponse hors contrat → `CatalogUnavailable('invalid_response')`, erreur
      réseau ou 5xx → `CatalogUnavailable('unavailable')`, `signal` transmis à `fetch`
- [ ] T060 Ajouter la valeur du référentiel à `BIBLIOGRAPHIC_CATALOG_PROVIDER`
      (`apps/api/src/config/environment.ts`, `bibliographic-catalog.factory.ts`, specs,
      `.env.example`)
- [ ] T061 Mode réconciliation du bench (`tools/bench/`, `README.md`) : sur le jeu de référence
      (#10), mesurer SC-001 (≥ 80 % des livres présents et bien lus confirmés) et SC-002 (< 2 % de
      confirmations sans livre correspondant) — manuel, hors CI
- [ ] T062 Caler `MatchingSettings` et `ReconciliationLimits` sur la décision de l'ADR et la mesure ;
      mettre à jour `research.md` §5 et §7 (« provisoire » → renvoi à l'ADR)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T063 [P] `CLAUDE.md` : arborescence (`libs/bibliography/{domain,application,infrastructure}`,
      `libs/shared/sql-migrations`, `apps/api/src/orchestration/`), `bibliography` désormais fondé en
      code (paragraphe « `recognition` est le seul bounded context fondé… ») ; nuancer « `libs/shared/*`
      est importable par tous » : une lib partagée n'importe aucun contexte, mais peut être
      `scope:api` quand elle ne sert qu'au back (`sql-migrations`, research §8) ; préciser que
      « les migrations restent dans `infrastructure` » vise les fichiers SQL et le schéma, pas le
      lanceur générique
- [ ] T064 [P] `README.md` des quatre nouvelles libs, au format de ceux de `libs/recognition/*`
      (rôle, API publique, frontières)
- [ ] T065 [P] Vérifier que la CI (`.github/workflows/ci.yml`) fait tourner les specs de
      `bibliography-infrastructure` et `shared-sql-migrations` contre son Postgres (même
      `DATABASE_URL` que `recognition-infrastructure`) ; ajuster sinon
- [ ] T066 Exécuter `quickstart.md` en entier dans Chromium à 360 px de large, contre l'API buildée
      (`yarn nx build api`) : scénarios 1 à 4 ; SC-003 est prouvé par la spec de T026, et se
      remesure sur le vrai référentiel après la Phase 8
- [ ] T067 `yarn check` vert ; vérifier que les garde-fous opèrent (import interdit
      `bibliography` → `recognition` qui fait échouer `yarn lint`, puis retiré)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance.
- **Foundational (Phase 2)** : après Setup ; bloque toutes les user stories.
- **US1 (Phase 3)** : après Foundational. MVP.
- **US2 (Phase 4)**, **US3 (Phase 5)** : après US1 — elles s'appuient sur la route de
  réconciliation et la liste réconciliée ; indépendantes entre elles.
- **US5 (Phase 6)** : après US1 **et US2** — T052 et T053 ont besoin de `saveDecision` (T044),
  T054 de la route de décision (T046).
- **US4 (Phase 7)** : après US1 ; T058 réutilise la liste de T040.
- **Référentiel réel (Phase 8)** : après l'ADR #20 **et** US1 ; ne bloque rien.
- **Polish (Phase 9)** : après les stories voulues ; T066 complet après la Phase 8.

### Within Each User Story

- Domaine → application → adapters → composition root → HTTP → écran.
- Chaque tâche commence par sa spec en échec.
- Dans US1 : T022, T023 avant T024 ; T024, T025 avant T026 ; T026, T027–T030 avant T031–T035 ;
  T036–T037 avant T041 ; T038–T039 avant T040.

### Parallel Opportunities

- Setup : T002, T003, T004 après T001 ; T006, T007 à tout moment.
- Foundational : T011, T012, T013 ensemble ; T019, T020, T021 ensemble une fois T016 fait.
- US1 : T022 ‖ T023 ; T027 ‖ T028 ; T038 ‖ T039 (et tout le front ‖ le back à partir de T036,
  le contrat étant fixé).
- US2 : T042 ‖ T043 ; T047 ‖ back.
- Après US1 : US2, US3 et US4 peuvent avancer en parallèle ; US5 après US2.

## Parallel Example: User Story 1

```bash
# Règle de correspondance — deux fichiers indépendants :
Task: "T022 title-forms.ts (+ spec) in libs/bibliography/domain/src/lib/"
Task: "T023 author-match.ts (+ spec) in libs/bibliography/domain/src/lib/"

# Adapters sans réseau :
Task: "T027 stub-bibliographic-catalog.adapter.ts in libs/bibliography/infrastructure/src/lib/"
Task: "T028 offline-bibliographic-catalog.adapter.ts in libs/bibliography/infrastructure/src/lib/"

# Front, une fois le contrat fixé :
Task: "T038 model/ in apps/web/src/features/reconciliation/"
Task: "T039 api/reconcile-shelf-photo.ts in apps/web/src/features/reconciliation/"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 puis Phase 2 — `yarn check` vert, tables créées.
2. Phase 3 (US1) — statuts affichés avec le référentiel stub, « non vérifié » avec `offline`.
3. **Valider** : quickstart scénarios 1 et 3 ; `yarn check`.
4. PR possible à ce stade : la réconciliation est utile même sans levée d'ambiguïté ni relance.

### Incremental Delivery

1. MVP (US1).
2. US2 — les ambigus deviennent exploitables.
3. US3, puis US5 (après US2) — surtout des specs : la persistance est posée dès la Phase 2.
4. US4 — relance depuis l'écran.
5. Après l'ADR #20 : Phase 8, puis mesure de SC-001/SC-002 et calage des réglages.

## Notes

- Le schéma de la Phase 2 porte déjà toutes les colonnes de US2 et US5 : une seule migration pour la
  feature, pas de migration intermédiaire.
- Committer après chaque tâche ou groupe logique, messages en anglais.
- Tout hors-scope découvert en route va dans `docs/parking.md`, dans le même commit.
