---
paths:
  - "apps/**"
  - "libs/**"
  - "tools/**"
  - "eslint.config.mjs"
  - "package.json"
  - "tsconfig*.json"
---

# Frontières de modules et bounded contexts

Pourquoi : [ADR 0002](../../docs/adr/0002-ddd-et-architecture-hexagonale.md) (hexagonal,
feature-slice), [ADR 0003](../../docs/adr/0003-orchestration-sans-event-bus.md) (orchestration),
[ADR 0010](../../docs/adr/0010-decoupage-bounded-contexts.md) (découpage). Ces règles sont
appliquées par les `tags` Nx et `@nx/enforce-module-boundaries` dans `eslint.config.mjs` : un import
interdit fait échouer `yarn lint`.

## Règles de dépendance

- `domain` ne dépend de rien : ni framework, ni ORM, ni HTTP, ni autre contexte.
- `application` dépend de `domain` seul et parle aux ports, jamais aux adapters.
- Personne ne dépend d'`infrastructure` hors de la composition root (`apps/api`).
- **Un contexte n'importe jamais un autre contexte.** Le croisement se fait dans l'orchestrateur de
  `apps/api`, seul module du dépôt à connaître plus d'un contexte. Il ne manipule que des **DTO de
  frontière** — jamais un objet de domaine — et ne porte aucune règle exprimable dans un contexte.
- **`libs/shared/*` est importable par tous et n'importe aucun contexte.** Une lib par sujet nommé
  (`shared/result`, `shared/ui`) — jamais de `common` ni d'`utils`.
- Côté `web`, une slice n'importe pas l'intérieur d'une autre : passer par une lib partagée.
- Le SQL, le schéma et les migrations restent dans `infrastructure`.

## Bounded contexts

- `recognition` est le seul contexte fondé en code.
- `bibliography` (réconciliation + enrichissement) et `curation` (correspondance avec la
  bibliothèque, la liste de souhaits et les préférences de l'utilisateur) ont leur frontière actée
  mais **pas encore de lib** : chacune arrive avec sa première implémentation. Ne pas en créer au
  jugé avant.

## Nouveau projet Nx

- Il vit sous `apps/*`, `libs/*/*` ou `tools/*`, seuls emplacements couverts par le glob des
  workspaces Yarn. Ailleurs, il n'est pas lié et perd ses tags.
- Il porte **les trois tags** dans le champ `nx.tags` de son `package.json`. Un projet sans tag
  échappe aux règles.

| Dimension | Valeurs |
|---|---|
| `type:` | `domain`, `application`, `infrastructure`, `shared`, `app` |
| `context:` | `recognition`, `bibliography`, `curation`, `none` (libs partagées) |
| `scope:` | `api`, `web`, `shared` |

- Après un déplacement de projet : `yarn nx sync` pour resynchroniser les références TypeScript.

Pour vérifier que le garde-fou est opérant : ajouter un import interdit dans
`libs/recognition/domain` et constater que `yarn lint` échoue.
