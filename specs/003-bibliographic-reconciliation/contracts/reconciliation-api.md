# Contrat : réconciliation des livres d'une analyse

Trois endpoints, sous la ressource déjà exposée par les specs 001 et 002 (`/shelf-photos/{id}`, où
`{id}` est l'identifiant rendu par `POST /shelf-photos`). Consommés par la slice `reconciliation`
d'`apps/web` (research §11), sur l'écran de résultat et dans le détail d'un envoi. L'API ne renvoie
**aucun texte destiné à l'utilisateur** (ADR 0011) : l'écran traduit des statuts et des codes,
jamais un `message`.

Les types sont ceux de `data-model.md` §DTO de frontière. Les trois routes ne concernent que les
envois du propriétaire (`OWNER_ID`) : un envoi d'un autre propriétaire est un 404, comme dans
l'historique.

## 1. `POST /shelf-photos/{id}/reconciliation` — réconcilier, ou relancer

```
POST {VITE_API_BASE_URL}/shelf-photos/{id}/reconciliation
```

Pas de corps. Réconcilie les livres de l'analyse qui n'ont pas encore de statut définitif — tous au
premier appel, les « non vérifiés » seulement aux appels suivants (US4, FR-014) — puis rend l'état
de **tous** les livres. Rejouable sans risque : un livre confirmé, ambigu ou non trouvé n'est jamais
recherché à nouveau.

### 200 — état de la réconciliation

```json
{
  "books": [
    {
      "position": 0,
      "read": { "title": "La Pest", "author": "Albert Camus" },
      "status": "confirmed",
      "confirmedBy": "automatic",
      "titleOnly": false,
      "reference": { "recordId": "ark:/12148/cb00000000x", "title": "La peste", "authors": ["Albert Camus"] }
    },
    {
      "position": 1,
      "read": { "title": "La Chute" },
      "status": "ambiguous",
      "candidates": [
        { "recordId": "ark:/12148/cb…", "title": "La chute", "authors": ["Albert Camus"] },
        { "recordId": "ark:/12148/cb…", "title": "La chute", "authors": ["Autre Auteur"] }
      ]
    },
    { "position": 2, "read": { "title": "Titre peu lisible", "author": "Auteur peu lisible" }, "status": "not_found" },
    { "position": 3, "read": { "title": "Les Choses", "author": "Georges Perec" }, "status": "not_verified" }
  ]
}
```

- `books` est trié par `position` et contient **un élément par livre détecté**, ni plus ni moins.
  Une analyse sans livre rend `{ "books": [] }`.
- `read` est ce qu'a lu la reconnaissance, inchangé (FR-013). `author` est absent — jamais `""` —
  quand la tranche n'en portait pas. La confiance de lecture n'y figure pas.
- `status` vaut `confirmed`, `ambiguous`, `not_found` ou `not_verified` — jamais `pending` après ce
  `POST`. Champs selon le statut :
  - `confirmed` : `reference` (notice retenue : forme de référence, FR-006 — elle peut porter un
    auteur absent de `read` ; `recordId` est l'ARK), `confirmedBy` (`automatic` ou `user`, US2) et
    `titleOnly` (vrai si aucun auteur n'avait été lu, FR-022) ;
  - `ambiguous` : `candidates`, 2 à 5, du plus au moins vraisemblable (FR-010) ;
  - `not_found`, `not_verified` : rien de plus.
- **Un catalogue en panne n'est pas une erreur HTTP** : les livres concernés sont `not_verified`
  et la réponse est un 200 (FR-008, SC-004).
- Jamais de score, de nom de catalogue, d'étape de la cascade ni de cause de panne (FR-018).
- Durée : 20 s au plus pour 30 livres (SC-003, research §7) — le client prévoit un délai d'attente
  plus long que celui-ci.
- Palier d'écriture de la limite par source (10 par minute, spec 002, FR-014).

### 404 — analyse inconnue

`{id}` ne désigne aucune photo conservée du propriétaire (ou n'est pas un UUID). Même règle que
`GET /shelf-photos/{id}`.

### 409 `SCAN_NOT_COMPLETED` — analyse sans livres à réconcilier

L'analyse existe mais n'a pas abouti (`pending` ou `failed`) : il n'y a pas de livres détectés.
En usage normal, l'écran n'appelle cet endpoint qu'après une analyse réussie ; ce statut couvre une
requête envoyée hors de ce parcours.

### 429 `TOO_MANY_REQUESTS`

Limite par source atteinte (spec 002) ; en-tête `Retry-After`. Rien n'est réconcilié.

### Autres échecs

Un 5xx ou l'absence de réponse : le client affiche les livres détectés comme « non vérifiés » et
propose la relance (research §11) — l'état conservé côté serveur, s'il y en a un, sera rendu par
l'appel suivant.

## 2. `GET /shelf-photos/{id}/reconciliation` — lire l'état conservé

```
GET {VITE_API_BASE_URL}/shelf-photos/{id}/reconciliation
```

Rend l'état conservé, au format du §1, **sans jamais interroger le catalogue** (SC-005). Appelé par
le détail d'un envoi à son ouverture (FR-024).

- Un livre jamais tenté (envoi antérieur à la feature, écran quitté avant la réponse) a le statut
  `pending`. Le client enchaîne alors le `POST` du §1, qui le réconcilie.
- Palier par défaut de la limite par source (lecture).
- 404 et 409 `SCAN_NOT_COMPLETED` comme au §1.

## 3. `POST /shelf-photos/{id}/books/{position}/decision` — lever une ambiguïté

```
POST {VITE_API_BASE_URL}/shelf-photos/{id}/books/{position}/decision
Content-Type: application/json

{ "choice": "candidate", "recordId": "ark:/12148/cb00000000x" }
```

ou

```json
{ "choice": "none" }
```

- `candidate` : l'utilisateur reconnaît l'œuvre ; `recordId` DOIT être celui d'un des `candidates`
  rendus pour ce livre. Le livre devient `confirmed` avec `confirmedBy: "user"`.
- `none` : aucun candidat ne correspond ; le livre devient `not_found`.
- Une seule décision par livre ambigu (research §10). Le résultat automatique reste conservé à côté
  (FR-016) ; il n'est pas renvoyé.
- Corps validé tout ou rien (`zod`, `adapters.md`).
- Palier d'écriture de la limite par source.

### 200 — décision enregistrée

Corps : le livre, au format d'un élément de `books` du §1.

### 400 — requête invalide

Corps absent ou mal formé (`choice` inconnu, `recordId` manquant pour `candidate`), `position` qui
n'est pas un entier ≥ 0, ou `recordId` qui n'est pas l'un des candidats du livre (code
`UNKNOWN_CANDIDATE`).

### 404 — livre inconnu

Analyse inconnue ou d'un autre propriétaire, position hors de la liste, ou livre jamais réconcilié.

### 409 `BOOK_NOT_AMBIGUOUS` — livre non ambigu

Le livre n'est pas (ou plus) `ambiguous` : déjà confirmé, non trouvé, non vérifié, ou déjà décidé.
Le client recharge l'état par le §2 et l'affiche.

### 429 `TOO_MANY_REQUESTS`

Comme au §1. Le livre reste ambigu ; le client garde le choix ouvert.

## Correspondance avec les erreurs

Traduction par un `switch` exhaustif sur `kind`, qui se termine par `const unhandled: never`
(`error-policy.md`), comme `recognition-http-error.ts`.

| Erreur (`kind`) | Origine | HTTP | Code | Où |
|---|---|---|---|---|
| `shelf-scan-not-found` | recognition | 404 | — | `orchestration-http-error.ts` |
| `shelf-scan-not-completed` | orchestrateur | 409 | `SCAN_NOT_COMPLETED` | `orchestration-http-error.ts` |
| `book-reconciliation-not-found` | bibliography | 404 | — | `bibliography-http-error.ts` |
| `book-not-ambiguous` | bibliography | 409 | `BOOK_NOT_AMBIGUOUS` | `bibliography-http-error.ts` |
| `unknown-candidate` | bibliography | 400 | `UNKNOWN_CANDIDATE` | `bibliography-http-error.ts` |
| `catalog-unavailable` | bibliography | — | — | jamais propagé : converti en `not_verified` par le use case |
| `book-already-reconciled` | bibliography | — | — | jamais propagé : deux réconciliations simultanées de la même analyse (double montage de l'écran, double relance) — le use case relit l'état et le rend, les deux appels répondent 200 |
