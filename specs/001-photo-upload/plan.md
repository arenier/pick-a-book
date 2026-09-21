# Implementation Plan: Upload d'une photo d'étagère

**Branch**: `001-photo-upload` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-photo-upload/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Premier écran de `apps/web` : l'utilisateur prend ou choisit une photo d'étagère sur son
téléphone, l'envoie au `POST /scan` déjà exposé par `apps/api`, et voit la liste des livres
détectés (ou un message d'absence de livre, ou d'erreur). Approche technique : une feature-slice
en dossier dans `apps/web` (pas de nouvelle lib Nx), `fetch` natif en `multipart/form-data` vers
l'endpoint existant, CORS activé côté API pour que les deux origines séparées (ADR 0004 : web sur
un bucket, api sur Cloud Run) puissent se parler.

**Extension du 21/09/2026** (US3) : côté `apps/api`, la photo est désormais conservée dans le
bucket et son résultat enregistré en Postgres — livres détectés en cas d'analyse aboutie, statut
d'échec sinon — chaque fois que le service de reconnaissance répond, y compris en échec. Reste
dans le contexte `recognition`. C'est la première persistance du projet : `DATABASE_URL` était déjà
validé au démarrage (`environment.ts`) mais jamais utilisé jusqu'ici.

**Révision du même jour** (deuxième échange) : plutôt qu'un unique endpoint synchrone
envoi+analyse, l'API expose désormais **deux** endpoints — `POST /shelf-photos` (conserve la
photo, répond avec un `id`) puis `POST /shelf-photos/{id}/scan` (déclenche l'analyse sur la photo
déjà conservée) — pour que la photo ne dépende pas de la réussite de l'appel VLM (le plus long,
~27 s, le plus faillible) pour être conservée (research.md §7). `ScanShelfUseCase` est scindé en
`StoreShelfPhotoUseCase` et `ScanStoredShelfPhotoUseCase`, tous deux dans `recognition`, derrière
deux ports (`ShelfPhotoStoragePort`, `ShelfScanRepositoryPort`). Le frontend enchaîne les deux
appels lui-même, sans que cela change rien pour l'utilisateur (US1 inchangée) ni pour `spec.md`
(FR-014 documente uniquement la garantie que cela permet, pas le découpage lui-même).

## Technical Context

**Language/Version**: TypeScript strict (voir `tsconfig.base.json`), Node.js 26.5.1 / cible
navigateur pour le bundle web (React 19).

**Primary Dependencies**: React 19 (déjà en place, `apps/web`) ; côté web, aucune dépendance
nouvelle — `fetch` natif pour l'appel HTTP (research.md §3). Côté `apps/api`, deux dépendances
nouvelles, nommées par les ADR 0004/0006 mais jamais encore installées : `@google-cloud/storage`
(bucket) et `drizzle-orm` + `pg` (Postgres, driver et ORM déjà actés par l'ADR 0006 — « l'ORM est
Drizzle », question ouverte de l'ADR).

**Storage**: bucket d'objets (photo, clé opaque) et Postgres (référence + résultat), l'un et
l'autre déjà prévus par ADR 0004/0006 pour cet usage mais non encore câblés dans le code
(`DATABASE_URL` validé au démarrage depuis le début, jamais consommé). Voir research.md §7–9 et
`data-model.md#ShelfScanRecord`.

**Testing**: Vitest + Testing Library (`@testing-library/react`, `@testing-library/dom`), déjà en
place dans `apps/web` (ADR 0007) ; `fetch` moqué en test, pas de nouvelle dépendance de test
(research.md §6). Côté `apps/api`, les deux nouveaux adapters (`recognition-infrastructure`) se
testent contre la vraie techno (convention du projet : « les adapters se testent contre la vraie
techno ») — Postgres du `docker-compose.yml` existant, émulateur de bucket ajouté par cette feature
(research.md §9).

**Target Platform**: Navigateur mobile (Safari iOS / Chrome Android en priorité, cf. usage
ressourcerie sur téléphone), dégradation utilisable sur navigateur desktop sans appareil photo
(FR-010).

**Project Type**: Application web (frontend `apps/web` + extension du backend `apps/api` /
`libs/recognition/*` existant — activation de CORS, persistance de la photo et de son résultat,
et un endpoint HTTP scindé en deux — `POST /shelf-photos` puis `POST /shelf-photos/{id}/scan` —
research.md §7).

**Performance Goals**: Aucun objectif de performance propre à cette feature au-delà de SC-001
(retour à l'écran de résultat en moins de 30 s hors temps d'analyse du VLM, déjà mesuré à part —
docs/decisions/0001) ; le rendu de l'écran d'upload lui-même n'a pas de budget de latence dédié.

**Constraints**: Écran utilisable dès 360px de large sans défilement horizontal (SC-004) ; un seul
envoi actif à la fois (FR-007) ; formats et poids acceptés fixés par un contrat déjà existant côté
domaine (`ShelfPhoto` : JPEG/PNG/WebP/HEIC, 20 Mo) ; une photo conservée n'a jamais deux
enregistrements de résultat (FR-012), et une photo refusée avant analyse n'en a aucun (FR-013).

**Scale/Scope**: Un seul écran (US1, US2, US4), un enregistrement de conservation invisible pour
l'utilisateur (US3), un seul utilisateur à la fois, 20–200 photos/mois (échelle du projet entier,
ADR 0005) — aucune préoccupation de montée en charge propre à cette feature ; aucune politique de
rétention (Assumptions de `spec.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Application à cette feature |
|---|---|
| I. TDD non-négociable | Chaque unité (validation de fichier, machine d'état d'upload, appel HTTP en deux temps, composants côté web ; `StoreShelfPhotoUseCase`, `ScanStoredShelfPhotoUseCase`, les deux nouveaux adapters côté api) s'écrit rouge/vert/refactor. `tasks.md` (`/speckit-tasks`) ordonnera les tests avant le code qu'ils motivent. Les deux nouveaux adapters (bucket, Postgres) se testent contre la vraie techno (convention du projet), pas sur des doubles — Postgres et l'émulateur de bucket du `docker-compose.yml`. |
| II. Hexagonal et bounded contexts étanches | Le frontend n'importe aucun package `scope:api` (research.md §5) : le contrat des deux endpoints est dupliqué localement plutôt qu'importé de `libs/recognition/*`. Aucun contexte n'est traversé — la persistance de la photo et de son résultat reste entièrement dans `recognition` (c'est ce contexte qui produit `ShelfPhoto` et `DetectedBook`, US3 n'introduit aucune notion nouvelle empruntée à `bibliography` ou `curation`), derrière deux nouveaux ports domain (`ShelfPhotoStoragePort`, `ShelfScanRepositoryPort`) implémentés dans `recognition-infrastructure` — schéma et client Postgres y restent, jamais dans `domain` ou `application` (convention « le SQL, le schéma et les migrations restent dans infrastructure »). Deux use cases plutôt qu'un ne créent pas d'orchestrateur `apps/api` : ADR 0003 ne s'applique qu'au croisement de contextes, absent ici (research.md §7). Côté API, l'autre changement (CORS) est dans `main.ts`, hors des bounded contexts. |
| III. Typage prouvé, jamais affirmé | Pas de `as` dans le nouveau code ; l'état d'upload est une union discriminée (`data-model.md#UploadState`), la réponse HTTP est validée par des type guards avant usage (le JSON de `fetch` est `unknown` à la réception, jamais casté). Côté api, `ShelfScanRecord.status` est une union fermée `pending \| completed \| failed` (`data-model.md#ShelfScanRecord`) plutôt qu'un objet à champs optionnels contradictoires, et la transition `pending → completed \| failed` est imposée par `ScanStoredShelfPhotoUseCase` (409 sinon), jamais par un champ qu'on pourrait modifier deux fois. |
| IV. Outillage unique | Aucun nouvel outil de build/test/lint. Aucune dépendance HTTP ou de gestion d'état ajoutée côté web (research.md §3–4, §6). Côté api, `@google-cloud/storage` et `drizzle-orm`/`pg` sont des dépendances nouvelles, mais pas un choix local concurrent d'un outillage acté : ADR 0004 nomme le bucket, ADR 0006 nomme Postgres **et** Drizzle explicitement — cette feature les câble pour la première fois, elle n'arbitre rien. |
| V. Français dans la doc, anglais dans le code | Le texte affiché à l'utilisateur (messages, libellés) est en français dans le code de `apps/web` (cohérent avec l'existant, `app.tsx`) ; identifiants, commentaires et messages de commit en anglais, y compris dans les nouveaux adapters. |

Aucune violation : pas d'entrée dans Complexity Tracking. Persister la photo n'ouvre pas de
nouvel ADR : ADR 0004 (bucket pour « les images d'étagère ») et ADR 0006 (Postgres pour « historique
des scans », Drizzle nommé) l'avaient déjà anticipé — cette feature l'exécute, elle ne tranche
rien de nouveau.

**Post-Phase 1 re-check**: les artefacts de conception mis à jour (`data-model.md#ShelfScanRecord`,
`research.md` §7–9) ne révèlent aucun nouveau franchissement de frontière ni décision hors du
scope déjà couvert par les ADR — gate toujours au vert.

## Project Structure

### Documentation (this feature)

```text
specs/001-photo-upload/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── scan-api.md      # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Monorepo Nx existant (ADR 0001). Cette feature est portée par `apps/web` pour l'écran, et étend
`libs/recognition/*` + `apps/api` pour la persistance (research.md §2, §7–9) — pas de nouvelle lib
Nx côté web (research.md §1), pas de nouveau bounded context côté api (Constitution Check ci-dessus).

```text
apps/web/src/
├── app/                                  # existant, inchangé dans sa fonction (monte la feature)
│   └── app.tsx
└── features/
    └── photo-upload/                     # nouvelle feature-slice (dossier, pas un projet Nx)
        ├── ui/
        │   ├── photo-upload-screen.tsx    # écran complet : sélection, envoi, résultat
        │   ├── photo-upload-screen.spec.tsx
        │   ├── photo-picker.tsx           # <input type="file" accept="..." capture="environment">
        │   ├── scan-result.tsx            # liste des livres / "aucun livre" / message d'erreur
        │   └── scan-result.spec.tsx
        ├── model/
        │   ├── upload-state.ts            # union discriminée idle|uploading|success|error
        │   ├── photo-constraints.ts       # formats + poids acceptés (research.md §5)
        │   ├── photo-constraints.spec.ts
        │   └── detected-book.ts           # type local, reflète contracts/scan-api.md
        └── api/
            ├── scan-shelf-photo.ts        # enchaîne POST /shelf-photos puis POST /shelf-photos/{id}/scan (research.md §3, §7)
            └── scan-shelf-photo.spec.ts

libs/recognition/domain/src/lib/
├── shelf-photo-storage.port.ts            # StoredPhoto, ShelfPhotoStoragePort (store + retrieve, + injection token)
├── shelf-scan-repository.port.ts          # ShelfScanId, ShelfScanRecord, ShelfScanRepositoryPort
└── shelf-scan-repository.port.spec.ts     # forme des types uniquement (pas de logique à tester ici)

libs/recognition/application/src/lib/
├── store-shelf-photo.use-case.ts          # valide, stocke, crée le ShelfScanRecord `pending`, renvoie { id }
├── store-shelf-photo.use-case.spec.ts
├── scan-stored-shelf-photo.use-case.ts    # relit le record + la photo, appelle ShelfScannerPort, marque completed|failed
└── scan-stored-shelf-photo.use-case.spec.ts  # cas : succès, échec 502, id inconnu, déjà traité (409)

libs/recognition/infrastructure/src/lib/
├── gcs-shelf-photo-storage.adapter.ts      # implémente ShelfPhotoStoragePort : store + retrieve (@google-cloud/storage)
├── gcs-shelf-photo-storage.adapter.spec.ts # contre l'émulateur de bucket (docker-compose)
├── drizzle/
│   ├── schema.ts                          # table shelf_scans (data-model.md#ShelfScanRecord)
│   └── migrations/                        # générées par drizzle-kit
├── drizzle-shelf-scan-repository.adapter.ts     # implémente ShelfScanRepositoryPort
└── drizzle-shelf-scan-repository.adapter.spec.ts  # contre le Postgres du docker-compose existant

apps/api/src/
├── main.ts                                # + app.enableCors(...) avec l'origine configurée
├── config/
│   ├── environment.ts                     # + WEB_ORIGIN (optionnel), + BUCKET_NAME (requis)
│   └── environment.spec.ts                # + cas WEB_ORIGIN, BUCKET_NAME
└── recognition/
    ├── shelf-photos.controller.ts         # remplace scan.controller.ts : POST /shelf-photos, POST /shelf-photos/:id/scan
    ├── shelf-photos.controller.spec.ts
    ├── recognition.module.ts              # + binding des deux nouveaux ports, des deux use cases
    └── shelf-scan-archive.factory.ts       # construit les clients GCS/Postgres depuis Environment

docker-compose.yml                         # + service émulateur de bucket (research.md §9)
.env.example                                # + BUCKET_NAME, + STORAGE_EMULATOR_HOST (dev), + WEB_ORIGIN
```

**Structure Decision**: feature-slice en dossier sous `apps/web/src/features/photo-upload/`
(research.md §1), organisée par sous-dossier technique interne à la slice (`ui/`, `model/`,
`api/`) — une seule slice existant à ce jour, cette subdivision reste lisible sans lib séparée ;
elle deviendrait le contenu d'une lib Nx le jour où une deuxième app ou une deuxième slice a besoin
d'en réutiliser une partie (ADR 0002). Côté backend, la persistance reste dans `recognition` : deux
ports supplémentaires en `domain`, deux adapters en `infrastructure`, et l'endpoint synchrone
d'origine scindé en deux use cases (`StoreShelfPhotoUseCase`, `ScanStoredShelfPhotoUseCase`) et
deux routes (`shelf-photos.controller.ts`, qui remplace `scan.controller.ts`) — research.md §7. Pas
de nouveau module, pas d'orchestrateur `apps/api` puisqu'aucun contexte n'est traversé (ADR 0003 ne
s'applique pas ici). `apps/api` gagne en plus l'activation CORS, la variable `WEB_ORIGIN`, et le
câblage des deux nouveaux adapters et use cases dans `recognition.module.ts`.

## Complexity Tracking

*Sans objet — aucune violation de la Constitution Check ci-dessus.*
