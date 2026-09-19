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

## Technical Context

**Language/Version**: TypeScript strict (voir `tsconfig.base.json`), Node.js 26.5.1 / cible
navigateur pour le bundle web (React 19).

**Primary Dependencies**: React 19 (déjà en place, `apps/web`) ; aucune dépendance nouvelle —
`fetch` natif pour l'appel HTTP (research.md §3), pas de client HTTP ni de lib de gestion d'état
ajoutés.

**Storage**: N/A — la photo n'est pas persistée par cette feature (éphémère, cf. Assumptions de
`spec.md` et `ScanController`).

**Testing**: Vitest + Testing Library (`@testing-library/react`, `@testing-library/dom`), déjà en
place dans `apps/web` (ADR 0007) ; `fetch` moqué en test, pas de nouvelle dépendance de test
(research.md §6).

**Target Platform**: Navigateur mobile (Safari iOS / Chrome Android en priorité, cf. usage
ressourcerie sur téléphone), dégradation utilisable sur navigateur desktop sans appareil photo
(FR-010).

**Project Type**: Application web (frontend `apps/web` + un ajustement minimal du backend
`apps/api` existant — activation de CORS, aucune nouvelle route).

**Performance Goals**: Aucun objectif de performance propre à cette feature au-delà de SC-001
(retour à l'écran de résultat en moins de 30 s hors temps d'analyse du VLM, déjà mesuré à part —
docs/decisions/0001) ; le rendu de l'écran d'upload lui-même n'a pas de budget de latence dédié.

**Constraints**: Écran utilisable dès 360px de large sans défilement horizontal (SC-004) ; un seul
envoi actif à la fois (FR-007) ; formats et poids acceptés fixés par un contrat déjà existant côté
domaine (`ShelfPhoto` : JPEG/PNG/WebP/HEIC, 20 Mo).

**Scale/Scope**: Un seul écran (US1 à US3), un seul utilisateur à la fois, 20–200 photos/mois
(échelle du projet entier, ADR 0005) — aucune préoccupation de montée en charge propre à cette
feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Application à cette feature |
|---|---|
| I. TDD non-négociable | Chaque unité (validation de fichier, machine d'état d'upload, appel HTTP, composants) s'écrit rouge/vert/refactor. `tasks.md` (`/speckit-tasks`) ordonnera les tests avant le code qu'ils motivent. |
| II. Hexagonal et bounded contexts étanches | Le frontend n'importe aucun package `scope:api` (research.md §5) : le contrat de `POST /scan` est dupliqué localement plutôt qu'importé de `libs/recognition/*`. Aucun contexte n'est traversé côté frontend ; côté API, le seul changement (CORS) est dans `main.ts`, hors des bounded contexts. |
| III. Typage prouvé, jamais affirmé | Pas de `as` dans le nouveau code ; l'état d'upload est une union discriminée (`data-model.md#UploadState`), la réponse HTTP est validée par des type guards avant usage (le JSON de `fetch` est `unknown` à la réception, jamais casté). |
| IV. Outillage unique | Aucun nouvel outil de build/test/lint. Aucune dépendance HTTP ou de gestion d'état ajoutée (research.md §3–4, §6) — choix justifiés par l'absence de second besoin, pas par défaut. |
| V. Français dans la doc, anglais dans le code | Le texte affiché à l'utilisateur (messages, libellés) est en français dans le code de `apps/web` (cohérent avec l'existant, `app.tsx`) ; identifiants, commentaires et messages de commit en anglais. |

Aucune violation : pas d'entrée dans Complexity Tracking.

**Post-Phase 1 re-check**: les artefacts de conception (`data-model.md`, `contracts/scan-api.md`,
`quickstart.md`) ne révèlent aucun nouveau franchissement de frontière ni nouvelle dépendance —
gate toujours au vert.

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

Monorepo Nx existant (ADR 0001). Cette feature est portée par `apps/web`, avec un ajustement
minimal de `apps/api` pour que les deux origines séparées puissent se parler (research.md §2) —
pas de nouvelle lib Nx (research.md §1).

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
            ├── scan-shelf-photo.ts        # fetch POST /scan, mapping réponse -> UploadState
            └── scan-shelf-photo.spec.ts

apps/api/src/
├── main.ts                                # + app.enableCors(...) avec l'origine configurée
└── config/
    ├── environment.ts                     # + lecture optionnelle de WEB_ORIGIN
    └── environment.spec.ts                # + cas WEB_ORIGIN présent/absent
```

**Structure Decision**: feature-slice en dossier sous `apps/web/src/features/photo-upload/`
(research.md §1), organisée par sous-dossier technique interne à la slice (`ui/`, `model/`,
`api/`) — une seule slice existant à ce jour, cette subdivision reste lisible sans lib séparée ;
elle deviendrait le contenu d'une lib Nx le jour où une deuxième app ou une deuxième slice a besoin
d'en réutiliser une partie (ADR 0002). Côté `apps/api`, aucun nouveau module : `main.ts` et
`config/environment.ts` gagnent l'activation CORS et la variable `WEB_ORIGIN`, seuls points de
contact de cette feature avec le backend.

## Complexity Tracking

*Sans objet — aucune violation de la Constitution Check ci-dessus.*
