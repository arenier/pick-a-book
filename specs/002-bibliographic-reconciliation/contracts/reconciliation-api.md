# Contrat : réconciliation des livres d'une analyse

Deux endpoints, sous la ressource déjà exposée par la spec 001 (`/shelf-photos/{id}`, où `{id}` est
l'identifiant rendu par `POST /shelf-photos`). Consommés par la slice `reconciliation` d'`apps/web`
(research §11). L'API ne renvoie **aucun texte destiné à l'utilisateur** (ADR 0011) : l'écran
traduit des statuts et des codes, jamais un `message`.

Les types sont ceux de `data-model.md` §DTO de frontière.

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
      "reference": { "recordId": "ark:/12148/cb00000000x", "title": "La Peste", "authors": ["Albert Camus"] }
    },
    {
      "position": 1,
      "read": { "title": "La Chute" },
      "status": "ambiguous",
      "candidates": [
        { "recordId": "…", "title": "La Chute", "authors": ["Albert Camus"] },
        { "recordId": "…", "title": "La Chute", "authors": ["Autre Auteur"] }
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
  quand la tranche n'en portait pas.
- `status` vaut `confirmed`, `ambiguous`, `not_found` ou `not_verified` — jamais autre chose après un
  appel. Champs selon le statut :
  - `confirmed` : `reference` (notice retenue : forme de référence, FR-006 — elle peut porter un
    auteur absent de `read`) et `confirmedBy` (`automatic` ou `user`, US2) ;
  - `ambiguous` : `candidates`, 2 à 5, du plus au moins vraisemblable (FR-010) ;
  - `not_found`, `not_verified` : rien de plus.
- **Un référentiel en panne n'est pas une erreur HTTP** : les livres concernés sont `not_verified`
  et la réponse est un 200 (FR-008, SC-004).
- Jamais de score, de nom de référentiel ni de cause de panne (FR-018).
- Durée : 20 s au plus pour 30 livres (SC-003, research §7) — le client prévoit un délai d'attente
  plus long que celui-ci.

### 404 — analyse inconnue

`{id}` ne désigne aucune photo conservée (ou n'est pas un UUID). Même règle que
`POST /shelf-photos/{id}/scan`.

### 409 — analyse sans livres à réconcilier

L'analyse existe mais n'a pas abouti (`pending` ou `failed`) : il n'y a pas de livres détectés. En
usage normal, l'écran n'appelle cet endpoint qu'après un scan réussi ; ce statut couvre une requête
envoyée hors de ce parcours.

### Autres échecs

Un 5xx ou l'absence de réponse : le client affiche les livres détectés comme « non vérifiés » et
propose la relance (research §11) — l'état conservé côté serveur, s'il y en a un, sera rendu par
l'appel suivant.

## 2. `POST /shelf-photos/{id}/books/{position}/decision` — lever une ambiguïté

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

### 200 — décision enregistrée

Corps : le livre, au format d'un élément de `books` du §1.

### 400 — requête invalide

Corps absent ou mal formé (`choice` inconnu, `recordId` manquant pour `candidate`), `position` qui
n'est pas un entier ≥ 0, ou `recordId` qui n'est pas l'un des candidats du livre.

### 404 — livre inconnu

Analyse inconnue, position hors de la liste, ou livre jamais réconcilié.

### 409 — livre non ambigu

Le livre n'est pas (ou plus) `ambiguous` : déjà confirmé, non trouvé, non vérifié, ou déjà décidé.
Le client recharge l'état par le §1 et l'affiche.

## Correspondance avec les erreurs des contextes

| Erreur | Contexte | HTTP | Filtre |
|---|---|---|---|
| `ShelfScanNotFound` | recognition | 404 | `RecognitionExceptionFilter` (existant) |
| `ShelfScanNotCompleted` | recognition | 409 | `RecognitionExceptionFilter` (étendu) |
| `BookReconciliationNotFound` | bibliography | 404 | `BibliographyExceptionFilter` (nouveau) |
| `BookNotAmbiguous` | bibliography | 409 | `BibliographyExceptionFilter` |
| `UnknownCandidate`, entrée invalide | bibliography | 400 | `BibliographyExceptionFilter` |
| `CatalogUnavailable` | bibliography | — | jamais propagé : converti en `not_verified` par le use case |
