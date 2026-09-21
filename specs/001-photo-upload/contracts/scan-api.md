# Contrat consommé : envoi et analyse d'une photo d'étagère

**Révisé le 21/09/2026** : ce qui était un unique `POST /scan` synchrone (upload + analyse dans la
même requête) devient deux endpoints — `POST /shelf-photos` (envoi) puis
`POST /shelf-photos/{id}/scan` (analyse) — pour que la photo soit conservée avant l'appel le plus
long et le plus faillible de la chaîne (le VLM, ~27 s mesurés — `docs/decisions/0001`) plutôt que
risquée dans la même requête que lui (research.md §7). `apps/web` en devient le premier appelant
HTTP réel des deux (jusqu'ici non consommé que par des tests) ; ce document fixe ce qu'`apps/web`
doit envoyer et attendre de chacun. Le module `api/scan-shelf-photo.ts` du frontend enchaîne les
deux appels et n'expose qu'une seule fonction à l'écran : cette séparation est un détail de
transport, invisible dans `spec.md`.

## 1. `POST /shelf-photos` — envoyer la photo

```
POST {VITE_API_BASE_URL}/shelf-photos
Content-Type: multipart/form-data

photo: <fichier image>
```

- Champ `photo`, un seul fichier (le port de reconnaissance ne traite qu'une image à la fois,
  FR-002).
- Type MIME et poids validés côté client avant envoi (voir `data-model.md#SelectedPhoto`), puis
  revalidés côté serveur (`ShelfPhoto`, réponse 400 sinon) — le client ne fait pas confiance à sa
  propre validation pour la sécurité, seulement pour l'ergonomie (retour immédiat, FR-003).

### 201 — photo reçue et conservée

```json
{ "id": "1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b" }
```

- **Effet de bord serveur (US3)** : la photo est stockée dans le bucket et un `ShelfScanRecord`
  de statut `pending` est créé (`data-model.md#ShelfScanRecord`) — c'est ce qui rend `id`
  utilisable immédiatement pour l'étape 2, et ce qui garantit que la photo est conservée avant
  même que l'analyse soit tentée (FR-011).
- `id` DOIT être réutilisé tel quel pour l'appel `POST /shelf-photos/{id}/scan` qui suit
  immédiatement, côté frontend, sans intervention de l'utilisateur.

### 400 — requête refusée

Corps : `{ "message": string, "statusCode": 400 }` (format par défaut de Nest). Causes possibles
détectées par le serveur : fichier absent, vide, type MIME non supporté, poids supérieur à 20 Mo.
Une partie de ces cas est déjà interceptée côté client avant l'envoi (FR-003, FR-009) ; ce statut
reste le filet de sécurité serveur, et le message affiché à l'utilisateur ne dépend pas du texte
technique renvoyé (FR-009 : « message compréhensible sans jargon technique »). Rien n'est stocké
sur ce chemin (FR-013) : l'échec a lieu avant que la photo soit remise au port de stockage — il n'y
a donc pas d'étape 2 à tenter.

## 2. `POST /shelf-photos/{id}/scan` — déclencher l'analyse

```
POST {VITE_API_BASE_URL}/shelf-photos/{id}/scan
```

Pas de corps : `{id}` (celui reçu à l'étape 1) suffit à retrouver la photo déjà stockée
(`ScanStoredShelfPhotoUseCase` la relit depuis le bucket, research.md §7 — pas de fichier gardé en
mémoire entre les deux requêtes).

### 200 — analyse effectuée (avec ou sans livre)

```json
{
  "books": [
    { "author": "Albert Camus", "title": "La Peste", "confidence": 0.92 },
    { "title": "Les Choses", "confidence": 0.71 }
  ]
}
```

- `books` peut être un tableau vide : c'est le cas « aucun livre détecté » (US1, scénario 3), pas
  une erreur.
- `author` absent (pas de clé, pas de chaîne vide) quand la tranche ne portait pas d'auteur
  lisible.
- **Effet de bord serveur (US3)** : le `ShelfScanRecord` passe de `pending` à `completed`, avec les
  livres détectés. Invisible pour le frontend : le corps de la réponse est le même qu'avant le
  découpage en deux endpoints.

### 404 — identifiant inconnu

Corps : `{ "message": string, "statusCode": 404 }`. Aucun `ShelfScanRecord` ne correspond à `id` —
ne devrait pas se produire dans l'usage normal du frontend (l'`id` vient toujours d'une réponse 201
fraîche), documenté pour un appelant qui rejouerait un `id` invalide ou déjà ancien.

### 409 — déjà traité

Corps : `{ "message": string, "statusCode": 409 }`. Le `ShelfScanRecord` n'est plus `pending`
(déjà `completed` ou `failed`) — protège contre un second appel accidentel qui écraserait un
résultat déjà posé ou relancerait un appel VLM déjà payé (research.md §7). Le frontend n'est pas
censé provoquer ce cas dans son usage normal (un seul appel scan par `id`, FR-007) ; s'il survient
malgré tout (double-clic échappé à la désactivation du bouton, requête réseau rejouée), il est
traité comme une erreur générique, pas comme un succès silencieux.

### 502 — échec en amont

Corps : `{ "message": string, "statusCode": 502 }`. Le service de reconnaissance (VLM) est en
panne ou hors contrat (`ShelfScanFailed`). Distinct du 400 de l'étape 1 : ce n'est pas la photo qui
est en cause (FR-006, US2 scénario 3). **Effet de bord serveur (US3)** : le `ShelfScanRecord` passe
de `pending` à `failed` — la photo reste conservée, prête pour un traitement ultérieur (FR-011,
scénario 2), même si aucune UX de nouvelle tentative n'est exposée par cette feature.

## Échec réseau, sur l'une ou l'autre requête (pas de réponse HTTP)

Pas de statut — `fetch` rejette (délai, coupure). Traité par la feature comme un cas d'erreur, avec
son propre message (Edge case de `spec.md` : coupure réseau) — que la coupure survienne sur l'étape
1 (rien n'est alors conservé, comme un 400) ou sur l'étape 2 (la photo, elle, est déjà conservée en
`pending` depuis l'étape 1 précédente réussie — FR-014, `data-model.md#ShelfScanRecord`).

## Ce que le frontend n'utilise pas

- Le repli JSON base64 de l'étape 1 (`{"image": "<base64>", "mediaType": ...}`) — prévu pour
  d'autres appelants, pas pour cette UI (research.md §3).
- Le champ `confidence` n'est pas affiché (voir `data-model.md#DetectedBook`), seulement transporté.
- Aucune UX de reprise manuelle sur un `ShelfScanRecord` resté `pending` ou passé `failed` — cette
  feature ne relance jamais l'étape 2 de son propre chef (research.md §7, alternative rejetée).

## Ce qu'aucune réponse n'expose jamais

- `originalFilename`, `ownerId`, `photoBucketKey` et `photoSizeBytes`
  (`data-model.md#ShelfScanRecord`) restent des colonnes internes à `shelf_scans` — aucun des deux
  endpoints ci-dessus ne les renvoie dans son corps de réponse (FR-015). Le seul identifiant que le
  frontend reçoit et manipule est `id`.
