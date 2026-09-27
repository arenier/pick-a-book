# Data Model: Historique des photos envoyées

Cette feature ne crée pas de donnée métier nouvelle : elle relit les `ShelfScanRecord` que la
spec 001 conserve ([`specs/001-photo-upload/data-model.md`](../001-photo-upload/data-model.md), section *ShelfScanRecord*).
Elle ajoute trois choses :

- une **vignette** optionnelle par envoi (research.md §5, §6) ;
- des **tentatives d'analyse**, pour la relance et le plafond quotidien (research.md §8) ;
- des formes de lecture : une page d'historique, le détail d'un envoi.

Les noms suivent le code existant (`ShelfScanRecord`, `ShelfScanId`). « Envoi » est le mot de la
spec, `ShelfScan` celui du code : c'est le même objet.

## Contexte `recognition` — domaine (`libs/recognition/domain`)

### ShelfPhotoThumbnail *(nouveau value object)*

La vignette d'une photo, produite par le navigateur (research.md §5).

| Champ | Type | Règle |
|---|---|---|
| `bytes` | `Uint8Array` | Non vide, **256 Ko au plus** (262 144 octets). |
| `mediaType` | `'image/jpeg' \| 'image/png' \| 'image/webp'` | Pas de HEIC : une vignette doit pouvoir s'afficher dans tout navigateur. |

`ShelfPhotoThumbnail.of(bytes, mediaType)` lève `InvalidShelfPhotoThumbnail` sinon. Cette erreur
n'est jamais traduite en HTTP : le use case d'envoi l'attrape et ignore la vignette (research.md §5).

### ShelfScanRecord *(étendu)*

Même union discriminée sur `status` qu'aujourd'hui (`pending | completed | failed`), plus un champ :

| Champ | Type | Règle |
|---|---|---|
| `thumbnail` | `StoredThumbnail \| undefined` | Présent si et seulement si une vignette valide a été reçue à l'envoi. Absent pour tous les envois antérieurs à cette feature. |

`StoredThumbnail` = `{ bucketKey: string; mediaType; sizeBytes: number }`, avec
`bucketKey = {ownerId}/shelf_photo_thumbnail/{id}`. L'`id` est celui de la photo : une vignette
n'a pas d'identité propre hors d'`infrastructure`.

**Transitions de `status`** (révisées pour la relance, FR-011) :

```
pending ──► completed   (définitif)
   │
   └────► failed ──► completed   (relance réussie, définitif)
            ▲  │
            └──┘                 (relance à nouveau en échec)
```

`completed` n'a aucune transition sortante : une photo ne porte jamais plus d'un résultat abouti
(FR-011). `pending` et `failed` sont tous deux « analysables ».

### ScanAttempt *(nouveau, interne au port)*

Une tentative d'analyse, réservée avant l'appel au `ShelfScannerPort` (research.md §8). Le domaine
ne la manipule pas comme entité : il n'en voit que les effets, via deux erreurs du port.

| Champ | Type | Règle |
|---|---|---|
| `shelfScanId` | `ShelfScanId` | L'envoi analysé. |
| `startedAt` | `Date` | Posé à la réservation. Sert au plafond (compté depuis minuit, heure de Paris) et au bail (5 min). |
| `finishedAt` | `Date \| undefined` | Posé par `markCompleted` ou `markFailed`. Absent tant que l'analyse est en cours, ou si l'instance est morte avant (le bail l'expire). |

### Erreurs *(nouvelles)*

| Erreur | Levée par | Sens |
|---|---|---|
| `ShelfScanInProgress` | `startAttempt` | Une tentative de moins de 5 min est ouverte pour cet envoi. |
| `DailyScanQuotaExceeded` | `startAttempt` | Le plafond du jour est atteint. L'envoi reste tel quel, photo conservée. |
| `InvalidShelfPhotoThumbnail` | `ShelfPhotoThumbnail.of` | Vignette refusée, puis ignorée par l'appelant. |

`ShelfScanAlreadyProcessed` existe déjà. Elle signifie désormais « déjà `completed` », et non plus
« pas `pending` ».

### ShelfScanRepositoryPort *(étendu)*

```ts
interface ShelfScanRepositoryPort {
  createPending(scan: NewShelfScan): Promise<void>;          // + scan.thumbnail?: StoredThumbnail
  get(id: ShelfScanId): Promise<ShelfScanRecord | undefined>; // + record.thumbnail
  list(query: ShelfScanPageQuery): Promise<ShelfScanPage>;    // nouveau
  startAttempt(id: ShelfScanId, policy: ScanAttemptPolicy): Promise<void>; // nouveau
  markCompleted(id: ShelfScanId, books: readonly DetectedBook[]): Promise<void>; // accepte pending|failed
  markFailed(id: ShelfScanId): Promise<void>;                                     // accepte pending|failed
}

interface ShelfScanPageQuery {
  readonly ownerId: OwnerId;
  readonly limit: number;                    // 1..50, validé par le use case
  readonly after: ShelfScanCursor | undefined;
}

interface ShelfScanCursor { readonly createdAt: Date; readonly id: ShelfScanId }

interface ShelfScanPage {
  readonly records: readonly ShelfScanRecord[]; // created_at desc, id desc
  readonly next: ShelfScanCursor | undefined;   // absent sur la dernière page
}

interface ScanAttemptPolicy {
  readonly dailyLimit: number;       // DAILY_SCAN_LIMIT, 50 par défaut
  readonly timeZone: 'Europe/Paris'; // borne du « jour » du plafond
  readonly lease: number;            // millisecondes, 5 min
}
```

- `startAttempt` est **atomique** (research.md §8). Elle lève `ShelfScanNotFound`,
  `ShelfScanAlreadyProcessed` (envoi `completed`), `ShelfScanInProgress` ou
  `DailyScanQuotaExceeded`, dans cet ordre de vérification.
- `markCompleted` et `markFailed` referment la tentative ouverte et ne bougent qu'un envoi non
  `completed`. Un envoi `completed` produit `ShelfScanAlreadyProcessed`, comme aujourd'hui pour un
  envoi non `pending`.
- `ScanStoredShelfPhotoUseCase` appelle `markFailed` pour **toute** erreur survenue après
  `startAttempt`, qu'elle vienne du stockage ou du scanner, puis la laisse remonter. Aucune
  tentative ne reste ouverte par une erreur du code (research.md §8).
- `list` filtre sur `ownerId`. `get` reste par id seul, et le use case compare l'`ownerId` du
  résultat à celui de la configuration (voir plus bas).

### ShelfPhotoStoragePort *(étendu)*

```ts
interface ShelfPhotoStoragePort {
  store(photo: ShelfPhoto, key: string): Promise<void>;
  retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto>;
  storeThumbnail(thumbnail: ShelfPhotoThumbnail, key: string): Promise<void>;                  // nouveau
  retrieveThumbnail(key: string, mediaType: ThumbnailMediaType): Promise<ShelfPhotoThumbnail>; // nouveau
}
```

Les méthodes sont séparées plutôt que génériques : une photo et une vignette ne se valident pas
pareil, et le port rend un objet déjà prouvé.

## Contexte `recognition` — application (`libs/recognition/application`)

### DTO de frontière *(nouveaux)*

Données simples, jamais un objet de domaine (ADR 0003). Ce sont eux que le contrôleur renvoie
([`contracts/shelf-photos-history-api.md`](contracts/shelf-photos-history-api.md)).

```ts
type ShelfScanOutcomeDto = 'completed' | 'failed' | 'pending';

interface ShelfScanSummaryDto {
  readonly id: string;
  readonly createdAt: string;           // ISO 8601
  readonly outcome: ShelfScanOutcomeDto;
  readonly bookCount?: number;          // présent si et seulement si outcome === 'completed'
  readonly hasThumbnail: boolean;
}

interface ShelfScanPageDto {
  readonly items: readonly ShelfScanSummaryDto[];
  readonly nextCursor: string | null;   // opaque (base64url de createdAt|id)
}

interface ShelfScanDetailDto {
  readonly id: string;
  readonly createdAt: string;
  readonly outcome: ShelfScanOutcomeDto;
  readonly books?: readonly DetectedBookDto[]; // présent si et seulement si outcome === 'completed'
  readonly hasThumbnail: boolean;
}

interface StoredImageDto {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}
```

Aucun de ces DTO ne porte `originalFilename`, `photoBucketKey` ni `ownerId` (FR-009 ; spec 001,
FR-015).

`StoreShelfPhotoCommand` gagne un champ optionnel :
`thumbnail?: { bytes: Uint8Array; mediaType: string }`.

### Use cases

| Use case | Nouveau ? | Rôle |
|---|---|---|
| `StoreShelfPhotoUseCase` | étendu | Valide la vignette si elle est fournie (`ShelfPhotoThumbnail.of`). Invalide, elle est ignorée avec un avertissement. Valide, elle est stockée après la photo et référencée par `createPending`. |
| `ScanStoredShelfPhotoUseCase` | étendu | `startAttempt` avant de lire la photo, puis comme aujourd'hui. Il n'exige plus `pending` : c'est `startAttempt` qui décide. |
| `ListShelfScansUseCase` | nouveau | Décode le curseur (un curseur illisible donne `InvalidShelfScanCursor`, traduit en 400), borne `limit`, appelle `list` avec l'`ownerId` configuré, et rend un `ShelfScanPageDto`. |
| `GetShelfScanUseCase` | nouveau | Rend un `ShelfScanDetailDto`. Un id inconnu, malformé ou d'un autre propriétaire donne `ShelfScanNotFound`. |
| `GetShelfPhotoImageUseCase` | nouveau | `photo` ou `thumbnail` d'un envoi, sous forme de `StoredImageDto`. Une vignette absente donne `ShelfPhotoThumbnailNotFound` (404). |

Les trois use cases de lecture reçoivent `OwnerId` à la construction, comme
`StoreShelfPhotoUseCase` : l'historique est celui du propriétaire configuré (FR-012, Assumptions de
la spec).

## Contexte `recognition` — infrastructure (Postgres)

Migration Drizzle `0001_upload_history` (générée par `yarn db:generate`, research.md §6 et §8) :

| Table | Changement |
|---|---|
| `uploads` | `+ source_upload_id uuid null unique references uploads(id)` ; `original_filename` devient **nullable** ; `check ((source_upload_id is null) = (original_filename is not null))` ; `+ index (owner_id, type, created_at desc, id desc)`. |
| `scan_attempts` *(nouvelle)* | `id uuid pk default random`, `upload_id uuid not null references uploads(id)`, `started_at timestamptz not null default now()`, `finished_at timestamptz null` ; `index (started_at)` pour le plafond ; `index (upload_id) where finished_at is null` pour le bail. |
| `shelf_scans` | Inchangée. La contrainte `detected_books` ⇔ `completed` tient toujours. |

- Une vignette est une ligne `uploads` de `type = 'shelf_photo_thumbnail'` dont `source_upload_id`
  pointe vers la photo. L'adapter la joint en `left join` pour remplir `ShelfScanRecord.thumbnail`.
- `list` sélectionne `type = 'shelf_photo'` et `owner_id = $1`, avec
  `(created_at, id) < ($cursorCreatedAt, $cursorId)` quand un curseur est fourni, trie par
  `created_at desc, id desc`, et lit `limit + 1` lignes pour savoir s'il reste une page.
- Le nombre de livres d'une page vient de `jsonb_array_length(detected_books)` : la liste n'a pas
  besoin des livres eux-mêmes.

## Front — slice `upload-history` (`apps/web/src/features/upload-history/`)

Formes locales à la slice, copies volontaires du contrat (research.md §11).

### HistoryEntry

| Champ | Type | Note |
|---|---|---|
| `id` | `string` | Sert à construire `#/historique/{id}` et les URL d'image. |
| `sentAt` | `Date` | Parsée depuis `createdAt`, affichée en date et heure locales. |
| `outcome` | `{ kind: 'books'; count: number } \| { kind: 'none' } \| { kind: 'failed' } \| { kind: 'notStarted' }` | Les quatre issues de FR-005. `completed` avec `bookCount = 0` donne `none`. |
| `hasThumbnail` | `boolean` | `false` : indicateur neutre sans requête (FR-008). |

### HistoryState

Union discriminée, comme `UploadState` de la spec 001 :

| État | Contenu |
|---|---|
| `loading` | Première page en cours. |
| `empty` | Aucun envoi (US1, scénario 2). |
| `loaded` | `entries: HistoryEntry[]`, `next: string \| null`, `loadingMore: boolean`, `moreError?: string`. |
| `error` | `message` : l'historique n'a pas pu être chargé. **Jamais confondu avec `empty`** (FR-010). |

### EntryDetailState

| État | Contenu |
|---|---|
| `loading` | — |
| `loaded` | `entry: HistoryEntry`, `books?: DetectedBook[]`, `rescan: 'idle' \| 'running' \| { error: string }` |
| `notFound` | Lien obsolète ou erroné (Edge Cases). |
| `error` | Échec réseau ou serveur. |

La relance n'est offerte que si `outcome.kind` vaut `failed` ou `notStarted` (FR-011, US3 scénario 4).
Pendant `running`, le bouton est désactivé (US3, scénario 2). Au succès, le détail et l'entrée
correspondante de l'historique chargé sont mis à jour sans recharger la liste.

## Front — slice `photo-upload` *(retouche)*

- L'envoi joint la vignette produite par `makeThumbnail(file)` quand elle réussit (research.md §5).
- `scan-shelf-photo.ts` distingue les deux 429 par leur `code` (research.md §10). Le message du
  plafond indique que la photo est conservée et peut être relancée demain depuis l'historique.
