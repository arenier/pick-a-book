---

description: "Task list for the upload history feature"
---

# Tasks: Historique des photos envoyées

**Input** : documents de conception dans `/specs/002-upload-history/`

**Prerequisites** : plan.md, spec.md, research.md, data-model.md,
contracts/shelf-photos-history-api.md, quickstart.md

**Tests** : inclus et obligatoires. La constitution impose le TDD systématique (principe I). Chaque
tâche d'implémentation suit une tâche de test qui **doit échouer** avant elle. Les adapters se
testent contre le Postgres et l'émulateur de bucket du `docker-compose.yml`, que la CI démarre déjà
(tâche T072 de la spec 001).

**Révisé le 27/09/2026** (`/speckit-analyze`) : quinze constats intégrés, parmi lesquels :
- **C1** : T003 teste le schéma avant qu'il soit modifié (TDD) ;
- **U1** : toute erreur après la réservation referme la tentative (T010, T011) ;
- **U2, U3** : T021 précise le montage du test et l'en-tête `Retry-After` ;
- **I1, A1, A2** : la spec est précisée (analyse en cours, SC-002 à chaud, US2 scénario 1) ;
- **G1, G2** : la consultation ne modifie rien, et le 429 a un message distinct dans l'historique ;
- **T1** : le lien de navigation s'appelle « Historique » ;
- **T3** : T050 et T051 sont scindées.

Les tâches sont renumérotées en conséquence : il y en a 77, puis 78 après l'alignement sur l'ADR 0011 (nouvelle T028).

**Textes de l'interface** *(révisé le 28/09/2026, ADR 0011 accepté sur `main`)* : aucun texte
affiché n'est écrit dans le code (constitution 1.1.0, principe V, research.md §12).
- Chaque texte cité ci-dessous est une **clé** du catalogue de la slice qui l'affiche
  (`features/<slice>/i18n/{fr,en}.json`, le shell dans `app/i18n/`), en français **et** en anglais.
  La cible `translations` et le test de parité échouent sinon.
- Les textes cités dans les tests sont les **valeurs françaises attendues** : la configuration de
  test épingle la langue sur le français.
- `model/` et `api/` rendent des types d'échec, formulés par l'UI via une table explicite.
- L'[ADR 0012](../../docs/adr/0012-design-system-de-l-interface.md) (design system) reste
  **proposé** : CSS Modules tant qu'il ne l'est pas.

**Organisation** :
- Un socle commun (Phases 1 et 2) : la migration, les garde-fous contre l'abus et la facturation
  (FR-014, FR-015) et le routage du front. Les garde-fous sont au socle parce que la spec les pose
  comme **condition** de l'accès ouvert (FR-012) : aucune route de lecture ne s'ouvre sans eux.
- Puis une phase par user story, dans l'ordre de priorité de la spec.

## Format : `[ID] [P?] [Story] Description`

- **[P]** : peut s'exécuter en parallèle (fichiers différents, aucune dépendance sur une tâche non
  terminée).
- **[Story]** : US1 (parcourir ses envois), US2 (revoir le détail d'un envoi), US3 (relancer
  l'analyse).

---

## Phase 1 : Setup

- [ ] T001 Ajouter `@nestjs/throttler` (version 6.x, compatible Nest 11) aux `dependencies` de `apps/api/package.json`, puis `yarn install` (research.md §9).
- [ ] T002 [P] Documenter `DAILY_SCAN_LIMIT` dans `.env.example`, section `# --- Recognition (ADR 0005) ---` : optionnel, défaut `50`, entier ≥ 1. C'est le nombre d'analyses (envois et relances confondus) autorisées par jour, heure de Paris. Au-delà, une analyse est refusée et la photo reste conservée (spec FR-015).

---

## Phase 2 : Foundational (bloquant, commun à toutes les user stories)

**But** : le schéma migré, le plafond quotidien d'analyses, la limite de requêtes par source, et le
routage du front. L'écran d'envoi existant (spec 001) passe déjà par les garde-fous à la fin de
cette phase.

**⚠️ CRITIQUE** : aucune story ne démarre avant la fin de cette phase.

### Schéma et migration

- [ ] T003 Écrire les tests (doivent échouer), contre Postgres, dans `libs/recognition/infrastructure/src/lib/migrate-database.spec.ts`, sur une base migrée par `migrateDatabase` (analyse, C1) :
  - une ligne `uploads` avec `original_filename` null **et** `source_upload_id` null est rejetée par la contrainte ;
  - une ligne avec les deux renseignés est rejetée aussi ;
  - une ligne de vignette (`original_filename` null, `source_upload_id` vers une photo existante) est acceptée ;
  - une seconde vignette pour la même photo est rejetée (`source_upload_id` unique) ;
  - la table `scan_attempts` existe, avec `upload_id` en clé étrangère vers `uploads` et `finished_at` nullable ;
  - l'index `uploads_owner_type_created_idx` existe (lu dans `pg_indexes`).

  Ces règles sont tenues par la base, pas seulement par l'adapter, comme la contrainte `detected_books` ⇔ `completed` de la spec 001 : elles ont leur propre test.
- [ ] T004 Modifier `libs/recognition/infrastructure/src/lib/drizzle/schema.ts` (data-model.md, *infrastructure*) :
  - `uploads.originalFilename` devient nullable ;
  - ajouter `sourceUploadId: uuid('source_upload_id')`, nullable, `.unique()`, `.references(() => uploads.id)` ;
  - ajouter `check('uploads_source_or_filename_check', sql\`(${table.sourceUploadId} is null) = (${table.originalFilename} is not null)\`)` ;
  - ajouter l'index `uploads_owner_type_created_idx` sur `(owner_id, type, created_at desc, id desc)` ;
  - ajouter la table `scan_attempts` : `id uuid pk defaultRandom`, `upload_id uuid not null references uploads(id)`, `started_at timestamptz not null defaultNow`, `finished_at timestamptz null`, un index sur `started_at` et un index partiel sur `upload_id where finished_at is null`.

  Adapter `toRecord` dans `drizzle-shelf-scan-repository.adapter.ts` : la colonne devenue nullable impose au typage de traiter `null`. Une ligne `shelf_photo` sans nom lève une erreur explicite. La contrainte de T003 rend ce cas impossible en base, mais la vérification prouve le type au lieu de l'affirmer. Dépend de T003.
- [ ] T005 Générer la migration avec `yarn db:generate`, la renommer `0001_upload_history.sql` dans `libs/recognition/infrastructure/src/lib/drizzle/migrations/` et vérifier qu'elle ne réécrit aucune ligne existante. Fait passer T003. Les specs existantes de l'adapter Drizzle doivent toujours passer sur le schéma migré. Dépend de T004.

### Plafond quotidien et tentatives d'analyse (FR-015, research.md §8)

- [ ] T006 [P] Écrire les tests (doivent échouer) de deux erreurs de domaine : `ShelfScanInProgress(id)` et `DailyScanQuotaExceeded(limit)`, avec leurs `name` et leurs messages, dans `libs/recognition/domain/src/lib/shelf-scan-in-progress.error.spec.ts` et `libs/recognition/domain/src/lib/daily-scan-quota-exceeded.error.spec.ts`.
- [ ] T007 Créer `libs/recognition/domain/src/lib/shelf-scan-in-progress.error.ts` et `libs/recognition/domain/src/lib/daily-scan-quota-exceeded.error.ts`, puis les exporter depuis `libs/recognition/domain/src/index.ts`. Dépend de T006.
- [ ] T008 Étendre `libs/recognition/domain/src/lib/shelf-scan-repository.port.spec.ts` (test d'abord) puis `shelf-scan-repository.port.ts` :
  - ajouter `startAttempt(id: ShelfScanId, policy: ScanAttemptPolicy): Promise<void>` ;
  - ajouter `ScanAttemptPolicy { readonly dailyLimit: number; readonly timeZone: 'Europe/Paris'; readonly lease: number }`, avec `lease` en millisecondes ;
  - documenter l'ordre de vérification : `ShelfScanNotFound`, puis `ShelfScanAlreadyProcessed`, puis `ShelfScanInProgress`, puis `DailyScanQuotaExceeded`.

  Dans cette phase, l'envoi doit encore être `pending` : US3 élargit à `failed` (T068). Dépend de T007.
- [ ] T009 Étendre les doubles en mémoire avec `startAttempt` (plafond compté sur un tableau de tentatives, bail, fermeture de la tentative par `markCompleted` et `markFailed`) et une horloge injectable, dans `libs/recognition/application/src/lib/testing/in-memory-shelf-scan-repository.ts` et `apps/api/src/recognition/testing/shelf-photos-controller.fixture.ts`. Dépend de T008.
- [ ] T010 Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.spec.ts` :
  - `startAttempt` est appelé avant `storage.retrieve` et avant `scanner.scan` ;
  - `DailyScanQuotaExceeded` et `ShelfScanInProgress` remontent sans appeler le scanner ;
  - un envoi refusé pour quota reste `pending` ;
  - la politique passée vaut `{ dailyLimit: <config>, timeZone: 'Europe/Paris', lease: 300_000 }` ;
  - **toute erreur après `startAttempt` referme la tentative** : si `storage.retrieve` échoue (photo absente du bucket), l'envoi passe `failed`, la tentative est fermée (le plafond ne la compte plus comme ouverte, une relance immédiate n'est pas refusée en `ShelfScanInProgress`), et l'erreur remonte telle quelle (research.md §8, analyse U1).

  Dépend de T009.
- [ ] T011 Modifier `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.ts` : il reçoit `ScanAttemptPolicy` à la construction, appelle `repository.startAttempt(id, policy)` avant de lire la photo, et ne teste plus lui-même `status !== 'pending'` (c'est `startAttempt` qui décide). Le `try` qui appelle `recordFailure` couvre désormais la lecture de la photo **et** l'appel au scanner. Fait passer T010. Dépend de T010.
- [ ] T012 Écrire les tests (doivent échouer), contre Postgres, dans `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.spec.ts` :
  - `startAttempt` insère une ligne `scan_attempts` ;
  - un envoi inconnu donne `ShelfScanNotFound`, un envoi `completed` donne `ShelfScanAlreadyProcessed` ;
  - une tentative ouverte depuis moins de 5 min donne `ShelfScanInProgress`, une tentative ouverte depuis plus de 5 min ne bloque pas ;
  - au plafond, `DailyScanQuotaExceeded`, et les tentatives d'hier (heure de Paris) ne comptent pas, y compris à 23h30 UTC la veille ;
  - **deux `startAttempt` concurrents** avec `dailyLimit` = 1 : un seul réussit ;
  - `markCompleted` et `markFailed` remplissent `finished_at`.

  Dépend de T005 et T008.
- [ ] T013 Implémenter `startAttempt` dans `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.ts` :
  - une transaction qui commence par `select pg_advisory_xact_lock(<constante>)` ;
  - les vérifications, dans l'ordre du port ;
  - le plafond compté avec `started_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'` ;
  - l'insertion.

  `settle` referme la tentative ouverte dans la même transaction que la mise à jour de `shelf_scans`. Fait passer T012. Dépend de T012.
- [ ] T014 [P] Écrire les tests (doivent échouer) dans `apps/api/src/config/environment.spec.ts` : `DAILY_SCAN_LIMIT` absent donne `50` ; `"12"` donne `12` ; `"0"`, `"-3"`, `"1.5"` et `"abc"` font échouer le démarrage et apparaissent dans la liste des problèmes.
- [ ] T015 Ajouter `dailyScanLimit: number` à `Environment` et sa lecture à `loadEnvironment` dans `apps/api/src/config/environment.ts`. Fait passer T014. Dépend de T014.
- [ ] T016 Câbler la politique dans `apps/api/src/recognition/recognition.module.ts` : `ScanStoredShelfPhotoUseCase` reçoit `{ dailyLimit: environment.dailyScanLimit, timeZone: 'Europe/Paris', lease: 5 * 60 * 1000 }`. Dépend de T011 et T015.

### `DAILY_SCAN_LIMIT` en production (Terraform)

La valeur par défaut `50` est tenue à deux endroits, `apps/api/src/config/environment.ts` et la
variable Terraform, avec la même validation. Les deux se maintiennent à la main, comme les
épinglages de Node (CLAUDE.md, *Outillage*). Le passer explicitement en Terraform rend le plafond
visible et modifiable là où la prod se configure, sans redéploiement de code.

- [ ] T017 [P] Écrire les tests (doivent échouer) dans `infra/envs/prod/tests/prod.tftest.hcl`, en `command = plan` avec les `mock_provider` existants :
  - `run "the_api_receives_the_default_daily_scan_limit"` : sans variable, `local.api_env["DAILY_SCAN_LIMIT"] == "50"` ;
  - `run "the_daily_scan_limit_is_configurable"` : avec `variables { daily_scan_limit = 12 }`, la valeur vaut `"12"` ;
  - `run "the_daily_scan_limit_rejects_zero"` et `run "the_daily_scan_limit_rejects_a_fraction"` : avec `0` puis `1.5`, `expect_failures = [var.daily_scan_limit]` ;
  - `run "the_api_env_keeps_node_env_production"` : `local.api_env["NODE_ENV"] == "production"`, pour ne rien perdre en extrayant la map.

  Chaque `error_message` explique la conséquence, comme les runs existants. Si `terraform test` refuse de référencer un `local` du module racine, exposer la map par un output non sensible `api_plain_env` et asserter sur `output.api_plain_env`.
- [ ] T018 Implémenter dans `infra/envs/prod/` :
  - dans `variables.tf`, `variable "daily_scan_limit"` : `type = number`, `default = 50`, et une `validation` qui vérifie `var.daily_scan_limit >= 1 && floor(var.daily_scan_limit) == var.daily_scan_limit`. La description cite spec 002 FR-015 et la double tenue avec `environment.ts` ;
  - dans `main.tf`, `locals { api_env = { NODE_ENV = "production", DAILY_SCAN_LIMIT = tostring(var.daily_scan_limit) } }`, et `env = local.api_env` sur `module.cloud_run_api`. Ce n'est pas un secret : pas de `secret_env`.

  Ne pas toucher `prod.auto.tfvars` : la valeur par défaut suffit, et y ajouter `daily_scan_limit = …` est le moyen documenté de la changer. Mettre à jour `infra/README.md` si une section liste les variables de l'environnement. Faire passer T017, puis `terraform fmt -check`, `tflint` et `terraform test` dans `infra/envs/prod`, que la CI exécute aussi. Dépend de T017.

### Codes d'erreur stables et traduction HTTP (research.md §10)

- [ ] T019 Écrire les tests (doivent échouer) dans `apps/api/src/recognition/shelf-photos.http.spec.ts` :
  - `POST /shelf-photos/{id}/scan` au plafond donne **429** avec `code: "DAILY_SCAN_QUOTA_EXCEEDED"` ;
  - une analyse en cours donne **409** avec `code: "SCAN_IN_PROGRESS"` ;
  - un envoi `completed` donne **409** avec `code: "SCAN_ALREADY_COMPLETED"` ;
  - les corps gardent `statusCode`, `message` et `error`.

  Dépend de T009 et T016.
- [ ] T020 Étendre `apps/api/src/recognition/recognition-exception.filter.ts` : `@Catch` couvre `ShelfScanInProgress` et `DailyScanQuotaExceeded`, et le corps de réponse ajoute un champ `code` pour ces deux erreurs et pour `ShelfScanAlreadyProcessed`. Fait passer T019. Dépend de T019.

### Limite de requêtes par source (FR-014, research.md §9)

- [ ] T021 Écrire les tests (doivent échouer) dans `apps/api/src/http/throttling.http.spec.ts`. Le test monte le vrai `AppModule` avec `Test.createTestingModule({ imports: [AppModule.withEnvironment(testEnvironment)] })`, puis `.overrideProvider('ShelfScanArchive')` avec un objet `{ storage, repository, close }` construit sur les doubles de `apps/api/src/recognition/testing/shelf-photos-controller.fixture.ts` (à exporter si besoin). Ainsi ni Postgres ni le bucket ne sont touchés, et la migration n'est pas lancée. Cas à couvrir :
  - la 11ᵉ requête `POST` sur `/shelf-photos/{id}/scan` en moins d'une minute, depuis la même source, donne **429** avec `code: "TOO_MANY_REQUESTS"` et un en-tête `Retry-After` ;
  - une autre source n'est pas limitée ;
  - `GET /health` répond 200 même au-delà de 300 requêtes par minute ;
  - un `X-Forwarded-For` forgé à gauche ne change pas la source comptée (`trust proxy` = 1) : `9.9.9.9, 2.2.2.2` et `1.1.1.1, 2.2.2.2` tombent dans le même compteur ;
  - l'en-tête s'appelle bien `Retry-After`, sans suffixe, **pour les deux paliers**. `@nestjs/throttler` suffixe ses en-têtes par le nom des paliers nommés (`Retry-After-write`) : c'est le filtre qui pose l'en-tête du contrat (analyse U3).

  Dépend de T001.
- [ ] T022 Créer `apps/api/src/http/too-many-requests.filter.ts` : il attrape `ThrottlerException` et répond 429 `{ statusCode: 429, message, error: 'Too Many Requests', code: 'TOO_MANY_REQUESTS' }` via `HttpAdapterHost`, sur le modèle de `RecognitionExceptionFilter`. Il pose aussi `Retry-After` (secondes), recopié depuis l'en-tête `Retry-After-<palier>` que le throttler a déjà posé sur la réponse, à défaut 60. Dépend de T021.
- [ ] T023 Configurer la limite :
  - dans `apps/api/src/app/app.module.ts`, `ThrottlerModule.forRoot` avec deux paliers, `default` à 300 requêtes par 60 000 ms et `write` à 10 requêtes par 60 000 ms ;
  - `ThrottlerGuard` en `APP_GUARD` et le filtre de T022 en `APP_FILTER` ;
  - `@SkipThrottle()` sur `apps/api/src/health/health.controller.ts` ;
  - le palier `write` sur les deux `POST` de `apps/api/src/recognition/shelf-photos.controller.ts`, et `@SkipThrottle({ write: true })` sur les futures routes de lecture ;
  - `app.set('trust proxy', 1)` dans `apps/api/src/main.ts`, avec un commentaire qui renvoie à research.md §9. `set` n'existe que sur une application typée Express : passer à `NestFactory.create<NestExpressApplication>(…)` (import depuis `@nestjs/platform-express`, déjà une dépendance).

  Fait passer T021. Dépend de T022.

### Écran d'envoi : distinguer les deux 429 (spec FR-014, FR-015)

- [ ] T024 [P] Écrire les tests (doivent échouer) :
  - dans `apps/web/src/features/photo-upload/api/scan-shelf-photo.spec.ts` : un scan 429 avec `code: "DAILY_SCAN_QUOTA_EXCEEDED"` rend l'échec `dailyQuota` ; un 429 avec `code: "TOO_MANY_REQUESTS"`, sur l'envoi ou sur le scan, rend `rateLimited` ; un 429 sans code ou avec un code inconnu rend `unexpected` ;
  - dans `apps/web/src/features/photo-upload/ui/failure-message.spec.tsx` : `dailyQuota` affiche « Limite d'analyses du jour atteinte. Votre photo est conservée : vous pourrez relancer l'analyse demain depuis l'historique. », et `rateLimited` affiche « Trop de demandes en peu de temps. Patientez une minute puis réessayez. ».
- [ ] T025 Ajouter `dailyQuota` et `rateLimited` à `UPLOAD_FAILURES` dans `apps/web/src/features/photo-upload/model/upload-failure.ts`. Les rendre depuis `apps/web/src/features/photo-upload/api/scan-shelf-photo.ts`, avec un garde de type `hasErrorCode(body): body is { code: string }`, sans `as`. Ajouter les deux formulations à la table de `apps/web/src/features/photo-upload/ui/failure-message.tsx` et les clés `failure.dailyQuota` et `failure.rateLimited` à `apps/web/src/features/photo-upload/i18n/fr.json` et `en.json`. Fait passer T024. Dépend de T024.

### Routage du front (research.md §2, §3)

- [ ] T026 [P] Écrire les tests (doivent échouer) dans `apps/web/src/app/use-hash-route.spec.ts` et `apps/web/src/app/routes.spec.ts` :
  - `''`, `#` et `#/` donnent `{ name: 'upload' }` ;
  - `#/historique` donne `{ name: 'history' }` ;
  - `#/historique/<uuid>` donne `{ name: 'entry', id }` ;
  - tout autre fragment donne `{ name: 'upload' }` ;
  - le hook suit `hashchange` et se désabonne au démontage ;
  - `hrefFor(route)` produit le fragment inverse.
- [ ] T027 Créer `apps/web/src/app/routes.ts` (union `Route`, `parseRoute`, `hrefFor`) et `apps/web/src/app/use-hash-route.ts`, un hook fondé sur `useSyncExternalStore` et `hashchange`. Fait passer T026. Dépend de T026.
- [ ] T028 Créer le namespace de la slice : `apps/web/src/features/upload-history/i18n/fr.json` et `en.json`, déclarés dans `apps/web/src/i18n/resources.ts` sous la clé `'upload-history'`. Ajouter au catalogue du shell (`apps/web/src/app/i18n/fr.json` et `en.json`) les clés `nav.history` (« Historique » / « History ») et `nav.newPhoto` (« Nouvelle photo » / « New photo »). Le test de parité existant (`apps/web/src/i18n/catalogs.spec.ts`) et la cible `translations` servent de test : ils doivent passer. Les clés de la slice arrivent avec les tâches d'UI qui les affichent.
- [ ] T029 Écrire le test (doit échouer) dans `apps/web/src/app/app.spec.tsx` : sur `#/`, l'écran d'envoi est affiché avec un lien « Historique » vers `#/historique` (FR-001). Puis modifier `apps/web/src/app/app.tsx` pour monter l'écran selon la route, en gardant l'écran d'envoi inchangé sur `upload`. Les écrans d'historique et de détail sont des emplacements vides jusqu'à US1 et US2. Dépend de T027 et T028.

**Checkpoint** : `yarn check` passe. L'écran d'envoi existant fonctionne, plafonné et limité, et
affiche les nouveaux messages de 429. Le routage est en place.

---

## Phase 3 : User Story 1, parcourir ses envois passés (Priority: P1) 🎯 MVP

**But** : la liste antéchronologique des envois, avec date, vignette et issue de l'analyse, et
accessible jusqu'au tout premier envoi.

**Independent Test** : envoyer quelques photos aux issues différentes (livres, aucun livre, échec,
analyse jamais lancée), ouvrir `#/historique` et constater qu'elles y sont toutes, dans l'ordre, avec
le bon résumé (quickstart, scénarios 1 et 2).

### Domaine : vignette et lecture paginée

- [ ] T030 [P] [US1] Écrire les tests (doivent échouer) dans `libs/recognition/domain/src/lib/shelf-photo-thumbnail.spec.ts` :
  - `ShelfPhotoThumbnail.of(bytes, mediaType)` accepte `'image/jpeg' | 'image/png' | 'image/webp'` jusqu'à **262 144 octets** (256 Ko) inclus ;
  - il rejette un contenu vide, 262 145 octets, `image/heic` et tout autre type, avec `InvalidShelfPhotoThumbnail`.
- [ ] T031 [US1] Créer `libs/recognition/domain/src/lib/shelf-photo-thumbnail.ts` (avec le type `ThumbnailMediaType`) et `libs/recognition/domain/src/lib/invalid-shelf-photo-thumbnail.error.ts`, puis les exporter. Fait passer T030. Dépend de T030.
- [ ] T032 [US1] Étendre `libs/recognition/domain/src/lib/shelf-scan-repository.port.spec.ts` (test d'abord) puis `shelf-scan-repository.port.ts` :
  - `StoredThumbnail { bucketKey: string; mediaType: ThumbnailMediaType; sizeBytes: number }` ;
  - `ShelfScanRecord.thumbnail: StoredThumbnail | undefined` et `NewShelfScan.thumbnail?: StoredThumbnail` ;
  - `ShelfScanCursor { createdAt: Date; id: ShelfScanId }` et `ShelfScanPageQuery { ownerId: OwnerId; limit: number; after: ShelfScanCursor | undefined }` ;
  - `ShelfScanPage { records: readonly ShelfScanRecord[]; next: ShelfScanCursor | undefined }` ;
  - `list(query): Promise<ShelfScanPage>`, trié `created_at desc, id desc`.

  Dépend de T031.
- [ ] T033 [US1] Étendre `libs/recognition/domain/src/lib/shelf-photo-storage.port.spec.ts` (test d'abord) puis `shelf-photo-storage.port.ts` : `storeThumbnail(thumbnail: ShelfPhotoThumbnail, key: string): Promise<void>` et `retrieveThumbnail(key: string, mediaType: ThumbnailMediaType): Promise<ShelfPhotoThumbnail>`. Ajouter l'erreur `ShelfPhotoThumbnailNotFound(id)` dans `libs/recognition/domain/src/lib/shelf-photo-thumbnail-not-found.error.ts`. Dépend de T031.
- [ ] T034 [US1] Étendre les doubles en mémoire pour `list`, en respectant l'ordre et le curseur, pour `thumbnail`, `storeThumbnail` et `retrieveThumbnail`, dans `libs/recognition/application/src/lib/testing/in-memory-shelf-scan-repository.ts`, `libs/recognition/application/src/lib/testing/in-memory-shelf-photo-storage.ts` et `apps/api/src/recognition/testing/shelf-photos-controller.fixture.ts`. Dépend de T032 et T033.

### Application : envoi avec vignette, liste, lecture de la vignette

- [ ] T035 [P] [US1] Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/store-shelf-photo.use-case.spec.ts` :
  - avec une vignette valide, elle est stockée sous `{ownerId}/shelf_photo_thumbnail/{id}` après la photo, et `createPending` reçoit `thumbnail: { bucketKey, mediaType, sizeBytes }` ;
  - avec une vignette invalide (HEIC, 300 Ko, vide), l'envoi réussit **sans** vignette, et un avertissement est journalisé (logger injecté) ;
  - sans vignette, le comportement de la spec 001 est inchangé ;
  - une photo invalide ne stocke ni photo ni vignette (spec 001, FR-013).

  Dépend de T034.
- [ ] T036 [US1] Étendre `StoreShelfPhotoCommand` avec `thumbnail?: { bytes: Uint8Array; mediaType: string }` dans `libs/recognition/application/src/lib/shelf-photo.dto.ts`, et `libs/recognition/application/src/lib/store-shelf-photo.use-case.ts` en conséquence. Fait passer T035. Dépend de T035.
- [ ] T037 [P] [US1] Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/shelf-scan-cursor.spec.ts` : aller-retour `encodeCursor` / `decodeCursor` en base64url de `createdAt ISO|uuid`. `decodeCursor` lève `InvalidShelfScanCursor` sur une chaîne non base64url, un séparateur absent, une date invalide ou un id qui n'est pas un UUID.
- [ ] T038 [US1] Créer `libs/recognition/application/src/lib/shelf-scan-cursor.ts` et `libs/recognition/application/src/lib/invalid-shelf-scan-cursor.error.ts`. Fait passer T037. Dépend de T037.
- [ ] T039 [US1] Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/list-shelf-scans.use-case.spec.ts` :
  - `limit` absent donne 20 ; `limit` hors de 1..50 ou non entier donne `InvalidShelfScanPageSize` ;
  - `list` reçoit l'`ownerId` configuré ;
  - chaque `ShelfScanSummaryDto` vaut `{ id, createdAt (ISO), outcome, bookCount?, hasThumbnail }`, avec `bookCount` présent si et seulement si `outcome === 'completed'` (0 pour une liste vide) ;
  - `nextCursor` vaut `null` sur la dernière page ;
  - aucun DTO ne contient `originalFilename`, `photoBucketKey` ou `ownerId` (FR-009) ;
  - trois pages successives couvrent 45 envois sans doublon ni trou.

  Dépend de T034 et T038.
- [ ] T040 [US1] Créer `libs/recognition/application/src/lib/shelf-scan-history.dto.ts` avec `ShelfScanOutcomeDto`, `ShelfScanSummaryDto`, `ShelfScanPageDto`, `ShelfScanDetailDto` et `StoredImageDto`, en reprenant les formes de data-model.md mot pour mot. Créer aussi `libs/recognition/application/src/lib/list-shelf-scans.use-case.ts` et `InvalidShelfScanPageSize`, puis exporter le tout depuis `libs/recognition/application/src/index.ts`. Fait passer T039. Dépend de T039.
- [ ] T041 [US1] Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/get-shelf-photo-image.use-case.spec.ts`, pour le type `'thumbnail'` :
  - rend `{ bytes, mediaType }` ;
  - un envoi sans vignette donne `ShelfPhotoThumbnailNotFound` ;
  - un id inconnu, malformé ou d'un autre propriétaire donne `ShelfScanNotFound`.

  Dépend de T034.
- [ ] T042 [US1] Créer `libs/recognition/application/src/lib/get-shelf-photo-image.use-case.ts`, avec `execute({ id, kind: 'thumbnail' })` pour l'instant ; US2 ajoute `'photo'` (T060). Fait passer T041. Dépend de T041.

### Infrastructure : vignette dans le bucket et en base, page par curseur

- [ ] T043 [P] [US1] Écrire les tests (doivent échouer), contre l'émulateur, dans `libs/recognition/infrastructure/src/lib/gcs-shelf-photo-storage.adapter.spec.ts` : `storeThumbnail` puis `retrieveThumbnail` rendent les mêmes octets, un second `storeThumbnail` sur la même clé échoue (`ifGenerationMatch: 0`), et une clé absente donne `ShelfPhotoStorageFailed`.
- [ ] T044 [US1] Implémenter `storeThumbnail` et `retrieveThumbnail` dans `libs/recognition/infrastructure/src/lib/gcs-shelf-photo-storage.adapter.ts`. Fait passer T043. Dépend de T043.
- [ ] T045 [US1] Écrire les tests (doivent échouer), contre Postgres, dans `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.spec.ts` :
  - `createPending` avec vignette écrit **deux** lignes `uploads` dans la même transaction. La vignette a `type = 'shelf_photo_thumbnail'`, `original_filename` null et `source_upload_id` égal à l'id de la photo ;
  - `get` rend `thumbnail` (et `undefined` sans vignette) ;
  - `list` ne rend que `type = 'shelf_photo'` du bon `owner_id`, triés `created_at desc, id desc` ;
  - deux envois au même `created_at` sont départagés par `id` ;
  - `next` est absent sur la dernière page ;
  - un envoi inséré entre deux pages n'en décale aucune.

  Dépend de T005 et T032.
- [ ] T046 [US1] Implémenter dans `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.ts` :
  - l'écriture de la ligne vignette dans `createPending` ;
  - la lecture de la vignette par une auto-jointure `left join` d'`uploads` sur `source_upload_id`, dans `get` et `list` ;
  - la pagination de `list` par comparaison du couple `(created_at, id)`, en lisant `limit + 1` lignes pour savoir s'il reste une page.

  Fait passer T045. Dépend de T045.

### API : `GET /shelf-photos`, `GET …/thumbnail`, champ multipart `thumbnail`

- [ ] T047 [US1] Écrire les tests (doivent échouer) dans `apps/api/src/recognition/shelf-photos.http.spec.ts` :
  - `GET /shelf-photos` renvoie 200 et `{ items, nextCursor }` (contrat §1) ;
  - `?limit=51`, `?limit=abc` et `?cursor=abc` renvoient **400** ;
  - `GET /shelf-photos/{id}/thumbnail` renvoie 200 avec le bon `Content-Type` et `Cache-Control: private, max-age=31536000, immutable` ;
  - un envoi sans vignette renvoie 404 ;
  - `POST /shelf-photos` avec les champs `photo` et `thumbnail` renvoie 201, et la vignette est ensuite servie ;
  - avec une vignette de 300 Ko, l'envoi renvoie quand même 201, sans vignette ;
  - aucun corps ne contient `originalFilename` ni `bucket` (FR-009) ;
  - après `GET /shelf-photos` et `GET …/thumbnail`, l'état des doubles (enregistrements, tentatives, objets stockés) est identique à celui d'avant : la consultation ne modifie rien (FR-013, analyse G1).

  Dépend de T034, T036, T040 et T042.
- [ ] T048 [US1] Modifier `apps/api/src/recognition/shelf-photos.controller.ts` :
  - `FileFieldsInterceptor([{ name: 'photo', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }])`, la limite de 20 Mo restant celle de `photo` ;
  - la route `@Get()`, qui lit `limit` et `cursor` depuis la query string ;
  - la route `@Get(':id/thumbnail')`, qui répond via `@Res({ passthrough: true })` avec `Content-Type` et `Cache-Control` ;
  - `@SkipThrottle({ write: true })` sur les deux routes de lecture.

  Étendre `apps/api/src/recognition/recognition-exception.filter.ts` : `InvalidShelfScanCursor` et `InvalidShelfScanPageSize` donnent 400, `ShelfPhotoThumbnailNotFound` donne 404. Enregistrer `ListShelfScansUseCase` et `GetShelfPhotoImageUseCase` (avec `environment.ownerId`) dans `apps/api/src/recognition/recognition.module.ts`. Fait passer T047. Dépend de T047.

### Front : vignette à l'envoi

- [ ] T049 [P] [US1] Écrire les tests (doivent échouer) dans `apps/web/src/features/photo-upload/model/make-thumbnail.spec.ts`, avec `createImageBitmap` et le canvas injectés :
  - la largeur cible vaut 480 px, ratio conservé, sans agrandir une image plus petite ;
  - l'export est en `image/jpeg`, qualité 0,7 ;
  - `imageOrientation: 'from-image'` est demandé ;
  - un échec de décodage rend `undefined` (pas d'exception) ;
  - un résultat de plus de 262 144 octets rend `undefined`.
- [ ] T050 [US1] Créer `apps/web/src/features/photo-upload/model/make-thumbnail.ts`. Fait passer T049. Dépend de T049.
- [ ] T051 [US1] Écrire les tests (doivent échouer) dans `apps/web/src/features/photo-upload/api/scan-shelf-photo.spec.ts` : le `FormData` porte `thumbnail` quand la vignette existe, et ne le porte pas sinon ; l'envoi part dans les deux cas. Puis modifier `apps/web/src/features/photo-upload/api/scan-shelf-photo.ts` pour recevoir un `makeThumbnail` injectable (par défaut celui du module) et joindre la vignette. Dépend de T050.

### Front : slice `upload-history`, liste

- [ ] T052 [P] [US1] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/model/history-entry.spec.ts`, pour les gardes de type sur `unknown` (sans `as`) et la conversion du résumé en `HistoryEntry` :
  - `completed` avec `bookCount > 0` donne `{ kind: 'books', count }` ;
  - `completed` avec 0 donne `{ kind: 'none' }` ;
  - `failed` donne `{ kind: 'failed' }` ;
  - `pending` donne `{ kind: 'notStarted' }` ;
  - un corps mal formé est rejeté.

  Créer ensuite `apps/web/src/features/upload-history/model/history-entry.ts` et `apps/web/src/features/upload-history/model/history-state.ts`, avec l'union `loading | empty | loaded { entries, next, loadingMore, moreFailure? } | error { failure }` et le type `HistoryFailure` de data-model.md.
- [ ] T053 [US1] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/api/history-api.spec.ts`, avec `fetch` injecté :
  - `listShelfScans({ cursor? })` appelle `GET {base}/shelf-photos?limit=20[&cursor=…]` ;
  - un échec réseau, un 5xx et un corps invalide donnent chacun un échec typé ;
  - un 429 avec `TOO_MANY_REQUESTS` donne son propre échec ;
  - `thumbnailUrl(id)` encode l'id.

  Créer ensuite `apps/web/src/features/upload-history/api/history-api.ts`, qui lit `VITE_API_BASE_URL` comme `scan-shelf-photo.ts`. Dépend de T052.
- [ ] T054 [US1] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/ui/history-entry-card.spec.tsx` :
  - la date et l'heure locales s'affichent ;
  - les libellés sont « 12 livres détectés », « 1 livre détecté », « Aucun livre détecté », « Analyse en échec » et « Analyse non lancée » (FR-005). Le nombre de livres est **une clé plurielle** (`outcome.books`, avec `count`), pas deux clés, pour que le test de parité vérifie les formes CLDR de chaque langue ;
  - la vignette est un `<img loading="lazy">` vers `thumbnailUrl(id)` si `hasThumbnail`, et un indicateur neutre sans requête sinon ;
  - `onError` de l'image affiche l'indicateur neutre (FR-008) ;
  - la carte est un lien vers `#/historique/{id}`.

  Créer ensuite `apps/web/src/features/upload-history/ui/history-entry-card.tsx`. Dépend de T052 et T053.
- [ ] T055 [US1] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/ui/history-screen.spec.tsx` :
  - un chargement s'affiche d'abord ;
  - un historique vide affiche « Vous n'avez encore envoyé aucune photo. » avec un lien vers `#/` (US1, scénario 2) ;
  - un échec affiche un message d'erreur, **pas** l'état vide (FR-010), avec un bouton « Réessayer » ;
  - les entrées s'affichent dans l'ordre reçu ;
  - le bouton « Afficher plus » charge la page suivante et l'ajoute à la fin ;
  - l'arrivée en fin de liste (`IntersectionObserver` injecté) déclenche le même chargement ;
  - plus de bouton après la dernière page ;
  - un échec de page suivante garde les entrées et affiche un « Réessayer » local ;
  - un 429 `TOO_MANY_REQUESTS`, sur la première page comme sur une suivante, affiche « Trop de demandes en peu de temps. Patientez une minute puis réessayez. », distinct du message de panne (FR-014, analyse G2).

  Créer ensuite `apps/web/src/features/upload-history/ui/history-screen.tsx` et `apps/web/src/features/upload-history/ui/upload-history.module.css`. Dépend de T054.
- [ ] T056 [US1] Brancher la route `history` sur `HistoryScreen` dans `apps/web/src/app/app.tsx`, avec un lien « Nouvelle photo » vers `#/`. Compléter `apps/web/src/app/app.spec.tsx` (test d'abord) : `#/historique` affiche l'historique, et le lien ramène à l'écran d'envoi. Dépend de T029 et T055.

**Checkpoint** : US1 est livrable seule (quickstart, scénarios 1, 2 et 6). La liste, les vignettes
et la pagination fonctionnent, et le détail n'est encore qu'un emplacement vide.

---

## Phase 4 : User Story 2, revoir le détail d'un envoi (Priority: P1)

**But** : ouvrir un envoi et voir la photo en grand, avec les livres détectés tels qu'ils avaient
été obtenus, puis revenir à la liste là où on l'avait quittée.

**Independent Test** : ouvrir directement `#/historique/{id}` pour un envoi connu et constater que la
photo et ses livres s'affichent. Ouvrir un id inconnu et constater le message « introuvable »
(quickstart, scénario 3).

- [ ] T057 [P] [US2] Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/get-shelf-scan.use-case.spec.ts` :
  - `ShelfScanDetailDto` vaut `{ id, createdAt, outcome, books?, hasThumbnail }`, avec `books` présent si et seulement si `completed`, dans l'ordre stocké et `author` absent quand inconnu ;
  - un id inconnu, malformé ou d'un autre `ownerId` donne `ShelfScanNotFound` ;
  - pas de `originalFilename` (FR-009).
- [ ] T058 [US2] Créer `libs/recognition/application/src/lib/get-shelf-scan.use-case.ts` et l'exporter. Fait passer T057. Dépend de T057.
- [ ] T059 [P] [US2] Écrire les tests (doivent échouer) dans `libs/recognition/application/src/lib/get-shelf-photo-image.use-case.spec.ts`, pour le type `'photo'` : rend les octets et le `mediaType` conservé. Une erreur de stockage (`ShelfPhotoStorageFailed`) remonte telle quelle.
- [ ] T060 [US2] Ajouter le type `'photo'` à `libs/recognition/application/src/lib/get-shelf-photo-image.use-case.ts`. Fait passer T059. Dépend de T059 et T042.
- [ ] T061 [US2] Écrire les tests (doivent échouer) dans `apps/api/src/recognition/shelf-photos.http.spec.ts` :
  - `GET /shelf-photos/{id}` renvoie 200 avec le corps du contrat §2 ;
  - un id inconnu ou non-UUID renvoie 404 ;
  - `GET /shelf-photos/{id}/photo` renvoie 200 avec le `Content-Type` du type conservé et `Cache-Control: private, max-age=31536000, immutable` ;
  - une photo absente du bucket alors que l'envoi existe renvoie **502** ;
  - après `GET /shelf-photos/{id}` et `GET …/photo`, l'état des doubles est inchangé (FR-013).

  Puis ajouter les deux routes à `apps/api/src/recognition/shelf-photos.controller.ts`, avec `@SkipThrottle({ write: true })`. Traduire `ShelfPhotoStorageFailed` en 502 dans `apps/api/src/recognition/recognition-exception.filter.ts` si ce n'est pas déjà le cas. Enregistrer `GetShelfScanUseCase` dans `apps/api/src/recognition/recognition.module.ts`. Dépend de T058 et T060.
- [ ] T062 [P] [US2] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/api/history-api.spec.ts` : `getShelfScan(id)` rend `found`, `notFound` (404) ou un échec typé, et valide le corps par garde de type ; `photoUrl(id)` encode l'id. Puis étendre `apps/web/src/features/upload-history/api/history-api.ts`.
- [ ] T063 [US2] Créer `apps/web/src/features/upload-history/ui/detected-books-list.tsx`, une copie locale de l'affichage de `photo-upload/ui/scan-result.tsx` (titre, puis « — auteur » si connu ; « Aucun livre détecté sur cette photo. » si vide), accompagnée de `detected-books-list.spec.tsx` écrit d'abord (research.md §11).
- [ ] T064 [US2] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/ui/entry-detail-screen.spec.tsx` :
  - un chargement s'affiche d'abord ;
  - `completed` affiche la photo (`<img src={photoUrl}>`) et la liste des livres ;
  - `completed` vide affiche « Aucun livre détecté » ;
  - `failed` affiche « L'analyse de cette photo a échoué. » ;
  - `pending` affiche « L'analyse de cette photo n'a pas été lancée. » (US2, scénario 3) ;
  - `onError` de la photo bascule sur la vignette si `hasThumbnail`, sinon sur l'indicateur neutre ; un `onError` de la vignette bascule à son tour sur l'indicateur neutre ; les livres restent affichés dans tous les cas (FR-008, contrat §3) ;
  - `notFound` affiche « Cet envoi est introuvable. » avec un lien vers `#/historique` ;
  - un échec réseau affiche un message distinct avec « Réessayer » ;
  - un lien « Historique » ramène à `#/historique` ;
  - un 429 `TOO_MANY_REQUESTS` affiche « Trop de demandes en peu de temps. Patientez une minute puis réessayez. », distinct du message de panne (FR-014, analyse G2).

  Créer ensuite `apps/web/src/features/upload-history/ui/entry-detail-screen.tsx`. Dépend de T062 et T063.
- [ ] T065 [US2] Brancher la route `entry` dans `apps/web/src/app/app.tsx`. `HistoryScreen` reste **monté** (masqué par l'attribut `hidden`) quand le détail est affiché, et la slice mémorise `window.scrollY` au départ vers un détail pour le restaurer au retour (research.md §3). Tests d'abord dans `apps/web/src/app/app.spec.tsx` et `apps/web/src/features/upload-history/ui/history-screen.spec.tsx` :
  - aller de `#/historique` à `#/historique/{id}` puis revenir ne refait **aucune** requête de liste ;
  - les entrées déjà chargées, y compris la deuxième page, sont toujours là ;
  - la position de défilement est restaurée.

  Dépend de T056 et T064.
- [ ] T066 [US2] Vérifier la mise en page à 360 px (SC-004) dans `apps/web/src/features/upload-history/ui/upload-history.module.css` : la photo du détail tient en `max-width: 100%`, et ni la liste ni le détail ne défilent à l'horizontale. Le vérifier dans le navigateur en émulation mobile (quickstart, scénario 8). Dépend de T064.

**Checkpoint** : US1 et US2 forment ensemble le minimum utile. On peut retrouver les livres d'un
envoi ancien sans renvoyer la photo (SC-001).

---

## Phase 5 : User Story 3, relancer l'analyse d'un envoi sans résultat (Priority: P3)

**But** : depuis le détail d'un envoi en échec ou jamais analysé, relancer l'analyse sans
reprendre la photo, dans la limite du plafond quotidien.

**Independent Test** : faire échouer une analyse, rétablir le service, relancer depuis le détail
et constater que les livres apparaissent, dans le détail comme dans la liste (quickstart,
scénario 4).

- [ ] T067 [US3] Écrire les tests (doivent échouer) :
  - dans `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.spec.ts` : un envoi `failed` est relançable et passe `completed` (livres) ou reste `failed` (nouvel échec) ; un envoi `completed` donne `ShelfScanAlreadyProcessed` sans appel au scanner (FR-011) ;
  - dans `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.spec.ts` : `startAttempt` accepte `failed` ; `markCompleted` et `markFailed` passent un `failed` en `completed` ou `failed` ; un `completed` est définitif ;
  - deux relances concurrentes : une seule tentative réservée, l'autre reçoit `ShelfScanInProgress`.
- [ ] T068 [US3] Élargir la règle « analysable » de `pending` à `pending | failed`, dans cet ordre :
  1. documenter la nouvelle transition dans `libs/recognition/domain/src/lib/shelf-scan-repository.port.ts` ;
  2. changer la condition de `startAttempt` et du `where` de `settle` en `status in ('pending','failed')` dans `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.ts` ;
  3. faire de même dans les deux doubles en mémoire (`libs/recognition/application/src/lib/testing/in-memory-shelf-scan-repository.ts`, `apps/api/src/recognition/testing/shelf-photos-controller.fixture.ts`) ;
  4. mettre à jour le commentaire de `libs/recognition/domain/src/lib/shelf-scan-already-processed.error.ts` : l'erreur signifie désormais « déjà `completed` ».

  Fait passer T067. Dépend de T067.
- [ ] T069 [US3] Écrire les tests (doivent échouer) dans `apps/api/src/recognition/shelf-photos.http.spec.ts` : `POST /shelf-photos/{id}/scan` sur un envoi `failed` renvoie 200 avec les livres, puis `GET /shelf-photos/{id}` donne `outcome: "completed"`, et un second POST renvoie 409 `SCAN_ALREADY_COMPLETED`. Aucune modification du contrôleur n'est attendue : si le test passe déjà après T068, le noter et passer à la suite. Dépend de T068.
- [ ] T070 [P] [US3] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/api/history-api.spec.ts`. `rescanShelfScan(id)` appelle `POST {base}/shelf-photos/{id}/scan` et rend l'une de ces issues :

  | Réponse | Issue |
  |---|---|
  | 200 | `{ books }` |
  | 502 | `upstream` |
  | 429 `DAILY_SCAN_QUOTA_EXCEEDED` | `quota` |
  | 429 `TOO_MANY_REQUESTS` | `rateLimited` |
  | 409 `SCAN_IN_PROGRESS` | `inProgress` |
  | 409 `SCAN_ALREADY_COMPLETED` | `alreadyCompleted` |
  | échec réseau | `offline` |

  Puis étendre `apps/web/src/features/upload-history/api/history-api.ts`.
- [ ] T071 [US3] Écrire les tests (doivent échouer) dans `apps/web/src/features/upload-history/ui/entry-detail-screen.spec.tsx` :
  - un bouton « Relancer l'analyse » n'apparaît que pour `failed` et `pending` (US3, scénario 4) ;
  - pendant la relance, un chargement s'affiche et le bouton est désactivé (US3, scénario 2) ;
  - au succès, les livres s'affichent et le bouton disparaît ;
  - en cas d'échec amont, le message « Le service de reconnaissance ne répond pas pour le moment. Réessayez plus tard. » s'affiche et le bouton reste disponible (US3, scénario 3) ;
  - au quota, « Limite d'analyses du jour atteinte : réessayez demain. » ;
  - `inProgress` affiche « Une analyse de cette photo est déjà en cours. » ;
  - `alreadyCompleted` recharge le détail.

  Implémenter ensuite dans `apps/web/src/features/upload-history/ui/entry-detail-screen.tsx`. Dépend de T070.
- [ ] T072 [US3] Faire refléter une relance réussie dans l'entrée correspondante de l'historique déjà chargé, sans recharger la liste (US3, scénario 1). Par exemple, `HistoryScreen` expose un `updateEntry(id, outcome)` que le shell passe au détail : le shell compose, aucune slice n'importe l'autre. Test d'abord dans `apps/web/src/app/app.spec.tsx`, puis modifier `apps/web/src/app/app.tsx` et `apps/web/src/features/upload-history/ui/history-screen.tsx`. Dépend de T065 et T071.

**Checkpoint** : les trois stories fonctionnent. Un envoi en échec peut être ramené à un résultat en
une seule action (SC-005), dans la limite du plafond quotidien (SC-006).

---

## Phase 6 : Polish et points transverses

- [ ] T073 [P] Ajouter, en tête de `specs/001-photo-upload/contracts/scan-api.md`, une note datée qui renvoie aux amendements de `specs/002-upload-history/contracts/shelf-photos-history-api.md` §5 : champ `thumbnail`, relance depuis `failed`, codes des 409 et 429.
- [ ] T074 [P] Mettre à jour `CLAUDE.md`, section *Commandes* ou *Architecture*, seulement si une commande ou un emplacement change. Le routage par hash d'`apps/web/src/app/` mérite une ligne dans l'arborescence.
- [X] T075 Ouvrir une issue GitHub ([#68](https://github.com/arenier/pick-a-book/issues/68)) pour le prérequis de déploiement hors scope (plan.md, *Prérequis hors scope*, point 3) : bucket privé de photos dans `infra/envs/prod/main.tf`, droit `roles/storage.objectAdmin` du compte de service de l'API sur ce bucket, variable `BUCKET_NAME` sur `cloud_run_api` (`DAILY_SCAN_LIMIT` y est déjà, T018). L'issue référence les specs 001 et 002.
- [ ] T076 Vérification manuelle sur un iPhone (Safari), à tracer dans la PR : une photo portrait HEIC produit une vignette **droite** (orientation EXIF, research.md §5), et l'historique l'affiche.
- [ ] T077 Dérouler `specs/002-upload-history/quickstart.md`, scénarios 1 à 8, et noter les écarts dans la PR.
- [ ] T078 Faire passer `yarn check` : lint (oxlint type-aware et frontières ESLint), format, typecheck, test et build, sur tous les projets.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance.
- **Foundational (Phase 2)** : dépend de la Phase 1. **Bloque toutes les stories.**
- **US1 (Phase 3)** : dépend de la Phase 2.
- **US2 (Phase 4)** : dépend de la Phase 2. Côté back, il est indépendant d'US1, sauf T060, qui étend le use case de T042. Côté front, le branchement du shell (T065) suppose l'écran d'historique de T056.
- **US3 (Phase 5)** : dépend de la Phase 2 (tentatives et plafond) et, côté front, du détail d'US2 (T064, T065).
- **Polish (Phase 6)** : après les stories livrées.

### Enchaînements clés

- T003 → T004 → T005 → (T012, T045) : le schéma est testé d'abord, puis les specs d'adapter tournent sur le schéma migré.
- T008 → T009 → T010 → T011 → T016 → T019 → T020 : la réservation de tentative, du port jusqu'au HTTP.
- T021 → T022 → T023 : la limite de requêtes.
- T017 → T018 : `DAILY_SCAN_LIMIT` en Terraform, indépendant du code applicatif. Il se fait en parallèle de T014 → T015.
- T030 → T031 → (T032, T033) → T034 : la fondation domaine d'US1.
- T047 → T048 : les routes de lecture d'US1.
- T067 → T068 → T069 : la relance côté back.

### Dans chaque story

Le test d'abord, qui échoue ; puis le code minimal qui le fait passer ; puis refactor. Domaine,
puis application, puis infrastructure, puis API, puis front.

---

## Parallel Example: Foundational

```bash
# En parallèle dès la fin de T001 :
Task: "T006 domain error tests (ShelfScanInProgress, DailyScanQuotaExceeded)"
Task: "T014 DAILY_SCAN_LIMIT tests in apps/api/src/config/environment.spec.ts"
Task: "T017 DAILY_SCAN_LIMIT Terraform tests in infra/envs/prod/tests/prod.tftest.hcl"
Task: "T024 429 message tests in apps/web/src/features/photo-upload/api/scan-shelf-photo.spec.ts"
Task: "T026 hash route tests in apps/web/src/app/use-hash-route.spec.ts"
```

## Parallel Example: User Story 1

```bash
# Tests indépendants, fichiers distincts :
Task: "T030 ShelfPhotoThumbnail tests"
Task: "T037 cursor encode/decode tests"
Task: "T043 GCS thumbnail adapter tests"
Task: "T049 makeThumbnail tests"
Task: "T052 history-entry guards tests"
```

## Parallel Example: User Story 2

```bash
Task: "T057 GetShelfScanUseCase tests"
Task: "T059 GetShelfPhotoImageUseCase 'photo' tests"
Task: "T062 getShelfScan / photoUrl tests"
```

---

## Implementation Strategy

### MVP (US1 + US2)

1. Phases 1 et 2 : les garde-fous sont en place avant toute route de lecture (FR-012 à FR-016).
2. Phase 3 (US1) : valider seule avec les scénarios 1, 2 et 6 du quickstart.
3. Phase 4 (US2) : valider avec le scénario 3. **US1 et US2 forment le minimum utile** : la spec
   les classe toutes deux P1.
4. Livrer (PR) si le déploiement le permet (T075).

### Incrémental

5. Phase 5 (US3) : la relance, validée avec les scénarios 4 et 5.
6. Phase 6 : polish, vérification sur iPhone, `yarn check`.

---

## Notes

- `[P]` : fichiers différents, pas de dépendance sur une tâche non terminée.
- Aucun `as` (lint `assertionStyle: 'never'`) : les gardes de type et `satisfies` seulement.
- Assertions strictes : `toStrictEqual` et `toBe(true)`.
- Specs en `*.spec.ts(x)`, avec `import { describe, expect, it } from 'vitest'` explicite.
- Textes affichés en français, code, commentaires et tests en anglais.
- Commit après chaque tâche ou groupe cohérent. Le titre de la PR est en anglais.
