# Data Model: Réconciliation bibliographique des livres détectés

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md) · **Révisé**: 2026-10-17
(ADR 0014, spec 002)

Noms en anglais (code), descriptions en français. Aucun type ne franchit une frontière de contexte :
ce qui passe entre `recognition`, l'orchestrateur et `bibliography` est un DTO (§DTO de frontière).
Tout échec attendu est un `Err` de `Result` (`libs/shared/result`, ADR 0013), d'une classe d'erreur
à discriminant `kind` ; les fabriques de value objects rendent `Result<VO, InvalidValue>`
(`domain-modeling.md`).

## Contexte `bibliography` — domaine (`libs/bibliography/domain`)

### Value objects

| Type | Contenu | Validation à la construction |
|---|---|---|
| `ShelfBookRef` | `scanRef` (identifiant de l'analyse, opaque) + `position` | `scanRef` UUID ; `position` entier ≥ 0 |
| `ReadBook` | ce que la reconnaissance a lu : `title`, `author?`, et leur décomposition (research §5.1) — `segments`, `volume?` (mention de tome), `names` | titre non vide après normalisation des espaces, ≤ 500 caractères (même borne que `BookTitle` de `recognition`) ; auteur absent ou non vide |
| `CatalogQuery` | `title?`, `author?`, `maxRecords`, `format` (`full` \| `light`) | au moins un de `title`, `author` ; `maxRecords` entier dans [1, 100] |
| `CatalogName` | nom du catalogue interrogé (`bnf`, `stub`, `offline`) | non vide, `[a-z0-9-]+` |
| `CatalogRecordId` | identifiant stable de la notice : l'ARK pour la BnF | non vide, ≤ 200 caractères |
| `AuthorityId` | identifiant de la notice d'autorité d'un auteur | non vide, ≤ 200 caractères |
| `MatchScore` | degré de correspondance | nombre fini dans [0, 1] |
| `ReconciliationScore` | à quel point le livre retenu est sûr (research §5.8) | nombre fini dans [0, 1] |
| `CascadeStep` | `title_and_author` \| `author_only` \| `title_only` \| `segment` | union fermée |
| `NotVerifiedCause` | `unavailable` \| `timeout` \| `invalid_response` | union fermée |

### `CatalogRecord`

Une notice telle que le catalogue la décrit (research §5.2) :
- `id: CatalogRecordId` ;
- `title` (titre propre, non vide), `titleComplement?` ;
- `authors: readonly RecordAuthor[]` — `name`, `role` (`main` \| `secondary`), `authorityId?` ;
  éventuellement vide ;
- `context` — `series?`, `volume?`, `collection?`, `publisher?` ;
- `raw` (la notice telle que reçue, texte) et `format` (`unimarc` \| `dublin-core`), conservés au
  stockage, jamais lus par le domaine.

### `ScoredRecord`

Une notice examinée : `record`, `titleScore`, `authorScore?` (absent si aucun auteur lu),
`score` (combiné, research §5.6), `rank` (1 = meilleure), `retained` (candidate ou notice
confirmée).

### `MatchOutcome` — ce que rend `matchBook`

Union discriminée :

| `verdict` | Porte | Invariant |
|---|---|---|
| `confirmed` | `retained`: la notice représentative de l'unique œuvre (research §5.7) | exactement 1 retenue |
| `ambiguous` | `candidates`: 2 à 5 notices, une par œuvre, classées ; `partial` vrai si l'ambiguïté vient d'un segment non expliqué | rangs 1..n sans trou |
| `not_found` | — | aucune retenue |

Chaque issue porte aussi `examined` : les notices examinées **non retenues**, 3 au plus, les mieux
notées (analyse des erreurs, research §9), et `needsAuthorityCheck` : les notices écartées
seulement par l'auteur, avec les autorités de leurs auteurs (research §5.4).

`matchBook(read: ReadBook, records: readonly CatalogRecord[], settings: MatchingSettings, rejectedForms?): MatchOutcome`
est une **fonction pure**. `rejectedForms` associe une `AuthorityId` à ses formes rejetées, quand
l'application les a obtenues.

`MatchingSettings` (valeurs de l'étude de l'issue #20, objet construit validé — seuils dans [0, 1],
entiers ≥ 1) : seuil titre 0,85 ; seuil auteur 0,85 ; poids titre 0,7 ; marge 0,1 ; candidats max 5 ;
écartés conservés max 3 ; séparateurs de segments ` - `, ` : `, ` / ` ; séparateurs de noms `-`, `/`,
` et `, `&`, `,` ; articles initiaux ; poids des étapes et pénalité sans auteur du score de
réconciliation (research §5.8).

`reconciliationScore(outcome, step, authorRead): ReconciliationScore` — fonction pure du domaine
(FR-021).

### `ReconciliationAttempt`

Une tentative sur un livre : `bookRef`, `read`, `catalog: CatalogName`, `attemptedAt`, et
`result` : soit `{ outcome: MatchOutcome, step: CascadeStep | null, score: ReconciliationScore }`
(`step` nul pour un `not_found` après toute la cascade), soit
`{ verdict: 'not_verified', cause: NotVerifiedCause }`.

### `AmbiguityDecision`

`{ kind: 'chosen', recordId: CatalogRecordId, decidedAt }` ou `{ kind: 'rejected', decidedAt }`.

### `BookReconciliation` — agrégat

Un livre détecté et ce que la réconciliation en sait : `bookRef`, `attempts` (ordonnées), `decision?`.

**Statut courant** (`status`), déduit, jamais stocké :

| Dernière tentative | Décision | Statut | Origine de la confirmation |
|---|---|---|---|
| aucune | — | `pending` (pas encore tenté) | — |
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

Règles portées par l'agrégat, chacune rendant un `Result` :
- `needsAttempt()` : vrai si `pending` ou `not_verified` — seules ces situations lancent une recherche
  (FR-014 : la relance ne touche pas un statut définitif).
- `recordAttempt(attempt)` : `Err(BookAlreadyReconciled)` si le statut est définitif.
- `decide(decision)` : `Err(BookNotAmbiguous)` si le statut n'est pas `ambiguous` — donc aussi
  après une première décision ; `Err(UnknownCandidate)` si `recordId` n'est pas un candidat de la
  tentative ambiguë.
- Une tentative n'est jamais modifiée après coup : la décision s'y ajoute (FR-016).

### Erreurs

| Classe | `kind` | Où |
|---|---|---|
| `CatalogUnavailable` | `catalog-unavailable` (avec `cause`) | ports `BibliographicCatalogPort`, `AuthorityPort` |
| `BookAlreadyReconciled` | `book-already-reconciled` | agrégat, `saveAttempt` |
| `BookNotAmbiguous` | `book-not-ambiguous` | agrégat, `saveDecision` |
| `UnknownCandidate` | `unknown-candidate` | agrégat |
| `BookReconciliationNotFound` | `book-reconciliation-not-found` | `DecideAmbiguityUseCase` |

### Ports

| Port | Méthodes | Implémentations |
|---|---|---|
| `BibliographicCatalogPort` | `name` ; `search(query, signal)` → `Promise<Result<CatalogPage, CatalogUnavailable>>` | `BnfSruCatalogAdapter`, `StubBibliographicCatalogAdapter`, `OfflineBibliographicCatalogAdapter` |
| `AuthorityPort` | `rejectedForms(id, signal)` → `Promise<Result<readonly string[], CatalogUnavailable>>` | `BnfAuthorityAdapter` (cache en mémoire), stub, offline |
| `BookReconciliationRepositoryPort` | `findByScan(scanRef)` → `BookReconciliation[]` ; `find(bookRef)` ; `saveAttempt(attempt)` → `Result<void, BookAlreadyReconciled>` ; `saveDecision(bookRef, decision)` → `Result<void, BookNotAmbiguous>` — rattachée à l'unique tentative définitive du livre, l'ambiguë | `DrizzleBookReconciliationRepositoryAdapter` ; en mémoire pour les specs d'`application` |

`saveAttempt` rend `Err(BookAlreadyReconciled)` si l'index unique partiel refuse une seconde
tentative définitive (concurrence, research §3) ; `saveDecision` rend `Err(BookNotAmbiguous)` si
une décision existe déjà (contrainte unique). Une base indisponible n'est pas modélisée : la
promesse est rejetée et le filtre global répond 500 (`error-policy.md`).

## Contexte `bibliography` — application (`libs/bibliography/application`)

| Use case | Entrée | Sortie |
|---|---|---|
| `ReconcileDetectedBooksUseCase` | `{ scanRef, books: DetectedBookInput[] }` | `Promise<ShelfReconciliationDto>` — un catalogue en panne donne des `not_verified`, jamais un `Err` |
| `GetShelfReconciliationUseCase` | `{ scanRef, books: DetectedBookInput[] }` | `Promise<ShelfReconciliationDto>` — l'état conservé, sans appel au catalogue ; `pending` pour un livre jamais tenté |
| `DecideAmbiguityUseCase` | `{ scanRef, position, decision }` | `Promise<Result<BookReconciliationDto, BookReconciliationNotFound \| BookNotAmbiguous \| UnknownCandidate>>` |

`ReconcileDetectedBooksUseCase` : charge les réconciliations de l'analyse et, pour chaque livre qui
`needsAttempt()`, déroule la **cascade** (research §5) — titre et auteur (20 notices, `full`), auteur
seul (100 notices, `light`, puis appariement local du titre), titre seul (20 notices, `full`), puis
chaque segment —, les deux premières étapes seulement si un auteur a été lu ; s'arrête à la
première étape qui rend `confirmed` ou `ambiguous` ; demande les formes rejetées des autorités quand
`needsAuthorityCheck` n'est pas vide ; respecte `ReconciliationLimits` (4 requêtes en parallèle,
8 s par requête, une nouvelle tentative sur `unavailable`, 18 s au total — research §7) ;
enregistre une tentative par livre, avec l'étape et le score ; puis rend l'état de **tous** les
livres dans l'ordre des positions.

## Orchestration (`apps/api/src/orchestration`)

| Use case | Lit | Sortie |
|---|---|---|
| `ReconcileShelfPhotoUseCase` | `GetShelfScanUseCase` (recognition), puis `ReconcileDetectedBooksUseCase` | `Result<ShelfReconciliationDto, ShelfScanNotFound \| ShelfScanNotCompleted>` |
| `GetShelfPhotoReconciliationUseCase` | `GetShelfScanUseCase`, puis `GetShelfReconciliationUseCase` | idem |
| `DecideShelfBookAmbiguityUseCase` | `GetShelfScanUseCase` (propriétaire), puis `DecideAmbiguityUseCase` | `Result<BookReconciliationDto, ShelfScanNotFound \| BookReconciliationNotFound \| BookNotAmbiguous \| UnknownCandidate>` |

`ShelfScanNotCompleted` (`kind: 'shelf-scan-not-completed'`) est une erreur de l'orchestrateur :
le détail existe mais son `outcome` n'est pas `completed`. `recognition` ne change pas : ni nouveau
use case, ni nouvelle erreur, ni changement de schéma.

## DTO de frontière

```ts
// recognition → orchestrateur : ShelfScanDetailDto, existant (GetShelfScanUseCase)
//   { id, createdAt, outcome: 'completed' | 'failed' | 'pending', books?: DetectedBookDto[], hasThumbnail }
//   La confiance de chaque livre n'est pas transmise à bibliography : elle n'entre jamais dans le verdict.

// orchestrateur → bibliography
interface DetectedBookInput { readonly position: number; readonly title: string; readonly author?: string }

// bibliography → orchestrateur → HTTP
interface ShelfReconciliationDto { readonly books: readonly BookReconciliationDto[] }

type BookReconciliationDto = {
  readonly position: number;
  readonly read: { readonly title: string; readonly author?: string };
} & (
  | {
      readonly status: 'confirmed';
      readonly reference: ReferenceDto;
      readonly confirmedBy: 'automatic' | 'user';
      readonly titleOnly: boolean;                 // aucun auteur lu (FR-022)
    }
  | { readonly status: 'ambiguous'; readonly candidates: readonly ReferenceDto[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_verified' }
  | { readonly status: 'pending' }                 // GET seulement : jamais tenté
);

interface ReferenceDto {
  readonly recordId: string;                       // ARK
  readonly title: string;
  readonly authors: readonly string[];             // auteurs principaux, puis secondaires
}
```

Ni score, ni catalogue, ni étape, ni cause d'un « non vérifié » dans les DTO : FR-018, et l'écran
n'en a pas l'usage.

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
| `cascade_step` | text | nullable, `in ('title_and_author','author_only','title_only','segment')` ; non nul si `verdict in ('confirmed','ambiguous')` (check) |
| `reconciliation_score` | real | [0, 1] ; nul **si et seulement si** `verdict = 'not_verified'` (check) |
| `not_verified_cause` | text | non nul **si et seulement si** `verdict = 'not_verified'` (check) |
| `attempted_at` | timestamptz | not null, `defaultNow()` — date de consultation |

Index `(scan_ref, position)` ; **index unique partiel** `(scan_ref, position) where verdict <> 'not_verified'`.

### `reconciliation_candidates`

| Colonne | Type | Contrainte |
|---|---|---|
| `attempt_id` | uuid | FK → `reconciliation_attempts.id`, not null |
| `rank` | integer | not null, ≥ 1 ; PK `(attempt_id, rank)` |
| `record_id` | text | not null — ARK |
| `title` | text | not null |
| `title_complement` | text | nullable |
| `authors` | jsonb | not null — `[{ name, role, authorityId? }]`, validé par `zod` à la lecture |
| `context` | jsonb | not null — `{ series?, volume?, collection?, publisher? }` |
| `raw` | text | not null — la notice telle que reçue |
| `format` | text | `in ('unimarc','dublin-core')` |
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

Migrations : `libs/bibliography/infrastructure/src/lib/drizzle/migrations/`, générées par
`yarn db:generate`, jamais écrites à la main ; table de suivi `__drizzle_migrations_bibliography`
(research §8).

## Catégories d'écart (SC-007)

Pour la dernière tentative définitive de chaque livre (ou la dernière tout court si aucune ne l'est) :

| Catégorie | Condition |
|---|---|
| Lu tel quel | `confirmed`, automatique, `title_score = 1` et (`query_author` nul ou `author_score = 1`) |
| Lecture corrigée par le catalogue | `confirmed`, automatique, `title_score < 1` ou `author_score < 1` |
| Auteur complété par le catalogue | `confirmed`, `query_author` nul (se cumule avec les deux précédentes) |
| Ambiguïté levée par l'utilisateur | décision `chosen` — le rang de la notice choisie parmi les candidats |
| Ambiguïté rejetée | décision `rejected` |
| Ambiguïté non levée | `ambiguous` sans décision |
| Inconnu du catalogue | `not_found` automatique — avec la meilleure notice écartée et son score |
| Non vérifié | `not_verified` — avec sa cause |

Chaque catégorie se croise avec `cascade_step` : c'est la lecture que demande la condition de
bascule « filet » de l'ADR 0014.

## Web — slice `reconciliation` (`apps/web/src/features/reconciliation/model`)

- `ReconciledBook` : copie locale de `BookReconciliationDto` (pas d'import `scope:api`), plus un
  statut d'affichage `checking` avant la première réponse.
- `ReconciliationState` : `checking` \| `ready { books }` \| `failed { failure }` — en `failed`,
  l'écran affiche les livres détectés comme `not_verified` (FR-008).
- `ReconciliationFailure` : `offline` \| `rate_limited` \| `unexpected` — un type, jamais une phrase
  (ADR 0011).
- `DecisionFailure` : `conflict` (déjà décidé, pas ambigu) \| `rate_limited` \| `offline` \|
  `unexpected`.

`photo-upload` : `UploadState` en `success` porte `scanId` en plus de `books`.
`upload-history` : `LoadedEntry` reçoit du shell la façon de rendre les livres d'un envoi abouti.
