# Data Model: Réconciliation bibliographique des livres détectés

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

Noms en anglais (code), descriptions en français. Aucun type ne franchit une frontière de contexte :
ce qui passe entre `recognition`, l'orchestrateur et `bibliography` est un DTO (§DTO de frontière).

## Contexte `bibliography` — domaine (`libs/bibliography/domain`)

### Value objects

| Type | Contenu | Validation à la construction |
|---|---|---|
| `ShelfBookRef` | `scanRef` (identifiant de l'analyse, opaque) + `position` | `scanRef` UUID ; `position` entier ≥ 0 |
| `BookQuery` | `title` + `author?` — ce que la reconnaissance a lu | titre non vide après normalisation des espaces, ≤ 500 caractères (même borne que `BookTitle` de `recognition`) ; auteur absent ou non vide |
| `CatalogName` | nom du référentiel interrogé (`stub`, `offline`, puis celui de l'ADR #20) | non vide, `[a-z0-9-]+` |
| `CatalogRecordId` | identifiant stable de la notice dans son référentiel (ARK, clé OpenLibrary…) | non vide, ≤ 200 caractères |
| `WorkKey` | identité de l'œuvre, calculée par l'adapter (research §6) | non vide, ≤ 200 caractères |
| `MatchScore` | degré de correspondance | nombre fini dans [0, 1] |
| `NotVerifiedCause` | `unavailable` \| `timeout` \| `invalid_response` | union fermée |

### `CatalogRecord`

Une notice telle que le référentiel la décrit : `id: CatalogRecordId`, `workKey: WorkKey`,
`title: string` (non vide), `authors: readonly string[]` (éventuellement vide).

### `ScoredRecord`

Une notice examinée : `record`, `titleScore`, `authorScore?` (absent si aucun auteur lu),
`score` (combiné, research §5), `rank` (1 = meilleure), `retained` (candidate ou notice confirmée).

### `MatchOutcome` — ce que rend `matchBook`

Union discriminée :

| `verdict` | Porte | Invariant |
|---|---|---|
| `confirmed` | `retained`: la notice représentative de l'unique œuvre | exactement 1 retenue |
| `ambiguous` | `candidates`: 2 à 5 notices, une par œuvre, classées | rangs 1..n sans trou |
| `not_found` | — | aucune retenue |

Chaque issue porte aussi `examined` : les notices examinées **non retenues**, 3 au plus, les mieux
notées (analyse des erreurs, research §9).

`matchBook(query: BookQuery, records: readonly CatalogRecord[], settings: MatchingSettings): MatchOutcome`
est une **fonction pure** (research §5). `MatchingSettings` : seuil titre (0,85), seuil auteur
(0,85), score d'une forme abrégée (0,9), poids titre (0,7), marge (0,1), candidats max (5),
écartés conservés max (3) — valeurs provisoires, objet construit validé (seuils dans [0, 1],
entiers ≥ 1).

### `ReconciliationAttempt`

Une tentative sur un livre : `bookRef`, `query`, `catalog: CatalogName`, `attemptedAt`, et
`result` : soit un `MatchOutcome`, soit `{ verdict: 'not_verified', cause: NotVerifiedCause }`.

### `AmbiguityDecision`

`{ kind: 'chosen', recordId: CatalogRecordId, decidedAt }` ou `{ kind: 'rejected', decidedAt }`.

### `BookReconciliation` — agrégat

Un livre détecté et ce que la réconciliation en sait : `bookRef`, `attempts` (ordonnées), `decision?`.

**Statut courant** (`status`), déduit, jamais stocké :

| Dernière tentative | Décision | Statut | Origine de la confirmation |
|---|---|---|---|
| aucune | — | `pending` (pas encore tenté ; jamais rendu par l'API après un appel) | — |
| `not_verified` | — | `not_verified` | — |
| `confirmed` | — | `confirmed` | `automatic` |
| `ambiguous` | aucune | `ambiguous` | — |
| `ambiguous` | `chosen` | `confirmed` (notice choisie) | `user` |
| `ambiguous` | `rejected` | `not_found` | — |
| `not_found` | — | `not_found` | — |

**Transitions** :

```text
pending ──tentative──▶ confirmed | ambiguous | not_found | not_verified
not_verified ──nouvelle tentative (relance, FR-014)──▶ confirmed | ambiguous | not_found | not_verified
ambiguous ──decide(chosen)──▶ confirmed (origine user)
ambiguous ──decide(rejected)──▶ not_found
```

Règles portées par l'agrégat :
- `needsAttempt()` : vrai si `pending` ou `not_verified` — seules ces situations lancent une recherche
  (FR-014 : la relance ne touche pas un statut définitif).
- `recordAttempt(attempt)` : refusé (`BookAlreadyReconciled`) si le statut est définitif.
- `decide(decision)` : refusé (`BookNotAmbiguous`) si le statut n'est pas `ambiguous` — donc aussi
  après une première décision ; refusé (`UnknownCandidate`) si `recordId` n'est pas un candidat de la
  tentative ambiguë.
- Une tentative n'est jamais modifiée après coup : la décision s'y ajoute (FR-016).

### Ports

| Port | Méthodes | Implémentations |
|---|---|---|
| `BibliographicCatalogPort` | `name`, `search(query, signal)` → `CatalogRecord[]` ; rejette `CatalogUnavailable(cause)` | `StubBibliographicCatalogAdapter`, `OfflineBibliographicCatalogAdapter`, puis l'adapter de l'ADR #20 |
| `BookReconciliationRepositoryPort` | `findByScan(scanRef)` → `BookReconciliation[]` ; `find(bookRef)` ; `saveAttempt(attempt)` ; `saveDecision(bookRef, decision)` — rattachée à l'unique tentative définitive du livre, l'ambiguë | `DrizzleBookReconciliationRepositoryAdapter` ; en mémoire pour les specs d'`application` |

`saveAttempt` rejette `BookAlreadyReconciled` si l'index unique partiel refuse une seconde tentative
définitive (concurrence, research §8) ; `saveDecision` rejette `BookNotAmbiguous` si une décision
existe déjà (contrainte unique).

## Contexte `bibliography` — application (`libs/bibliography/application`)

| Use case | Entrée | Sortie | Erreurs |
|---|---|---|---|
| `ReconcileDetectedBooksUseCase` | `{ scanRef, books: DetectedBookInput[] }` | `ShelfReconciliationDto` | — (un référentiel en panne donne des `not_verified`, pas une erreur) |
| `DecideAmbiguityUseCase` | `{ scanRef, position, decision }` | `BookReconciliationDto` | `BookReconciliationNotFound`, `BookNotAmbiguous`, `UnknownCandidate` |

`ReconcileDetectedBooksUseCase` : charge les réconciliations de l'analyse, lance une recherche pour
chaque livre qui `needsAttempt()`, avec les limites de `ReconciliationLimits` (4 en parallèle, 8 s
par recherche, 18 s au total — research §7), enregistre chaque tentative, puis rend l'état de
**tous** les livres dans l'ordre des positions.

## Contexte `recognition` — ajouts

- `GetDetectedBooksUseCase.execute({ id })` → `{ books: PositionedDetectedBookDto[] }` — les livres
  d'une analyse `completed`, dans l'ordre, avec leur position.
- `ShelfScanNotCompleted` (domaine) : l'analyse existe mais est `pending` ou `failed` → 409.
- `ShelfScanNotFound` (existant) → 404.

Rien ne change au schéma de `recognition`.

## DTO de frontière

```ts
// recognition → orchestrateur
interface PositionedDetectedBookDto extends DetectedBookDto { readonly position: number }

// orchestrateur → bibliography
interface DetectedBookInput { readonly position: number; readonly title: string; readonly author?: string }

// bibliography → orchestrateur → HTTP
interface ShelfReconciliationDto { readonly books: readonly BookReconciliationDto[] }

type BookReconciliationDto = {
  readonly position: number;
  readonly read: { readonly title: string; readonly author?: string };
} & (
  | { readonly status: 'confirmed'; readonly reference: ReferenceDto; readonly confirmedBy: 'automatic' | 'user' }
  | { readonly status: 'ambiguous'; readonly candidates: readonly ReferenceDto[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_verified' }
);

interface ReferenceDto { readonly recordId: string; readonly title: string; readonly authors: readonly string[] }
```

Ni scores, ni référentiel, ni cause d'un « non vérifié » dans les DTO : FR-018, et l'écran n'en a
pas l'usage.

## Stockage (`libs/bibliography/infrastructure/src/lib/drizzle/schema.ts`)

### `reconciliation_attempts`

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | uuid | PK, `defaultRandom()` |
| `scan_ref` | uuid | not null — pas de FK (research §4) |
| `position` | integer | not null, `>= 0` |
| `query_title` | text | not null |
| `query_author` | text | nullable |
| `catalog` | text | not null |
| `verdict` | text | `in ('confirmed','ambiguous','not_found','not_verified')` |
| `not_verified_cause` | text | non nul **si et seulement si** `verdict = 'not_verified'` (check) |
| `attempted_at` | timestamptz | not null, `defaultNow()` |

Index `(scan_ref, position)` ; **index unique partiel** `(scan_ref, position) where verdict <> 'not_verified'`.

### `reconciliation_candidates`

| Colonne | Type | Contrainte |
|---|---|---|
| `attempt_id` | uuid | FK → `reconciliation_attempts.id`, not null |
| `rank` | integer | not null, ≥ 1 ; PK `(attempt_id, rank)` |
| `record_id` | text | not null |
| `work_key` | text | not null |
| `title` | text | not null |
| `authors` | text[] | not null |
| `title_score` | real | [0, 1] |
| `author_score` | real | nullable, [0, 1] |
| `score` | real | [0, 1] |
| `retained` | boolean | not null |

### `reconciliation_decisions`

| Colonne | Type | Contrainte |
|---|---|---|
| `attempt_id` | uuid | PK, FK → `reconciliation_attempts.id` (une décision par tentative) |
| `kind` | text | `in ('chosen','rejected')` |
| `record_id` | text | non nul **si et seulement si** `kind = 'chosen'` (check) |
| `decided_at` | timestamptz | not null, `defaultNow()` |

Migrations : `libs/bibliography/infrastructure/src/lib/drizzle/migrations/`, table de suivi
`__drizzle_migrations_bibliography` (research §8).

## Catégories d'écart (SC-007)

Pour la dernière tentative définitive de chaque livre (ou la dernière tout court si aucune ne l'est) :

| Catégorie | Condition |
|---|---|
| Lu tel quel | `confirmed`, automatique, `title_score = 1` et (`query_author` nul ou `author_score = 1`) |
| Lecture corrigée par le référentiel | `confirmed`, automatique, `title_score < 1` ou `author_score < 1` |
| Auteur complété par le référentiel | `confirmed`, `query_author` nul (se cumule avec les deux précédentes) |
| Ambiguïté levée par l'utilisateur | décision `chosen` — le rang de la notice choisie parmi les candidats |
| Ambiguïté rejetée | décision `rejected` |
| Ambiguïté non levée | `ambiguous` sans décision |
| Inconnu du référentiel | `not_found` automatique — avec la meilleure notice écartée et son score |
| Non vérifié | `not_verified` — avec sa cause |

## Web — slice `reconciliation` (`apps/web/src/features/reconciliation/model`)

- `ReconciledBook` : copie locale de `BookReconciliationDto` (spec 001 research §5 : pas d'import
  `scope:api`), plus un statut d'affichage `checking` avant la première réponse.
- `ReconciliationState` : `checking` \| `ready { books }` \| `failed { failure }` — en `failed`,
  l'écran affiche les livres détectés comme `not_verified` (FR-008).
- `ReconciliationFailure` : `offline` \| `unexpected` — un type, jamais une phrase (ADR 0011).
- `DecisionFailure` : `conflict` (déjà décidé, pas ambigu) \| `offline` \| `unexpected`.

`photo-upload` : `UploadState` en `success` porte `scanId` en plus de `books`.
