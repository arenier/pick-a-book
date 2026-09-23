---

description: "Task list template for feature implementation"
---

# Tasks: Upload d'une photo d'étagère

**Input**: Design documents from `/specs/001-photo-upload/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scan-api.md, quickstart.md

**Tests**: Incluses et obligatoires — la constitution du projet impose le TDD systématique
(rouge/vert/refactor, aucun code de production sans un test qui le motive). Chaque tâche
d'implémentation est précédée d'une tâche de test qui doit échouer avant elle.

**Organization**: Les tâches sont groupées par user story (spec.md) après un socle Setup +
Foundational partagé — cette feature n'a qu'un seul flux HTTP (upload + scan) que toutes les
stories exercent sous des angles différents, d'où un socle commun plus large que d'habitude.

**Révisé le 21/09/2026** (`/speckit-analyze`) : ajout de 5 tâches comblant trois lacunes de
couverture identifiées par l'analyse croisée spec/plan/tasks — FR-007 (bloquer un envoi concurrent,
T027/T042), SC-004 (mise en page utilisable dès 360px, T043), et le cas « échec réseau » distinct
du 400/502 (T049/T055, contracts/scan-api.md). Toutes les tâches à partir de T027 ont été
renumérotées en conséquence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Peut s'exécuter en parallèle (fichiers différents, aucune dépendance sur une tâche non
  terminée)
- **[Story]**: US1 (chemin heureux), US2 (photo refusée / échec serveur), US3 (conservation),
  US4 (recommencer)

## Phase 1: Setup

- [X] T001 Ajouter `@google-cloud/storage`, `drizzle-orm` et `pg` aux `dependencies` de
      `libs/recognition/infrastructure/package.json` (déjà nommés par ADR 0004/0006, jamais
      installés — research.md §8-9)
- [X] T002 [P] Ajouter `drizzle-kit` aux `devDependencies` du `package.json` racine, pour générer
      les migrations
- [X] T003 [P] Ajouter un service `bucket` (`fsouza/fake-gcs-server`) à `docker-compose.yml`,
      créant un bucket nommé comme `BUCKET_NAME` — comble l'écart avec le commentaire de
      `CLAUDE.md` (« API + front + Postgres + émulateur de bucket », research.md §9)
- [X] T004 [P] Documenter dans `.env.example` les nouvelles variables : `BUCKET_NAME` (requis),
      `OWNER_ID` (optionnel, défaut `"default"`), `WEB_ORIGIN` (optionnel, défaut
      `"http://localhost:4200"`), `STORAGE_EMULATOR_HOST` (optionnel, dev uniquement)

---

## Phase 2: Foundational (bloquant — commun à toutes les user stories)

**But** : le flux HTTP en deux endpoints (`POST /shelf-photos`, `POST /shelf-photos/{id}/scan`,
contracts/scan-api.md) et sa persistance (`uploads` + `shelf_scans`, research.md §8) sont partagés
par toutes les stories — aucune n'est testable avant que ce socle existe.

**⚠️ CRITIQUE** : aucune story ne démarre avant la fin de cette phase.

- [X] T005 [P] Écrire les tests (doivent échouer) dans
      `apps/api/src/config/environment.spec.ts` : `BUCKET_NAME` requis (boot échoue et liste la
      variable manquante, comme `DATABASE_URL`) ; `OWNER_ID` absent → `"default"` ; `WEB_ORIGIN`
      absent → `"http://localhost:4200"`
- [X] T006 Étendre `apps/api/src/config/environment.ts` (`Environment`, `loadEnvironment`) pour
      lire et valider `BUCKET_NAME`, `OWNER_ID`, `WEB_ORIGIN` et faire passer T005 (dépend de T005)
- [X] T007 Appeler `app.enableCors({ origin: environment.webOrigin })` dans `apps/api/src/main.ts`
      (dépend de T006)
- [X] T008 [P] Écrire `libs/recognition/domain/src/lib/shelf-photo-storage.port.spec.ts` : vérifie
      la forme de `ShelfPhotoStoragePort` (`store(photo: ShelfPhoto, key: string): Promise<void>`,
      `retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto>`) et de son
      injection token
- [X] T009 [P] Créer `libs/recognition/domain/src/lib/shelf-photo-storage.port.ts`
      (`ShelfPhotoStoragePort`, `SHELF_PHOTO_STORAGE_PORT`) pour faire passer T008 (dépend de T008)
- [X] T010 [P] Écrire `libs/recognition/domain/src/lib/shelf-scan-repository.port.spec.ts` :
      vérifie la forme de `ShelfScanId`, `ShelfScanRecord` (`id`, `ownerId`, `photoBucketKey`,
      `photoMediaType`, `photoSizeBytes`, `originalFilename`, `status: 'pending' | 'completed' |
      'failed'`, `detectedBooks: DetectedBook[] | undefined`, `createdAt`,
      data-model.md#ShelfScanRecord) et de `ShelfScanRepositoryPort`
      (`createPending`, `get`, `markCompleted`, `markFailed`)
- [X] T011 [P] Créer `libs/recognition/domain/src/lib/shelf-scan-repository.port.ts`
      (`ShelfScanRepositoryPort`, `SHELF_SCAN_REPOSITORY_PORT`) pour faire passer T010 (dépend de
      T010)
- [X] T012 Exporter les deux nouveaux ports depuis `libs/recognition/domain/src/index.ts` (dépend
      de T009, T011)
- [X] T013 Créer le schéma Drizzle `libs/recognition/infrastructure/src/lib/drizzle/schema.ts` :
      table `uploads` (`id uuid PK`, `owner_id text NOT NULL`, `type text NOT NULL`,
      `bucket_key text NOT NULL`, `media_type text NOT NULL`, `size_bytes integer NOT NULL`,
      `original_filename text NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`) et table
      `shelf_scans` (`id uuid PK DEFAULT gen_random_uuid()`, `upload_id uuid NOT NULL UNIQUE
      REFERENCES uploads(id)`, `status text NOT NULL`, `detected_books jsonb`) — research.md §8
- [X] T014 Générer la migration initiale via `drizzle-kit` pour `uploads` et `shelf_scans` (dépend
      de T013)
- [X] T015 [P] Écrire
      `libs/recognition/infrastructure/src/lib/gcs-shelf-photo-storage.adapter.spec.ts` contre
      l'émulateur de bucket (`docker compose`) : `store(photo, key)` écrit les octets et le type
      MIME en métadonnée à `key` ; `retrieve(key, mediaType)` relit les mêmes octets ; `retrieve`
      sur une clé absente rejette
- [X] T016 Implémenter
      `libs/recognition/infrastructure/src/lib/gcs-shelf-photo-storage.adapter.ts`
      (`GcsShelfPhotoStorageAdapter`, `@google-cloud/storage`, lit `STORAGE_EMULATOR_HOST` si
      présent) pour faire passer T015 (dépend de T015)
- [X] T017 [P] Écrire
      `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.spec.ts`
      contre le Postgres du `docker-compose.yml` existant : `createPending(photo)` insère
      `uploads` + `shelf_scans` dans une même transaction et renvoie l'`id` (celui de `uploads`,
      research.md §8) ; `get(id)` reconstruit un `ShelfScanRecord` par jointure ; `markCompleted`
      et `markFailed` ne réussissent que depuis `status = 'pending'` et échouent sinon (support du
      409, research.md §7) ; `get` sur un `id` absent renvoie `undefined` (support du 404)
- [X] T018 Implémenter
      `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.ts`
      (`DrizzleShelfScanRepositoryAdapter`) pour faire passer T017 (dépend de T017)
- [X] T019 Exporter les deux nouveaux adapters depuis `libs/recognition/infrastructure/src/index.ts`
      (dépend de T016, T018)
- [X] T020 Créer `apps/api/src/recognition/shelf-scan-archive.factory.ts` : construit le client GCS
      (`BUCKET_NAME`, `STORAGE_EMULATOR_HOST`) et le pool Postgres (`DATABASE_URL`) depuis
      `Environment`, retourne les deux adapters instanciés (dépend de T016, T018)

**Checkpoint** : le socle est prêt — les user stories peuvent démarrer.

---

## Phase 3: User Story 1 - Prendre une photo et voir les livres détectés (Priority: P1) 🎯 MVP

**Goal**: l'utilisateur envoie une photo depuis son téléphone et voit la liste des livres détectés
(ou l'absence de livre).

**Independent Test**: quickstart.md scénario 1 — envoyer une photo valide, observer le chargement
puis le résultat.

### Tests pour User Story 1 (à écrire en premier, doivent échouer)

- [ ] T021 [P] [US1] Écrire `libs/recognition/application/src/lib/store-shelf-photo.use-case.spec.ts` :
      `execute({ bytes, mediaType, originalFilename })` valide via `ShelfPhoto.of`, génère un
      `id`, appelle `storage.store(photo, '{ownerId}/shelf_photo/{id}')`, appelle
      `repository.createPending(...)` avec `ownerId`, `photoMediaType`, `photoSizeBytes`
      (`bytes.byteLength`) et `originalFilename`, renvoie `{ id }`
- [ ] T022 [P] [US1] Écrire
      `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.spec.ts` (cas
      succès) : `execute({ id })` sur un enregistrement `pending` relit la photo
      (`storage.retrieve`), appelle `ShelfScannerPort.scan`, appelle
      `repository.markCompleted(id, books)`, renvoie `{ books: DetectedBookDto[] }` — y compris le
      cas `books = []` (« aucun livre détecté », US1 scénario 3)
- [ ] T023 [P] [US1] Écrire `apps/api/src/recognition/shelf-photos.controller.spec.ts` (cas
      succès) : `POST /shelf-photos` avec un fichier multipart valide renvoie `201 { id }` ;
      `POST /shelf-photos/:id/scan` sur cet `id` renvoie `200 { books }`
- [ ] T024 [P] [US1] Écrire `apps/web/src/features/photo-upload/api/scan-shelf-photo.spec.ts` (cas
      succès) : `submitShelfPhoto(file)` enchaîne `POST {VITE_API_BASE_URL}/shelf-photos` puis
      `POST .../shelf-photos/{id}/scan` (fetch moqué) et résout un `UploadState` `success` avec les
      livres mappés (`data-model.md#DetectedBook`)
- [ ] T025 [P] [US1] Écrire `apps/web/src/features/photo-upload/ui/scan-result.spec.tsx` : affiche
      auteur (si présent) et titre pour chaque livre de `books` ; affiche un message « aucun livre
      détecté » quand `books` est vide
- [ ] T026 [P] [US1] Écrire `apps/web/src/features/photo-upload/ui/photo-upload-screen.spec.tsx`
      (cas succès) : sélectionner puis envoyer une photo valide affiche un état de chargement puis
      la liste de résultat (US1 scénarios 1–2)
- [ ] T027 [P] [US1] Étendre `apps/web/src/features/photo-upload/ui/photo-upload-screen.spec.tsx`
      (FR-007, `/speckit-analyze` G1) : déclencher un nouvel envoi pendant qu'un précédent est à
      l'état `uploading` n'a aucun effet observable (le déclencheur — bouton ou input — est
      désactivé ; aucun second appel réseau n'est émis)

### Implémentation pour User Story 1

- [ ] T028 [US1] Implémenter
      `libs/recognition/application/src/lib/store-shelf-photo.use-case.ts`
      (`StoreShelfPhotoUseCase`, constructeur `(ownerId, storage, repository)`) pour faire passer
      T021 (dépend de T021)
- [ ] T029 [US1] Implémenter
      `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.ts`
      (`ScanStoredShelfPhotoUseCase`) pour faire passer T022 (dépend de T022)
- [ ] T030 [US1] Mettre à jour `libs/recognition/application/src/index.ts` : exporter les deux
      nouveaux use cases, retirer `ScanShelfUseCase` (dépend de T028, T029)
- [ ] T031 [US1] Supprimer `libs/recognition/application/src/lib/scan-shelf.use-case.ts` et
      `scan-shelf.use-case.spec.ts` (remplacés par T028/T029, T021/T022) — garder
      `scan-shelf.dto.ts` (`DetectedBookDto`, `ScanShelfResult` réutilisés tels quels) (dépend de
      T030, pour ne pas retirer un fichier encore exporté)
- [ ] T032 [US1] Implémenter `apps/api/src/recognition/shelf-photos.controller.ts` (remplace
      `scan.controller.ts`) : `POST /shelf-photos` (`FileInterceptor('photo', ...)`, 201),
      `POST /shelf-photos/:id/scan` (200) pour faire passer T023 (dépend de T023)
- [ ] T033 [US1] Supprimer `apps/api/src/recognition/scan.controller.ts` et
      `scan.controller.spec.ts` (dépend de T032)
- [ ] T034 [US1] Mettre à jour `apps/api/src/recognition/recognition.module.ts` : lier
      `SHELF_PHOTO_STORAGE_PORT`/`SHELF_SCAN_REPOSITORY_PORT` via `shelf-scan-archive.factory.ts`
      (T020), construire `StoreShelfPhotoUseCase(environment.ownerId, ...)` et
      `ScanStoredShelfPhotoUseCase(...)`, déclarer `ShelfPhotosController` (dépend de T028, T029,
      T032)
- [ ] T035 [US1] Implémenter
      `apps/web/src/features/photo-upload/model/detected-book.ts` (type `DetectedBook`,
      data-model.md#DetectedBook) et
      `apps/web/src/features/photo-upload/model/upload-state.ts` (union `idle | uploading |
      success | error`, data-model.md#UploadState)
- [ ] T036 [US1] Implémenter `apps/web/src/features/photo-upload/api/scan-shelf-photo.ts`
      (`submitShelfPhoto`) pour faire passer T024 (dépend de T024, T035)
- [ ] T037 [US1] Implémenter `apps/web/src/features/photo-upload/ui/scan-result.tsx` pour faire
      passer T025 (dépend de T025)
- [ ] T038 [US1] Implémenter `apps/web/src/features/photo-upload/ui/photo-picker.tsx` :
      `<input type="file" accept="image/jpeg,image/png,image/webp,image/heic"
      capture="environment">` (FR-001 : prise à l'instant ou fichier existant)
- [ ] T039 [US1] Implémenter `apps/web/src/features/photo-upload/ui/photo-upload-screen.tsx`
      (assemble `photo-picker`, `scan-shelf-photo`, `scan-result`, `upload-state`) pour faire
      passer T026 (dépend de T026, T036, T037, T038)
- [ ] T040 [US1] Monter `PhotoUploadScreen` dans `apps/web/src/app/app.tsx` (remplace le
      placeholder « Interface à construire ») (dépend de T039)
- [ ] T041 [US1] Configurer `VITE_API_BASE_URL` (défaut `http://localhost:3000` en dev) lu via
      `import.meta.env` dans `apps/web/src/features/photo-upload/api/scan-shelf-photo.ts` (dépend
      de T036)
- [ ] T042 [US1] Désactiver le déclencheur d'envoi (bouton/input) tant que l'état est `uploading`
      dans `photo-upload-screen.tsx` (FR-007, `/speckit-analyze` G1) pour faire passer T027
      (dépend de T027, T039)
- [ ] T043 [US1] Mettre en page `photo-upload-screen.tsx` (et son module CSS) pour rester
      utilisable et sans défilement horizontal dès 360px de large (SC-004, `/speckit-analyze` G2)
      — vérifié manuellement via quickstart.md scénario 1 étape 1 : aucun test automatisé de mise
      en page n'existe dans cette stack (jsdom ne rend pas de layout réel), cohérent avec
      « outillage unique, pas de choix locaux » plutôt que d'ajouter un outil de test visuel pour
      ce seul besoin (dépend de T039)

**Checkpoint**: User Story 1 fonctionnelle et testable isolément (quickstart.md scénario 1).

---

## Phase 4: User Story 2 - Être prévenu quand la photo est refusée (Priority: P2)

**Goal**: un fichier non conforme ou un échec du service de reconnaissance affiche un message
compréhensible, jamais une page blanche.

**Independent Test**: quickstart.md scénarios 2 et 3.

### Tests pour User Story 2

- [ ] T044 [P] [US2] Étendre `apps/web/src/features/photo-upload/model/photo-constraints.spec.ts` :
      un `mediaType` hors de `image/jpeg`, `image/png`, `image/webp`, `image/heic` échoue avec un
      message ; un `sizeInBytes` strictement positif requis, dépassant 20 971 520 octets (20 Mo)
      échoue avec un message (FR-009, data-model.md#SelectedPhoto)
- [ ] T045 [P] [US2] Étendre `apps/web/src/features/photo-upload/ui/photo-upload-screen.spec.tsx` :
      choisir un fichier non-image ou trop volumineux affiche un message d'erreur sans appel
      réseau (US2 scénarios 1–2, FR-003)
- [ ] T046 [P] [US2] Étendre `apps/api/src/recognition/shelf-photos.controller.spec.ts` :
      `POST /shelf-photos` avec un fichier absent, vide, de type non supporté ou de plus de 20 Mo
      renvoie `400` (contracts/scan-api.md §1)
- [ ] T047 [P] [US2] Étendre
      `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.spec.ts` : quand
      `ShelfScannerPort.scan` rejette avec `ShelfScanFailed`, `execute({ id })` rejette (mappé en
      502 par le contrôleur)
- [ ] T048 [P] [US2] Étendre `apps/web/src/features/photo-upload/api/scan-shelf-photo.spec.ts` :
      une réponse 502 de l'étape 2 résout un `UploadState` `error` avec un message distinct de
      « aucun livre détecté » (US2 scénario 3, FR-006)
- [ ] T049 [P] [US2] Étendre `apps/web/src/features/photo-upload/api/scan-shelf-photo.spec.ts`
      (`/speckit-analyze` G3, contracts/scan-api.md « Échec réseau ») : `fetch` qui rejette sans
      réponse HTTP (coupure réseau) sur l'étape 1 **et** sur l'étape 2 résout chacun un
      `UploadState` `error` avec un message distinct de ceux des cas 400/502/succès

### Implémentation pour User Story 2

- [ ] T050 [US2] Implémenter
      `apps/web/src/features/photo-upload/model/photo-constraints.ts`
      (`ACCEPTED_MEDIA_TYPES`, `MAX_SIZE_IN_BYTES = 20_971_520`, fonction de validation) pour
      faire passer T044 (dépend de T044)
- [ ] T051 [US2] Appeler la validation de `photo-constraints.ts` dans `photo-upload-screen.tsx`
      avant tout appel réseau, pour faire passer T045 (dépend de T045, T050)
- [ ] T052 [US2] Vérifier/compléter le mappage d'erreur dans `shelf-photos.controller.ts`
      (`BadRequestException` sur l'échec de `ShelfPhoto.of`) pour faire passer T046 (dépend de
      T046)
- [ ] T053 [US2] Étendre `scan-stored-shelf-photo.use-case.ts` pour laisser remonter
      `ShelfScanFailed` telle quelle et `shelf-photos.controller.ts` pour la mapper en
      `BadGatewayException` (502), pour faire passer T047 (dépend de T047)
- [ ] T054 [US2] Étendre `scan-shelf-photo.ts` pour distinguer le message d'erreur 502 de celui
      « aucun livre détecté », pour faire passer T048 (dépend de T048, T053)
- [ ] T055 [US2] Étendre `scan-shelf-photo.ts` (`/speckit-analyze` G3) : entourer chacun des deux
      appels `fetch` d'un `catch` distinct qui produit un message d'erreur réseau propre (différent
      des messages 400/502/succès), pour faire passer T049 (dépend de T049, T054)

**Checkpoint**: User Story 2 fonctionnelle et testable isolément.

---

## Phase 5: User Story 3 - Conserver la photo et le résultat de l'analyse (Priority: P2)

**Goal**: la photo et son résultat (livres détectés ou statut d'échec) sont conservés dès qu'une
analyse est tentée et que le service de reconnaissance répond — jamais pour un fichier refusé
avant analyse.

**Independent Test**: quickstart.md scénario 1 étape 5, scénario 3 étape 4, et « rien n'est
conservé » du scénario 2.

### Tests pour User Story 3

- [ ] T056 [P] [US3] Étendre
      `libs/recognition/application/src/lib/scan-stored-shelf-photo.use-case.spec.ts` : quand
      `ShelfScannerPort.scan` rejette, `repository.markFailed(id)` est appelé (et
      `markCompleted` ne l'est pas) — US3 scénario 2, FR-011
- [ ] T057 [P] [US3] Étendre
      `libs/recognition/application/src/lib/store-shelf-photo.use-case.spec.ts` : quand
      `ShelfPhoto.of` rejette (format/poids), ni `storage.store` ni `repository.createPending` ne
      sont appelés — US3 scénario 3, FR-013
- [ ] T058 [P] [US3] Étendre `scan-stored-shelf-photo.use-case.spec.ts` : `execute({ id })` sur un
      `id` sans enregistrement rejette avec une erreur dédiée (mappée en 404 par le contrôleur,
      contracts/scan-api.md)
- [ ] T059 [P] [US3] Étendre `scan-stored-shelf-photo.use-case.spec.ts` : `execute({ id })` sur un
      enregistrement déjà `completed` ou `failed` rejette avec une erreur dédiée sans rappeler
      `ShelfScannerPort.scan` (mappée en 409, research.md §7)
- [ ] T060 [P] [US3] Étendre
      `libs/recognition/infrastructure/src/lib/drizzle-shelf-scan-repository.adapter.spec.ts` :
      `createPending` persiste `ownerId`, `photoMediaType`, `photoSizeBytes` et
      `originalFilename` tels quels, relisibles via `get` ; la colonne `uploads.bucket_key`
      stockée ne contient jamais `originalFilename` (FR-015)

### Implémentation pour User Story 3

- [ ] T061 [US3] Étendre `scan-stored-shelf-photo.use-case.ts` pour appeler
      `repository.markFailed(id)` avant de relancer l'erreur du scanner, pour faire passer T056
      (dépend de T056)
- [ ] T062 [US3] Vérifier `store-shelf-photo.use-case.ts` (l'ordre validation → stockage → création
      déjà écrit en T028 doit satisfaire T057 sans modification ; sinon corriger l'ordre des
      appels) (dépend de T057)
- [ ] T063 [US3] Ajouter une erreur dédiée (ex. `ShelfScanNotFound`) et l'appel correspondant dans
      `scan-stored-shelf-photo.use-case.ts` + mappage en `NotFoundException` (404) dans
      `shelf-photos.controller.ts`, pour faire passer T058 (dépend de T058)
- [ ] T064 [US3] Ajouter une erreur dédiée (ex. `ShelfScanAlreadyProcessed`) et l'appel
      correspondant dans `scan-stored-shelf-photo.use-case.ts` + mappage en `ConflictException`
      (409) dans `shelf-photos.controller.ts`, pour faire passer T059 (dépend de T059)
- [ ] T065 [US3] Corriger `drizzle-shelf-scan-repository.adapter.ts` si T060 révèle un écart
      (dépend de T060)

**Checkpoint**: User Story 3 fonctionnelle et testable isolément.

---

## Phase 6: User Story 4 - Reprendre après une erreur ou changer de photo (Priority: P3)

**Goal**: après un résultat ou une erreur, l'utilisateur revient à l'état initial sans recharger la
page.

**Independent Test**: quickstart.md scénario 4.

### Tests pour User Story 4

- [ ] T066 [P] [US4] Étendre `apps/web/src/features/photo-upload/ui/photo-upload-screen.spec.tsx` :
      depuis un état `success` ou `error`, déclencher « recommencer » ramène l'écran à l'état
      `idle` sans rechargement de page (US4 scénario 1, FR-008)

### Implémentation pour User Story 4

- [ ] T067 [US4] Ajouter l'action « recommencer » (bouton + transition vers `idle`) dans
      `photo-upload-screen.tsx` pour faire passer T066 (dépend de T066)

**Checkpoint**: les quatre user stories sont fonctionnelles indépendamment.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T068 [P] `yarn lint` sur l'ensemble du dépôt — vérifie notamment que `apps/web`
      (`scope:web`) n'importe aucun package `scope:api` et que le lint type-aware
      (`no-floating-promises`, etc.) passe sur les nouveaux adapters asynchrones
- [ ] T069 [P] `yarn nx run-many -t test build` sur tous les projets touchés
      (`web`, `api`, `recognition-domain`, `recognition-application`, `recognition-infrastructure`)
- [ ] T070 Exécuter manuellement les 4 scénarios de `quickstart.md` contre
      `docker compose up --build`, y compris la vérification visuelle de SC-004 (largeur ≤ 400px,
      scénario 1 étape 1)
- [ ] T071 Relire `CLAUDE.md` (section Commandes) : le commentaire `docker compose up --build`
      décrit désormais un stack réellement conforme (émulateur de bucket présent) — ajuster si un
      détail diverge

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: aucune dépendance — démarre immédiatement.
- **Foundational (Phase 2)**: dépend de Setup. **Bloque** toutes les user stories.
- **User Stories (Phase 3–6)**: dépendent toutes de Foundational. US1 est le chemin heureux
  minimal ; US2 et US3 étendent le même contrôleur/use cases avec les branches d'erreur et de
  persistance (elles peuvent avancer en parallèle une fois US1 posée, mais leurs tests supposent
  l'existence des fichiers créés en US1) ; US4 est purement frontend, indépendante de US2/US3.
- **Polish (Phase 7)**: dépend de toutes les user stories retenues.

### Dépendances entre user stories

- **US1 (P1)** : dépend de Foundational uniquement. C'est elle qui crée
  `shelf-photos.controller.ts`, les deux use cases et l'écran — US2/US3/US4 étendent ces mêmes
  fichiers plutôt que d'en créer de nouveaux.
- **US2 (P2)** : étend les fichiers créés par US1 (mêmes chemins). Testable indépendamment une
  fois US1 posée.
- **US3 (P2)** : étend les mêmes fichiers qu'US1/US2 (`scan-stored-shelf-photo.use-case.ts`,
  `shelf-photos.controller.ts`). Chevauche US2 sur le déclencheur (échec 502) mais teste une
  observation différente (persistance vs message affiché) — les deux phases restent nécessaires.
- **US4 (P3)** : étend uniquement `photo-upload-screen.tsx`, indépendante de US2/US3.

### Parallel Opportunities

- Toutes les tâches `[P]` d'une même phase peuvent s'exécuter en parallèle (fichiers distincts).
- Une fois Foundational terminée, US2, US3 et US4 peuvent être prises en parallèle par des
  personnes différentes — chacune sait quels fichiers déjà créés par US1 elle étend.

---

## Parallel Example: User Story 1 (tests)

```bash
# Les 7 tests de la Phase 3 touchent 6 fichiers distincts (T026 et T027 partagent
# photo-upload-screen.spec.tsx, à écrire dans la même passe) : lancer le reste ensemble.
Task: "store-shelf-photo.use-case.spec.ts (T021)"
Task: "scan-stored-shelf-photo.use-case.spec.ts, cas succès (T022)"
Task: "shelf-photos.controller.spec.ts, cas succès (T023)"
Task: "scan-shelf-photo.spec.ts, cas succès (T024)"
Task: "scan-result.spec.tsx (T025)"
Task: "photo-upload-screen.spec.tsx, cas succès + FR-007 (T026, T027)"
```

---

## Implementation Strategy

### MVP First (User Story 1 uniquement)

1. Terminer Setup (Phase 1) et Foundational (Phase 2) — le socle est le plus gros morceau de cette
   feature, car toutes les stories partagent le même flux HTTP et le même schéma.
2. Terminer Phase 3 (US1).
3. **Valider** : quickstart.md scénario 1, sur `docker compose up --build`.

### Livraison incrémentale

1. Setup + Foundational → socle prêt.
2. US1 → valider isolément → MVP démontrable.
3. US2 → valider isolément (fichiers refusés, échec serveur affiché).
4. US3 → valider isolément (persistance, y compris invisible à l'écran).
5. US4 → valider isolément (confort de reprise).
6. Polish.

## Notes

- `[P]` = fichiers différents, aucune dépendance.
- Écrire chaque test et vérifier qu'il échoue avant d'écrire le code qui le fait passer
  (constitution, principe I).
- US2 et US3 partagent un même déclencheur (l'échec 502) mais vérifient deux choses différentes
  (le message affiché vs l'état persisté) — ne pas fusionner leurs tests, la distinction est
  volontaire (spec.md : US3 est « invisible pour l'utilisateur »).
- T027/T042 (FR-007), T043 (SC-004) et T049/T055 (échec réseau distinct) comblent les trois lacunes
  **HIGH** relevées par `/speckit-analyze` le 21/09/2026 — voir son rapport pour le détail du
  raisonnement.
