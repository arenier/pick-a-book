# Data Model: Upload d'une photo d'étagère

Les entités **SelectedPhoto**, **UploadState** et **DetectedBook** ci-dessous sont des formes de
données côté client, locales à `apps/web/src/features/photo-upload/`, valables pour la durée d'un
envoi — le frontend lui-même ne persiste rien. **ShelfScanRecord** (ajoutée le 21/09/2026, US3) est
en revanche durable côté backend : c'est la trace conservée d'une analyse, dans `recognition`
(`libs/recognition/*`), indépendante de la durée de vie d'un onglet.

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
| `idle` | Au chargement, ou après « recommencer » (US4) | aucun |
| `uploading` | Entre l'envoi et la réponse du serveur | aucun (empêche un second envoi concurrent, FR-007) |
| `success` | Réponse 200 reçue, avec ou sans livre détecté | `books: DetectedBook[]` (peut être vide → « aucun livre détecté », scénario US1.3) |
| `error` | Validation locale refusée, ou réponse HTTP non 200, ou échec réseau | `message: string` (texte prêt à afficher, distinct pour 400 côté client, 400/502 côté serveur, et échec réseau — FR-006) |

Transitions valides : `idle → uploading → (success | error)`, puis `(success | error) → idle` sur
action « recommencer » (US4, FR-008). Aucune transition ne part de `uploading` vers `uploading`
(FR-007). Cet état est indépendant de `ShelfScanRecord` ci-dessous : la persistance côté backend
n'est jamais reflétée dans l'UI (US3 est invisible pour l'utilisateur), et un état `error` (panne du
service de reconnaissance) correspond côté backend à un `ShelfScanRecord` de statut `failed`, pas à
une absence d'enregistrement.

## DetectedBook

Un livre détecté, tel que reçu de `POST /shelf-photos/{id}/scan` (research.md §7). Reflète `DetectedBookDto`
(`libs/recognition/application/src/lib/scan-shelf.dto.ts`) sans l'importer — la frontière
`scope:web` / `scope:api` l'interdit (research.md §5) ; ce type est une copie locale et volontaire
du contrat de réponse, décrite formellement dans `contracts/scan-api.md`.

| Champ | Type | Note |
|---|---|---|
| `author` | `string \| undefined` | Absent quand la tranche ne portait pas d'auteur lisible (ADR 0005, amendement du 2026-09-04) — jamais une chaîne vide affichée telle quelle. |
| `title` | `string` | Toujours présent. |
| `confidence` | `number` | Reçu mais non affiché dans cette feature (spec : « titre et, quand il est connu, leur auteur », pas de score) ; conservé dans le type pour fidélité au contrat, ignoré par l'UI. |

## ShelfScanRecord *(backend, `libs/recognition/*`, ajouté le 21/09/2026 — US3 ; révisé le même jour à deux reprises — deux endpoints (research.md §7), puis isolation par utilisateur et référence complète du fichier (research.md §10))*

L'enregistrement durable d'une photo soumise (FR-011, FR-012, FR-015) — créé dès l'envoi, avant
même que l'analyse soit lancée. Table Postgres `shelf_scans`, détail complet et rationale du
schéma dans `research.md` §8.

| Champ | Type | Règle |
|---|---|---|
| `id` | `ShelfScanId` (`uuid`) | Généré à la création par `StoreShelfPhotoUseCase` (`crypto.randomUUID()`), sert aussi de nom (sans extension) de l'objet dans le bucket (research.md §9, §10) et d'identifiant de ressource HTTP (`/shelf-photos/{id}/scan`) — un seul identifiant pour la photo, son enregistrement, et la ressource exposée au frontend. **Jamais le nom de fichier d'origine** (FR-015). |
| `ownerId` | `string` | Segment « utilisateur » de `photoBucketKey`. Une valeur fixe pour l'instant (`OWNER_ID`, research.md §10) — pas un compte réel, aucune authentification introduite par cette feature. |
| `photoBucketKey` | `string` | `{ownerId}/shelf-photos/{id}` (research.md §9, §10). |
| `photoMediaType` | `ShelfPhotoMediaType` | Le type déjà validé par `ShelfPhoto` (`image/jpeg` \| `image/png` \| `image/webp` \| `image/heic`). |
| `photoSizeBytes` | `number` | Poids de la photo en octets (`bytes.byteLength`, ≤ 20 Mo déjà garanti par `ShelfPhoto`). |
| `originalFilename` | `string` | Le nom de fichier tel que fourni par le navigateur, gardé pour référence uniquement (research.md §10) — jamais utilisé pour construire `photoBucketKey`, jamais renvoyé par un endpoint HTTP (FR-015). |
| `status` | `'pending' \| 'completed' \| 'failed'` | `pending` posé par `StoreShelfPhotoUseCase` à la création. `completed`/`failed` posés par `ScanStoredShelfPhotoUseCase` une fois le scanner appelé — jamais l'inverse : un enregistrement ne repasse jamais à `pending`. |
| `detectedBooks` | `DetectedBook[] \| undefined` | Présent si et seulement si `status === 'completed'` (y compris un tableau vide, « aucun livre détecté ») ; `undefined` pour `pending` et `failed`. |
| `createdAt` | `Date` | Horodatage de la **création** de l'enregistrement, donc du stockage de la photo — pas de l'issue de l'analyse (research.md §8). |

**Règles** :
- Un `ShelfScanRecord` n'existe QUE si l'envoi de la photo a été accepté par
  `StoreShelfPhotoUseCase` (FR-011). Un fichier refusé avant cet envoi (US2, FR-009) ne produit
  aucun `ShelfScanRecord` (FR-013) : la validation de `ShelfPhoto` échoue avant que le port de
  stockage soit appelé.
- Un `ShelfScanRecord` peut rester `pending` indéfiniment si la deuxième requête
  (`/shelf-photos/{id}/scan`) n'arrive jamais — coupure réseau entre les deux appels (Edge case de
  `spec.md`, FR-014). Ce n'est pas un état d'erreur : la photo est bien conservée (FR-011 est
  respecté), seule l'analyse n'a pas eu lieu. Aucune reprise automatique dans le scope de cette
  feature.
- `ScanStoredShelfPhotoUseCase` refuse (409) de traiter un enregistrement dont le statut n'est
  déjà plus `pending` — protège contre un second appel accidentel qui écraserait un résultat déjà
  posé ou relancerait un appel VLM déjà payé (research.md §7).
- `originalFilename` ne participe à aucune décision de stockage ou de routage — un nom de fichier
  imprévisible, voire malicieux (`../..`, un caractère de contrôle) ne doit jamais atteindre un
  chemin de bucket ou une commande : seul `id` (généré par l'application) nomme l'objet (FR-015).
- Aucune politique de rétention ni de purge (Assumptions de `spec.md`) : un `ShelfScanRecord`,
  une fois créé, n'est jamais supprimé par cette feature — seuls `status` et `detectedBooks`
  peuvent être posés une fois, de `pending` vers `completed` ou `failed`.
