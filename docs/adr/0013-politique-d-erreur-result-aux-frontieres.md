# ADR 0013 — Politique d'erreur : `Result` aux frontières du domaine et de l'application

Statut : proposé · Date : 2026-09-28 · Couplé aux ADR [0002](0002-ddd-et-architecture-hexagonale.md) (couches pures), [0003](0003-orchestration-sans-event-bus.md) (l'app assemble, sans règle) et [0008](0008-lint-et-format-oxlint-oxfmt.md) (garde-fous lint)

## Contexte

Le repo porte **deux idiomes d'erreur, et un seul sert**. `libs/shared/result` (`Result`, `ok`/`err`,
`isOk`/`isErr`, `unwrap`, `map`) est complète et testée, mais n'avait aucun consommateur. Tout le
code du contexte `recognition` fait l'inverse : il **jette**.

| Où | Avant cet ADR |
|---|---|
| `ShelfPhoto.of`, `Confidence.of`, `Author.of`, `BookTitle.of`, `OwnerId.of`, `ShelfScanId.of` | `throw` à la construction |
| `ShelfScannerPort.scan` | contrat : `throw ShelfScanFailed` si la source est indisponible ou hors-contrat |
| `ShelfScanRepositoryPort.markCompleted` / `markFailed` | rejettent avec `ShelfScanNotFound` ou `ShelfScanAlreadyProcessed` |
| `StoreShelfPhotoUseCase`, `ScanStoredShelfPhotoUseCase` | laissent tout remonter |
| `RecognitionExceptionFilter` (`apps/api`) | rattrape ces classes par `instanceof` et les dit en HTTP |

Le filtre est le symptôme : il **reconstruit à la main** un type d'erreur que `throw` avait effacé
de la signature. Rien, dans le type d'un use case, ne dit ce qui peut mal tourner ; ajouter un cas
d'échec ne casse aucune compilation, seulement un test — s'il existe.

Le cadrage est dans l'issue #24. L'idiome exception est déjà en place : il s'agit d'**entériner et
d'infléchir**, avec un coût de migration assumé.

## Problématique

Où passe la frontière entre l'échec **attendu**, qui fait partie du vocabulaire du domaine (une
image vide, un fournisseur hors-contrat, un scan déjà traité), et l'échec **exceptionnel** (un bug,
une base injoignable) ? Et qui a le droit de jeter ?

Le corollaire : le repo refuse les règles seulement écrites (ADR 0008). Une politique qu'aucun outil
ne fait respecter finit contournée. La décision porte donc aussi sur **le garde-fou** qui la rend
exécutable.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible · ⚪ à clarifier

| Critère | Poids | Motif |
|---|---|---|
| L'échec attendu est lisible dans la signature | 🔴 | c'est ce qui manquait : le compilateur doit forcer chaque appelant à le traiter |
| La règle est vérifiée par un outil | 🔴 | ADR 0008 : un garde-fou exécutable, pas un paragraphe |
| Les couches pures restent sans dépendance technique | 🔴 | ADR 0002 : `domain` et `application` ne connaissent aucun framework |
| Le contrat HTTP des clients ne bouge pas | 🟠 | la migration est interne ; `apps/web` ne doit rien voir |
| Coût de la migration | 🟠 | ~20 fichiers de production et leurs specs, une fois |
| Ergonomie d'écriture | 🟢 | un `if (!result.ok)` de plus par appel — assumé |

## Étude des candidats

Deux options, départagées dans l'issue #24 : **A**, `Result` aux frontières `domain`/`application`,
exceptions cantonnées à `infrastructure` et `apps` ; **B**, exceptions partout, le `Result` de
`shared` étant supprimé. B ne tient que par sa gratuité — elle laisse le `instanceof` du filtre et
les signatures muettes, c'est-à-dire le problème.

## Solution retenue

**Option A.** `domain` et `application` **ne jettent jamais** : pas de `throw`, pas d'appel à
`unwrap`.

1. **Un échec attendu est une valeur** (critère 🔴 lisibilité). Il fait partie du type de retour :
   - les **fabriques de value objects** rendent `Result<T, E>` — plus de constructeur qui jette ;
   - les **ports** rendent `Promise<Result<…, E>>` pour ce qu'ils savent dire :
     `ShelfScannerPort.scan` rend `ShelfScanFailed`, `ShelfScanRepositoryPort.markCompleted` et
     `markFailed` rendent `ShelfScanNotFound` ou `ShelfScanAlreadyProcessed` ;
   - les **use cases** rendent `Promise<Result<…, E>>`, où `E` est l'union des échecs qu'ils
     peuvent produire ou laisser passer.
2. **Chaque erreur porte un discriminant `kind`** et forme une union fermée. Le traducteur — en
   HTTP, dans `apps/api` — fait un `switch` exhaustif sur `kind` : un cas d'échec de plus fait
   échouer la compilation, pas un test.
3. **L'exceptionnel n'a pas de canal `throw` dans ces deux couches** (critère 🔴 garde-fou). Une
   base injoignable ou un bucket qui refuse une écriture **ne sont pas modélisés** : l'adapter
   rejette sa promesse, le rejet traverse `application` sans y être lu, et un **filtre HTTP global**
   d'`apps/api` le rattrape en `500` sans stack pour le client (issue #26). La version stricte est
   retenue parce qu'elle rend le garde-fou **total**.
4. **`infrastructure` et `apps` peuvent jeter** — c'est leur rôle face au monde extérieur —, mais
   `infrastructure` **rend un `Result` au passage d'un port** pour tout échec que le port déclare.
   Quand un adapter reconstruit des value objects depuis une source qu'il n'a aucune raison de
   croire corrompue (une ligne Postgres), un `Result` en échec y est un bug : il jette.
5. **`unwrap` est réservé à `infrastructure` et `apps`.** Le garde-fou interdit la *syntaxe*
   `throw`, pas un appel à `unwrap` qui jette à sa place : sans cette interdiction, la porte reste
   ouverte de côté.
6. **Garde-fou** : `no-restricted-syntax` sur `ThrowStatement`, règle **core** d'ESLint, scopée à
   `libs/*/domain/**` et `libs/*/application/**` dans `eslint.config.mjs`. Elle relève de la couche
   ESLint (« ce qu'oxlint ne sait pas exprimer », ADR 0008) : oxlint 1.78 ne connaît pas
   `no-restricted-syntax`. Le garde-fou se vérifie comme les autres : ajouter un `throw` dans
   `libs/recognition/domain` et constater que `yarn lint` échoue.

Le mode d'emploi appliqué (où passe la frontière, fabriques, contrat de port, traduction HTTP) vit
dans [`.claude/rules/error-policy.md`](../../.claude/rules/error-policy.md), et le réflexe court
dans `CLAUDE.md`.

### Conditions de bascule

Rouvrir la décision si le `Result` fait payer plus qu'il ne rapporte, mesuré ainsi :

- **plus d'un tiers des `if (!result.ok)` d'un contexte se contente de renvoyer l'erreur telle
  quelle** (`return result`) sur trois use cases ou plus : la propagation manuelle domine, et un
  combinateur (`flatMap`) ou les exceptions typées sont à reconsidérer ;
- ou **un second contexte fondé** (`bibliography`, ADR 0010) **exprime ses échecs attendus sans
  jamais les distinguer côté appelant** : la valeur d'un `Result` typé est alors nulle et B redevient
  défendable pour lui.

À relire à la fondation de `bibliography`, premier moment où la politique s'applique à un contexte
qu'elle n'a pas façonné.

### Conséquences

- **`shared/result` a ses premiers consommateurs** : sa survie était l'autre moitié de la décision.
  Elle grossit au strict besoin (`mapErr` si une migration le réclame), jamais par anticipation.
- **Le filtre par contexte disparaît.** `RecognitionExceptionFilter` devient une fonction pure de
  traduction, appelée par le contrôleur ; l'exhaustivité du `switch` remplace le `@Catch`. Le filet
  de dernier recours est un filtre global unique, sans connaissance d'aucun contexte (ADR 0003).
- **Le contrat HTTP de `recognition` est inchangé** : mêmes statuts (400, 404, 409, 502), même corps.
- **Coût assumé** : les value objects, les trois ports, les deux use cases, les trois adapters de
  scan, le contrôleur, le bench et une trentaine de specs changent de forme, dans une seule PR — le
  garde-fou ne peut pas être posé sans migrer d'un bloc.
- **Dette acceptée** : un échec d'infrastructure n'est pas typé. Le jour où un use case doit
  réagir à un bucket indisponible (relance, repli), l'échec devient alors attendu et entre dans le
  vocabulaire du port — par un ADR de plus, pas par un `catch` dans `application`.

## Question ouverte

Le combinateur `flatMap` n'est pas ajouté : aucun call-site de la migration n'en a besoin, les
enchaînements étant à deux étapes. Le premier use case qui en compte trois le fera apparaître ;
`shared/result` s'étoffe alors, test d'abord.
