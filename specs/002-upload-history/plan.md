# Implementation Plan: Historique des photos envoyées

**Branch**: `002-upload-history` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-upload-history/spec.md`

## Summary

L'utilisateur retrouve ses envois passés : une liste antéchronologique avec vignettes et issue de
l'analyse (US1), le détail d'un envoi avec la photo et les livres détectés (US2), et la relance de
l'analyse d'un envoi en échec ou jamais lancé (US3). L'accès reste ouvert, sans authentification.
L'exposition est bornée contre l'abus et la facturation : limite de requêtes par source, plafond
quotidien d'analyses, vignettes allégées (FR-014 à FR-016).

Approche technique :

- **Back** : tout reste dans le contexte `recognition`, qui possède déjà les envois (spec 001).
  - Trois routes de lecture : `GET /shelf-photos` (page par curseur), `GET /shelf-photos/{id}` et
    les deux images (`/photo`, `/thumbnail`), relayées depuis le bucket privé avec un cache
    navigateur `immutable`.
  - Le `POST …/scan` existant accepte aussi un envoi `failed` : c'est la relance.
  - Chaque analyse réserve d'abord une **tentative** en base, de façon atomique. Cette réservation
    fait respecter le plafond quotidien (50 par défaut, jour de Paris) et empêche deux analyses
    simultanées du même envoi (research.md §8).
  - La limite par source est un `@nestjs/throttler` en mémoire dans `apps/api` (research.md §9).
- **Vignettes** : produites par le navigateur à l'envoi (480 px, JPEG), jointes au `POST /shelf-photos`,
  validées, stockées et référencées dans `uploads` comme tout fichier du bucket (research.md §5, §6).
  Ce choix couvre le HEIC des iPhone, sans dépendance native ni calcul serveur.
- **Front** : nouvelle slice `upload-history`, et routage par fragment d'URL (`#/envois`,
  `#/envois/{id}`) dans le shell. C'est la seule forme de routage compatible avec le bucket statique
  qui sert le front (research.md §2).

## Technical Context

**Language/Version**: TypeScript strict. Node.js 26.5.1 pour l'API. Navigateur (React 19) pour le
front.

**Primary Dependencies**: NestJS, Drizzle + `pg`, `@google-cloud/storage`, déjà en place. Une seule
dépendance nouvelle : **`@nestjs/throttler`** dans `apps/api` (research.md §9). Côté web, aucune :
routage par hash maison (research.md §2), vignettes par `createImageBitmap` et canvas (research.md §5),
`fetch` natif.

**Storage**: Postgres (Neon) et bucket, déjà câblés par la spec 001. Il faut une migration :
- `uploads.source_upload_id` et `original_filename` nullable, pour les vignettes ;
- nouvelle table `scan_attempts` ;
- un index de pagination.

Détail dans [data-model.md](data-model.md), section *Contexte `recognition` — infrastructure*.

**Testing**: Vitest partout (ADR 0007).
- Use cases (`application`) : contre les doubles en mémoire existants (`testing/in-memory-*`),
  étendus.
- Adapters (`infrastructure`) : contre le Postgres et l'émulateur de bucket du `docker-compose.yml`,
  concurrence de la réservation de tentative incluse.
- Contrôleur : par les tests HTTP (`shelf-photos.http.spec.ts`).
- Front : Testing Library, `fetch` injecté.
- La réduction d'image, qui dépend du navigateur, est isolée derrière une fonction injectable. Elle
  se valide à la main (quickstart, scénario 7).

**Target Platform**: API sur Cloud Run (512 Mo, 3 instances au plus). Front en fichiers statiques sur
bucket public, cible Safari iOS et Chrome Android, bureau utilisable.

**Project Type**: Application web. Extension d'`apps/api` et de `libs/recognition/*`, nouvelle
feature-slice dans `apps/web`.

**Performance Goals**: première page de l'historique affichée en moins de 2 s, jusqu'à plusieurs
centaines d'envois, avec moins de 5 Mo de vignettes par page (SC-002). Retrouver un envoi en moins
de 20 s (SC-001).

**Constraints**:
- **Coût borné** : au plus `DAILY_SCAN_LIMIT` analyses par jour, envois et relances confondus
  (FR-015, SC-006).
- **Limite par source** : 300 req/min en lecture, 10 req/min en écriture (FR-014).
- **Aucune fuite** du nom de fichier d'origine, de la clé du bucket ni du propriétaire (FR-009).
- **Au plus un résultat abouti par photo** (FR-011).
- **Écrans utilisables dès 360 px** (SC-004).
- **Routes sans réécriture serveur**, puisque le front est un bucket statique.

**Scale/Scope**: un utilisateur, 20 à 200 photos par mois, soit quelques milliers d'envois en
quelques années. Deux écrans nouveaux, une retouche de l'écran d'envoi.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Application à cette feature |
|---|---|
| I. TDD non-négociable | Chaque unité s'écrit rouge/vert/refactor, test d'abord. Côté domaine et application : `ShelfPhotoThumbnail`, les transitions `pending/failed → completed`, les trois use cases de lecture, les extensions de `StoreShelfPhotoUseCase` et `ScanStoredShelfPhotoUseCase`. Côté adapters, contre la vraie techno : pagination par curseur, réservation atomique sous concurrence, plafond au changement de jour de Paris, vignette dans le bucket. Côté API : garde de limite, traduction des nouvelles erreurs. Côté front : hook de routage, états de l'historique et du détail, relance, distinction des 429. La migration se valide par les specs de l'adapter, qui tournent sur le schéma migré. |
| II. Hexagonal et bounded contexts étanches | Rien ne sort de `recognition` : pas d'orchestrateur (ADR 0003), pas de nouveau contexte (research.md §1). Les nouveaux ports restent dans `domain` (`list`, `startAttempt`, `storeThumbnail`, `retrieveThumbnail`). Le SQL (verrou consultatif, curseur, `jsonb_array_length`) reste dans `infrastructure`. Le contrôleur ne manipule que des DTO de frontière (data-model.md). La limite de requêtes est une préoccupation HTTP d'`apps/api`, hors des contextes. Côté web, les deux slices ne s'importent pas : le shell porte la navigation, et la slice historique a ses copies locales du contrat (research.md §11). |
| III. Typage prouvé, jamais affirmé | Pas de `as`. Chaque réponse JSON est vérifiée par un type guard côté front. Le curseur est décodé et validé, jamais supposé bien formé (400 sinon). La vignette est prouvée par le value object `ShelfPhotoThumbnail` avant tout stockage. `outcome` est une union fermée, avec `bookCount` et `books` présents si et seulement si `completed`, comme `detectedBooks` aujourd'hui. Les nouveaux paramètres de requête (`limit`) sont validés, pas convertis à l'aveugle. |
| IV. Outillage unique | Aucun outil de build, de test ou de lint nouveau. `@nestjs/throttler` est une dépendance d'exécution de l'écosystème Nest déjà acté, pas un outillage concurrent. Aucune dépendance native (`sharp` écarté, research.md §5) et aucun routeur (research.md §2). |
| V. Français dans la doc, anglais dans le code | Textes affichés en français dans `apps/web`. Identifiants, commentaires, logs, erreurs et descriptions de tests en anglais. Les codes d'erreur stables (`DAILY_SCAN_QUOTA_EXCEEDED`…) sont du code, donc en anglais (research.md §10). |

Aucune violation, donc pas d'entrée dans Complexity Tracking.

**ADR** : aucun nouvel ADR n'est requis. La spec demandait de vérifier si la protection contre l'abus
était transverse. Elle ne l'est pas : c'est une garde interne à `apps/api`, sans infrastructure
nouvelle (research.md §9). Passer à Cloud Armor ou à un stockage partagé de la limite le serait, et
passerait alors par un ADR.

**Post-Phase 1 re-check** : `data-model.md` et le contrat ne franchissent aucune frontière nouvelle.
Les deux ports étendus restent dans `domain`, les DTO ne portent aucun objet de domaine, et la
migration reste dans `recognition-infrastructure`. Le gate reste au vert.

## Project Structure

### Documentation (this feature)

```text
specs/002-upload-history/
├── spec.md
├── plan.md                              # ce fichier
├── research.md                          # Phase 0
├── data-model.md                        # Phase 1
├── quickstart.md                        # Phase 1
├── contracts/
│   └── shelf-photos-history-api.md      # Phase 1
├── checklists/
│   └── requirements.md
└── tasks.md                             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
libs/recognition/domain/src/lib/
├── shelf-photo-thumbnail.ts               # nouveau value object (JPEG|PNG|WebP, ≤ 256 Ko)
├── shelf-photo-thumbnail.spec.ts
├── invalid-shelf-photo-thumbnail.error.ts
├── shelf-scan-in-progress.error.ts
├── daily-scan-quota-exceeded.error.ts
├── shelf-photo-thumbnail-not-found.error.ts
├── shelf-scan-repository.port.ts          # + thumbnail, list/ShelfScanPage, startAttempt/ScanAttemptPolicy
└── shelf-photo-storage.port.ts            # + storeThumbnail, retrieveThumbnail

libs/recognition/application/src/lib/
├── shelf-scan-history.dto.ts              # ShelfScanSummaryDto, ShelfScanPageDto, ShelfScanDetailDto, StoredImageDto
├── shelf-scan-cursor.ts                   # encode/décode le curseur opaque (+ spec)
├── list-shelf-scans.use-case.ts           # + spec
├── get-shelf-scan.use-case.ts             # + spec
├── get-shelf-photo-image.use-case.ts      # photo | thumbnail (+ spec)
├── store-shelf-photo.use-case.ts          # + vignette optionnelle, ignorée si invalide
├── scan-stored-shelf-photo.use-case.ts    # + startAttempt, relance depuis failed
└── testing/in-memory-*.ts                 # doubles étendus (list, startAttempt, vignettes)

libs/recognition/infrastructure/src/lib/
├── drizzle/schema.ts                      # uploads.source_upload_id, original_filename nullable, scan_attempts, index
├── drizzle/migrations/0001_*.sql          # générée par `yarn db:generate`
├── drizzle-shelf-scan-repository.adapter.ts       # list (curseur), startAttempt (verrou consultatif), vignette en left join
├── drizzle-shelf-scan-repository.adapter.spec.ts  # contre Postgres : pagination, concurrence, plafond, jour de Paris
├── gcs-shelf-photo-storage.adapter.ts             # + storeThumbnail / retrieveThumbnail
└── gcs-shelf-photo-storage.adapter.spec.ts        # contre l'émulateur

apps/api/src/
├── main.ts                                # + trust proxy (research.md §9)
├── app/app.module.ts                      # + ThrottlerModule, garde globale, /health exempté
├── config/environment.ts                  # + DAILY_SCAN_LIMIT (optionnel, défaut 50, entier ≥ 1) (+ spec)
├── http/too-many-requests.filter.ts       # 429 throttler → corps avec code TOO_MANY_REQUESTS (+ spec)
└── recognition/
    ├── shelf-photos.controller.ts         # + GET liste, GET détail, GET photo, GET thumbnail ; champ multipart thumbnail ; palier "write"
    ├── shelf-photos.http.spec.ts          # + nouvelles routes, en-têtes de cache, 429, 409 à code
    ├── recognition-exception.filter.ts    # + ShelfScanInProgress, DailyScanQuotaExceeded, ThumbnailNotFound, InvalidShelfScanCursor ; codes stables
    └── recognition.module.ts              # + trois use cases, politique de tentative

apps/web/src/
├── app/
│   ├── app.tsx                            # shell : routage, navigation entre slices, historique gardé monté
│   ├── use-hash-route.ts                  # + spec
│   └── routes.ts                          # #/, #/envois, #/envois/{id}
└── features/
    ├── photo-upload/
    │   ├── model/make-thumbnail.ts        # createImageBitmap → canvas → JPEG 480 px ; undefined si échec
    │   └── api/scan-shelf-photo.ts        # + champ thumbnail ; 429 distingués par code (+ spec)
    └── upload-history/                    # nouvelle slice
        ├── api/history-api.ts             # listShelfScans, getShelfScan, rescanShelfScan, URLs d'images (+ spec)
        ├── model/history-entry.ts         # HistoryEntry, issues FR-005, gardes de type
        ├── model/history-state.ts         # HistoryState, EntryDetailState
        └── ui/
            ├── history-screen.tsx         # liste, défilement infini + « Afficher plus », restauration de position (+ spec)
            ├── history-entry-card.tsx     # vignette ou indicateur neutre, date, issue (+ spec)
            ├── entry-detail-screen.tsx    # photo, livres, relance, introuvable (+ spec)
            ├── detected-books-list.tsx    # copie locale (research.md §11)
            └── upload-history.module.css

.env.example                               # + DAILY_SCAN_LIMIT
```

**Structure Decision** : le monorepo reste tel quel, sans nouveau projet Nx. Le back étend les trois
couches de `recognition` et son module de composition. Le front ajoute une feature-slice en dossier,
`upload-history`, sur le modèle de `photo-upload`. Le shell `app/` porte le routage et la navigation
entre slices, puisqu'aucune slice n'importe l'autre.

## Prérequis hors scope, à signaler

1. **ADR 0011 et 0012 proposés.** S'ils sont acceptés avant l'implémentation, les nouveaux écrans
   passent par i18next et le design system (research.md §12).
2. **Relance après passage de minuit.** Une photo refusée pour quota reste `pending`. Rien ne la
   relance d'elle-même : la relance est manuelle, depuis l'historique (spec, FR-015).
3. **La prod ne peut pas encore conserver de photos.** `infra/envs/prod/main.tf` ne crée pas de
   bucket de photos et ne passe pas `BUCKET_NAME` à l'API. Or l'API l'exige au démarrage depuis la
   spec 001. Ce manque vient de la spec 001, pas de celle-ci, mais il bloque aussi le déploiement de
   l'historique. Il faut une issue dédiée pour : le bucket privé de photos, le droit
   `objectAdmin` (lecture et écriture) du compte de service de l'API, et les variables `BUCKET_NAME`
   et `DAILY_SCAN_LIMIT`. Le compte de service n'a aujourd'hui que `objectCreator` sur le bucket de
   sauvegardes.

## Complexity Tracking

*Sans objet : aucune violation de la Constitution Check.*
