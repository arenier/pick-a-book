# Data Model: Upload d'une photo d'étagère

Cette feature ne touche à aucune persistance (le scan reste éphémère, cf. `ScanController` et les
Assumptions de `spec.md`). Les « entités » ci-dessous sont des formes de données côté client,
locales à `apps/web/src/features/photo-upload/`, valables pour la durée d'un envoi.

## SelectedPhoto

La photo choisie par l'utilisateur avant envoi (prise à l'instant ou existante).

| Champ | Type | Règle |
|---|---|---|
| `file` | `File` (Web API) | Fourni par l'input natif (`<input type="file">`), jamais construit à la main en dehors des tests. |
| `mediaType` | `string` | `file.type`. Comparé à la liste acceptée (FR-009) avant envoi. |
| `sizeInBytes` | `number` | `file.size`. Comparé à la limite de 20 Mo (FR-009) avant envoi. |

**Règles de validation** (FR-003, FR-009 ; reprennent `ShelfPhoto`, voir research.md §5) :
- `mediaType` DOIT être l'un de `image/jpeg`, `image/png`, `image/webp`, `image/heic`.
- `sizeInBytes` DOIT être strictement positif et ne pas dépasser 20 971 520 octets (20 Mo).
- Une violation produit un message d'erreur affichable, sans appel réseau (FR-003).

## UploadState

L'état affiché à l'écran — une union discriminée, jamais plusieurs branches vraies à la fois
(FR-004, FR-006, FR-007).

| État | Quand | Contenu |
|---|---|---|
| `idle` | Au chargement, ou après « recommencer » (US3) | aucun |
| `uploading` | Entre l'envoi et la réponse du serveur | aucun (empêche un second envoi concurrent, FR-007) |
| `success` | Réponse 200 reçue, avec ou sans livre détecté | `books: DetectedBook[]` (peut être vide → « aucun livre détecté », scénario US1.3) |
| `error` | Validation locale refusée, ou réponse HTTP non 200, ou échec réseau | `message: string` (texte prêt à afficher, distinct pour 400 côté client, 400/502 côté serveur, et échec réseau — FR-006) |

Transitions valides : `idle → uploading → (success | error)`, puis `(success | error) → idle` sur
action « recommencer » (US3, FR-008). Aucune transition ne part de `uploading` vers `uploading`
(FR-007).

## DetectedBook

Un livre détecté, tel que reçu de `POST /scan`. Reflète `DetectedBookDto`
(`libs/recognition/application/src/lib/scan-shelf.dto.ts`) sans l'importer — la frontière
`scope:web` / `scope:api` l'interdit (research.md §5) ; ce type est une copie locale et volontaire
du contrat de réponse, décrite formellement dans `contracts/scan-api.md`.

| Champ | Type | Note |
|---|---|---|
| `author` | `string \| undefined` | Absent quand la tranche ne portait pas d'auteur lisible (ADR 0005, amendement du 2026-09-04) — jamais une chaîne vide affichée telle quelle. |
| `title` | `string` | Toujours présent. |
| `confidence` | `number` | Reçu mais non affiché dans cette feature (spec : « titre et, quand il est connu, leur auteur », pas de score) ; conservé dans le type pour fidélité au contrat, ignoré par l'UI. |
