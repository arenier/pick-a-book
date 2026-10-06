# Contrat : historique des envois

Ce contrat complète celui de la spec 001
([`specs/001-photo-upload/contracts/scan-api.md`](../../001-photo-upload/contracts/scan-api.md)),
qui reste valable sauf pour les amendements de la section 5. Tous les chemins sont relatifs à
`{VITE_API_BASE_URL}`. Les formes de réponse sont les DTO de [`data-model.md`](../data-model.md).
`apps/web` les recopie localement, sans les importer (research.md §11).

Aucune réponse de ce contrat ne porte le nom de fichier d'origine, la clé du bucket ni l'identifiant
du propriétaire (FR-009 ; spec 001, FR-015).

## Erreurs communes

Le corps garde la forme de Nest, `{ statusCode, message, error }`, et y ajoute un `code` stable quand
le statut ne suffit pas à choisir le message affiché (research.md §10). Le front ne lit jamais
`message`.

| Statut | `code` | Où | Sens pour le front |
|---|---|---|---|
| 429 | `TOO_MANY_REQUESTS` | toutes les routes sauf `/health` | Trop de requêtes depuis cette source : réessayer dans une minute (FR-014). En-tête `Retry-After` en secondes. |
| 429 | `DAILY_UPLOAD_QUOTA_EXCEEDED` | `POST /shelf-photos` | Plafond d'envois du jour atteint : la photo n'est pas conservée, réessayer demain (FR-017). |
| 429 | `DAILY_SCAN_QUOTA_EXCEEDED` | `POST …/scan` | Plafond du jour atteint : la photo est conservée, relancer demain (FR-015). |
| 409 | `SCAN_ALREADY_COMPLETED` | `POST …/scan` | Déjà analysé avec succès, pas de relance (FR-011). |
| 409 | `SCAN_IN_PROGRESS` | `POST …/scan` | Une analyse de cet envoi est déjà en cours. |
| 404 | — | routes `{id}` | Envoi inconnu, id malformé ou vignette absente. |

## 1. `GET /shelf-photos` : une page d'historique

```
GET /shelf-photos?limit=20&cursor=<opaque>
```

- `limit` est optionnel : 20 par défaut, borné à 1..50. Hors bornes ou non entier : 400.
- `cursor` est optionnel et vaut le `nextCursor` d'une page précédente. Absent : première page.
  Illisible : 400.

### 200

```json
{
  "items": [
    {
      "id": "1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b",
      "createdAt": "2026-09-27T14:03:12.481Z",
      "outcome": "completed",
      "bookCount": 12,
      "hasThumbnail": true
    },
    {
      "id": "0a7d…",
      "createdAt": "2026-09-26T10:41:55.002Z",
      "outcome": "failed",
      "hasThumbnail": false
    }
  ],
  "nextCursor": "MjAyNi0wOS0yNlQxMDo0MTo1NS4wMDJafDBhN2Q…"
}
```

- Les envois sont triés du plus récent au plus ancien (FR-003). Chaque envoi apparaît une fois et une
  seule, même si un nouvel envoi arrive entre deux pages (research.md §4, SC-003).
- `outcome` vaut `completed`, `failed` ou `pending`. Le front affiche `pending` comme « analyse non
  lancée » (FR-005).
- `bookCount` est présent si et seulement si `outcome === "completed"`. S'il vaut `0`, le front
  affiche « aucun livre détecté ».
- `nextCursor` vaut `null` sur la dernière page. Un historique vide donne `{ "items": [], "nextCursor": null }`.

## 2. `GET /shelf-photos/{id}` : le détail d'un envoi

### 200

```json
{
  "id": "1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b",
  "createdAt": "2026-09-27T14:03:12.481Z",
  "outcome": "completed",
  "books": [
    { "author": "Albert Camus", "title": "La Peste", "confidence": 0.92 },
    { "title": "Les Choses", "confidence": 0.71 }
  ],
  "hasThumbnail": true
}
```

- `books` est présent si et seulement si `outcome === "completed"` (éventuellement vide). Les livres
  sont dans l'ordre où l'analyse les a rendus (FR-007). `confidence` est transmis mais pas affiché.
- 404 si l'envoi n'existe pas.

## 3. `GET /shelf-photos/{id}/photo` : la photo d'origine

- 200 : les octets de la photo, avec pour `Content-Type` son type conservé (`image/jpeg`,
  `image/png`, `image/webp`, `image/heic`) et `Cache-Control: private, max-age=31536000, immutable`.
- 404 si l'envoi n'existe pas.
- 502 si la photo est introuvable ou illisible dans le bucket alors que l'envoi existe
  (`ShelfPhotoStorageFailed`). Pour le `<img>`, c'est un échec de chargement comme un autre : même
  repli que ci-dessous.

Le front charge cette image dans un `<img>`, ce qui ne demande pas de CORS. Quand elle ne peut pas
s'afficher (un HEIC que le navigateur ne sait pas lire, ou une réponse 502), `onerror` se déclenche
et le front se replie, dans cet ordre (FR-008) :

1. **la vignette**, si `hasThumbnail` vaut `true` : elle montre encore l'étagère ;
2. **l'indicateur neutre** sinon, ou si la vignette échoue à son tour.

Les livres détectés restent affichés dans tous les cas.

## 4. `GET /shelf-photos/{id}/thumbnail` : la vignette

- 200 : les octets de la vignette (`image/jpeg`, `image/png` ou `image/webp`), avec le même
  `Cache-Control` que la photo.
- 404 si l'envoi n'existe pas **ou** n'a pas de vignette. Le front ne la demande que si
  `hasThumbnail` vaut `true`, et un 404 donne quand même l'indicateur neutre.

## 5. Amendements au contrat de la spec 001

### `POST /shelf-photos` : champ `thumbnail` optionnel

```
POST /shelf-photos
Content-Type: multipart/form-data

photo: <fichier image>              (inchangé, requis)
thumbnail: <vignette JPEG|PNG|WebP>  (nouveau, optionnel, 256 Ko au plus)
```

- Absente : l'envoi se passe comme avant, et l'envoi n'aura pas de vignette.
- Invalide (type, poids, vide) : **ignorée**. La réponse reste 201, la photo est conservée, et
  l'API journalise un avertissement (research.md §5).
- Réponses inchangées (201 `{ id }`, 400, 413), plus le 429 `TOO_MANY_REQUESTS` des erreurs communes.
- **429 `DAILY_UPLOAD_QUOTA_EXCEEDED`** *(amendement du 04/10/2026, FR-017)* : le plafond d'envois du
  jour est atteint. L'API le décide **avant** d'écrire quoi que ce soit : ni photo, ni vignette dans
  le bucket, ni ligne en base. Le front de l'écran d'envoi affiche que la photo n'est pas conservée
  et que l'envoi sera de nouveau possible demain.

### `POST /shelf-photos/{id}/scan` : relance et plafond

- **Accepté aussi sur un envoi `failed`** (relance, FR-011), plus seulement sur un envoi `pending`.
- 200 : inchangé (`{ books: [...] }`).
- 409 : désormais avec un `code`. `SCAN_ALREADY_COMPLETED` remplace le 409 « déjà traité » de la
  spec 001 : un envoi `failed` est maintenant relançable. `SCAN_IN_PROGRESS` est nouveau.
- 429 `DAILY_SCAN_QUOTA_EXCEEDED` (nouveau) : aucun appel au service de reconnaissance, l'envoi
  garde son statut. Le front de l'écran d'envoi affiche que la photo est conservée et pourra être
  relancée demain depuis l'historique.
- 502 : inchangé. L'envoi passe (ou reste) `failed`.
