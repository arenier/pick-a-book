# pick-a-book

Aide à la sélection de livres à partir d'une **photo d'étagère prise au téléphone** (usage :
ressourcerie) : extraction de couples `(auteur, titre)`, réconciliation contre un référentiel
bibliographique, enrichissement. Usage personnel, 20–200 photos/mois. Open source, hébergement
simple et peu coûteux.

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
- **Build et test** — **Vite** pour les deux apps, **Vitest** partout. Ni webpack ni Jest ·
  [0007](docs/adr/0007-vite-et-vitest-outillage-unique.md)
- **Enrichissement bibliographique** — ADR à écrire, contraint par 0005

## Outillage

| Node.js | Yarn | Géré par |
|---|---|---|
| **26.5.1** | **4.18.0** | **Volta** (champ `volta` de `package.json`) |

Épinglage exact, jamais en plage. `nodeLinker: node-modules` dans `.yarnrc.yml` — pas de
Plug'n'Play. Trois pièges :

- sur npm, `yarn@latest` est **1.22.22** (Yarn Classic) ; la ligne moderne est publiée sous
  `@yarnpkg/cli`, et le binaire prêt à l'emploi sous `@yarnpkg/cli-dist` ;
- **Node 26 ne fournit plus Corepack.** Le champ `packageManager` ne suffit donc pas à obtenir le
  bon Yarn : c'est Volta qui le fournit en local, et une installation explicite
  (`npm i -g @yarnpkg/cli-dist@4.18.0`) en CI et dans les images Docker ;
- **Node 26 n'est pas encore LTS** (attendu vers octobre 2026), à reconfirmer avant le premier
  déploiement. Les `Dockerfile` de `docker/` épinglent Node de leur côté — les deux épinglages se
  maintiennent à la main.

Build et test passent par **Vite et Vitest sur tous les projets** ([0007](docs/adr/0007-vite-et-vitest-outillage-unique.md)) :
un `vite.config.mts` par app, un `vitest.config.mts` par lib, et `tsc` pour la compilation des
libs. Les générateurs Nx d'app Node proposent encore webpack — ne pas garder ce qu'ils écrivent.
`apps/api/vite.config.mts` passe par **SWC** (`unplugin-swc`) : ni esbuild ni Oxc n'émettent les
métadonnées de décorateurs dont NestJS a besoin, et sans elles l'injection casse **à l'exécution**,
pas à la compilation.

## Commandes

```bash
yarn install                       # installe le workspace
yarn check                         # lint + test + build sur tous les projets
yarn lint                          # nx run-many -t lint
yarn test                          # nx run-many -t test
yarn build                         # nx run-many -t build
yarn typecheck                     # nx run-many -t typecheck
yarn format                        # prettier --write .

yarn api                           # démarre l'API   (http://localhost:3000/health)
yarn web                           # démarre le front (http://localhost:4200)
docker compose up --build          # API + front + émulateur de bucket

yarn nx run-many -t lint -p api    # cibler un projet
yarn nx affected -t lint test build
yarn nx sync                       # resynchronise les références TypeScript après un déplacement
yarn nx graph                      # visualise le graphe de dépendances
```

Avant de démarrer l'API : `cp .env.example .env`. Une variable requise manquante fait échouer le
démarrage avec la liste de ce qui manque — c'est voulu, ne pas la contourner.

## Architecture

```
apps/api/                        # NestJS : composition root, orchestration inter-contextes
apps/web/                        # React : feature-slice
libs/recognition/domain/         # entités, value objects, ports — zéro dépendance technique
libs/recognition/application/    # use cases, parlent aux ports
libs/recognition/infrastructure/ # adapters
libs/shared/result/              # contenu partagé, une lib par sujet nommé
docker/                          # Dockerfile des deux apps — contexte de build : la racine
docs/adr/
```

`recognition` est le seul bounded context fondé aujourd'hui (ADR 0005). Les autres attendent leur
ADR de découpage — ne pas en créer au jugé.

Règles de dépendance, appliquées par les `tags` Nx et `@nx/enforce-module-boundaries` dans
`eslint.config.mjs` — sans cette configuration, l'architecture n'est qu'un document :

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

Les tags portent trois dimensions indépendantes, à poser sur **chaque** nouveau projet dans le champ
`nx.tags` de son `package.json` :

| Dimension | Valeurs |
|---|---|
| `type:` | `domain`, `application`, `infrastructure`, `shared`, `app` |
| `context:` | `recognition`, `none` (libs partagées) |
| `scope:` | `api`, `web`, `shared` |

Un projet sans tag échappe aux règles : c'est la façon la plus simple de percer la frontière sans
s'en apercevoir. Pour vérifier que le garde-fou est encore opérant, ajouter un import interdit dans
`libs/recognition/domain` et constater que `yarn lint` échoue.

Le découpage en bounded contexts n'est pas arrêté — futur ADR.

## Conventions

- TypeScript strict. Pas de `any` implicite.
- **Pas de `as`.** `@typescript-eslint/consistent-type-assertions` en `assertionStyle: 'never'`
  fait échouer `yarn lint` sur une assertion — la règle est appliquée, pas seulement écrite.
  Pour contraindre un type sans perdre l'inférence : **`satisfies`**. Quand le type n'est
  réellement pas connu à la compilation (`process.env`, réponse HTTP, `document.getElementById`) :
  un **type guard** ou une vérification explicite, qui prouve au lieu d'affirmer.
  `as const` n'est pas concerné — il restreint un littéral, il n'affirme rien.
- Pas de primitives nues dans le domaine : value objects validant à la construction.
- Fichiers en `kebab-case`, classes en `PascalCase`, use cases en verbe explicite
  (`pick-book-for-user.use-case.ts`).
- `domain` et `application` se testent sans infra. Les adapters se testent contre la vraie techno.
- Adapters de reconnaissance : tests sur **réponses enregistrées** ; la non-régression sur photos
  réelles est un test séparé et manuel.
- Le SQL, le schéma et les migrations restent dans `infrastructure`.
- **Français dans la doc et les ADR, anglais dans le code** — commentaires, messages d'erreur,
  logs, descriptions de tests (`it('rejects an empty image')`) et commits inclus. Le texte affiché
  à l'utilisateur dans `apps/web` reste en français : c'est du produit, pas du code.

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
