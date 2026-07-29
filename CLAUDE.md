# pick-a-book

Aide à la sélection de livres à partir d'une **photo d'étagère prise au téléphone** (usage :
ressourcerie) : extraction de couples `(auteur, titre)`, réconciliation contre un référentiel
bibliographique, enrichissement. Usage personnel, 20–200 photos/mois. Open source, hébergement
simple et peu coûteux.

> **Repo pas encore scaffoldé** : il n'y a que la documentation. Les chemins et commandes ci-dessous
> décrivent la cible, pas l'existant.

## Décisions actées

Tranchées — ne pas les remettre en question sans nouvel ADR. Le *pourquoi* est dans `docs/adr/`.

- **Stack** — Node/TypeScript, NestJS + React, monorepo Nx, **Yarn** (ligne 4.x, jamais Classic) ·
  [0001](docs/adr/0001-stack-et-monorepo-nx.md)
- **DDD complet**, hexagonal au back, feature-slice au front ·
  [0002](docs/adr/0002-ddd-et-architecture-hexagonale.md)
- **Orchestration** inter-contextes par un use case de `apps/api`. **Pas d'event bus** ·
  [0003](docs/adr/0003-orchestration-sans-event-bus.md)
- **Hébergement** Cloud Run + bucket · [0004](docs/adr/0004-hebergement-cloud-run.md)
- **Reconnaissance** par VLM seul pour le MVP, derrière `ShelfScannerPort`. Le filet
  anti-hallucination est la réconciliation en aval, pas l'OCR ·
  [0005](docs/adr/0005-reconnaissance-livres-photo-etagere.md)
- **Persistance** SQLite sur le bucket monté, versioning + snapshots datés. Corollaire :
  **`max-instances=1`**, un second écrivain corrompt la base ·
  [0006](docs/adr/0006-persistance-sqlite-bucket-monte.md)
- **Enrichissement bibliographique** — ADR à écrire, contraint par 0005

## Outillage

| Node.js | Yarn | Géré par |
|---|---|---|
| **26.5.1** | **4.18.0** | **Volta** (champ `volta` de `package.json`) |

Épinglage exact, jamais en plage. `nodeLinker: node-modules` dans `.yarnrc.yml` — pas de
Plug'n'Play. Deux pièges : sur npm, `yarn@latest` est **1.22.22** (Yarn Classic), la ligne moderne
étant `@yarnpkg/cli` ; et **Node 26 n'est pas encore LTS** (attendu vers octobre 2026), à
reconfirmer avant le premier déploiement.

`package.json` n'existe pas encore — le créer maintenant entrerait en conflit avec le générateur Nx.
Au scaffolding :

```bash
yarn dlx create-nx-workspace@latest pick-a-book --preset=apps --packageManager=yarn
volta pin node@26.5.1
volta pin yarn@4.18.0
```

Puis remplacer ce bloc par les vraies commandes de build, test et lint.

## Architecture cible

```
apps/api/                        # NestJS : composition root, orchestration inter-contextes
apps/web/                        # React : feature-slice
libs/<contexte>/domain/          # entités, value objects, ports — zéro dépendance technique
libs/<contexte>/application/     # use cases, parlent aux ports
libs/<contexte>/infrastructure/  # adapters
libs/shared/<sujet>/             # contenu partagé, une lib par sujet nommé
docs/adr/
```

Règles de dépendance, à faire respecter par les `tags` Nx et `@nx/enforce-module-boundaries` — sans
cette configuration, l'architecture n'est qu'un document :

- `domain` ne dépend de rien : ni framework, ni ORM, ni HTTP, ni autre contexte.
- `application` dépend de `domain` seul et parle aux ports, jamais aux adapters.
- Personne ne dépend d'`infrastructure` hors de la composition root.
- **Un contexte n'importe jamais un autre contexte.** Le croisement se fait dans l'orchestrateur de
  `apps/api`, seul module du repo à connaître plus d'un contexte. Il ne manipule que des **DTO de
  frontière** — jamais un objet de domaine — et ne porte aucune règle exprimable dans un contexte.
- **`libs/shared/*` est importable par tous et n'importe aucun contexte.** Une lib par sujet nommé
  (`shared/result`, `shared/ui`) — jamais de `common` ni d'`utils`, qui accumulent tout et
  dissolvent les frontières.
- Côté `web`, une slice n'importe pas l'intérieur d'une autre : passer par une lib partagée.

Le découpage en bounded contexts n'est pas arrêté — futur ADR.

## Conventions

- TypeScript strict. Pas de `any` implicite, ni de `as` pour faire taire le compilateur.
- Pas de primitives nues dans le domaine : value objects validant à la construction.
- Fichiers en `kebab-case`, classes en `PascalCase`, use cases en verbe explicite
  (`pick-book-for-user.use-case.ts`).
- `domain` et `application` se testent sans infra. Les adapters se testent contre la vraie techno.
- Adapters de reconnaissance : tests sur **réponses enregistrées** ; la non-régression sur photos
  réelles est un test séparé et manuel.
- Le SQL, le schéma et les migrations restent dans `infrastructure`.
- Français dans la doc et les ADR, anglais dans le code et les commits.

## Workflow Git

`main` est protégée : push direct refusé, force-push et suppression interdits, conversations à
résoudre. 0 approbation requise — l'auteur merge sa propre PR.

```bash
git checkout -b feat/ma-feature
gh pr create
gh pr merge --squash --delete-branch
```

Toute décision structurante passe par un ADR avant ou avec le code — procédure dans
[`docs/adr/README.md`](docs/adr/README.md).
