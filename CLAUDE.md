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
- **Persistance** Postgres managé (Neon), backup `pg_dump` versionné vers le bucket. La base quitte
  le bucket : plus de `max-instances=1`, le bucket redevient un simple object store (images, assets) ·
  [0006](docs/adr/0006-persistance-postgres-neon.md)
- **Build et test** — **Vite** pour les deux apps, **Vitest** partout. Ni webpack ni Jest ·
  [0007](docs/adr/0007-vite-et-vitest-outillage-unique.md)
- **Lint et format** — **oxlint** (strict) + **oxfmt**, écosystème Oxc. ESLint conservé pour les
  seules frontières de modules Nx · [0008](docs/adr/0008-lint-et-format-oxlint-oxfmt.md)
- **Enrichissement bibliographique** — ADR à écrire, contraint par 0005
- **Internationalisation** de `apps/web` — **i18next** + react-i18next, français (source) et anglais,
  langue du navigateur avec repli sur le français, un catalogue par slice. L'API ne renvoie jamais
  de texte destiné à l'utilisateur · [0011](docs/adr/0011-internationalisation-de-l-interface.md)
- **Design system** de `apps/web` — **shadcn/ui** sur Radix et **Tailwind 4**, composants copiés dans
  `libs/shared/ui` et mis aux normes du dépôt ; palette neutre, Literata pour les titres de livres,
  mode sombre qui suit le système · [0012](docs/adr/0012-design-system-de-l-interface.md),
  [note 0002](docs/decisions/0002-grandes-lignes-du-design-system.md)
- **Découpage en bounded contexts** — `recognition` (reconnaissance depuis une photo),
  `bibliography` (réconciliation + enrichissement, un seul contexte pour l'instant) et `curation`
  (correspondance avec la bibliothèque, la liste de souhaits et les préférences de l'utilisateur) ·
  [0010](docs/adr/0010-decoupage-bounded-contexts.md)

## Où vit quoi

| Objet | Où | Répond à |
|---|---|---|
| **ADR** | `docs/adr/` | *Pourquoi* une décision transverse, et à quelles conditions on en changerait. Figé une fois accepté. |
| **Note de décision** | `docs/decisions/` | Un choix de niveau inférieur, sans impact architectural. |
| **Rule** | `.claude/rules/` | *Quoi faire* en écrivant le code. Vivante, courte, impérative ; renvoie à son ADR sans le recopier. |
| **Spec** | `specs/NNN-*/` | Le comportement et le scope d'une feature (Spec Kit). |
| **Constitution** | `.specify/memory/constitution.md` | Les principes, relus par `/speckit-plan` et `/speckit-implement`. |

Une règle que l'outillage peut vérifier est vérifiée par lui (lint, CI) : la rule le signale, elle
ne s'y substitue pas. Quand un ADR acte une règle d'exécution, la même PR crée ou met à jour la
rule correspondante et la ligne de l'index ci-dessous.

## Rules

Les rules sans `paths` sont chargées à chaque session ; les autres quand un fichier qu'elles ciblent
est lu. L'essentiel de chacune tient en une ligne ci-dessous, pour qu'il reste visible avant même
que le fichier ne soit chargé.

| Rule | S'applique à | L'essentiel |
|---|---|---|
| [`tdd.md`](.claude/rules/tdd.md) | tout le dépôt | **TDD systématique**, IaC et correctifs compris ; `domain`/`application` sans infra, adapters contre la vraie techno ou sur réponses enregistrées |
| [`typescript.md`](.claude/rules/typescript.md) | `*.ts`, `*.tsx` | Strict, **pas de `as`** (`satisfies` ou type guard) ; value objects dans le domaine ; `async` sans `await` voulu ; `kebab-case` ; anglais dans le code |
| [`tests.md`](.claude/rules/tests.md) | specs | `*.spec.ts` ; imports `vitest` explicites ; `toStrictEqual`, `toBe(true)` |
| [`module-boundaries.md`](.claude/rules/module-boundaries.md) | `apps/`, `libs/`, `tools/` | `domain` → rien, `application` → `domain` ; un contexte n'importe jamais un autre ; trois tags Nx sur chaque projet |
| [`web-interface.md`](.claude/rules/web-interface.md) | `apps/web`, `libs/shared/{i18n,ui}` | Aucun texte en dur : catalogue i18next fr + en ; composants dans `libs/shared/ui` ; classes Tailwind sur les tokens |
| [`toolchain.md`](.claude/rules/toolchain.md) | configs, `docker/`, CI | Versions dans `mise.toml` seul, à l'exact ; Vite/Vitest, SWC pour l'API ; oxlint type-aware, ESLint pour les frontières |
| [`adr.md`](.claude/rules/adr.md) | `docs/adr/`, rules, `CLAUDE.md` | Procédure de `docs/adr/README.md` ; un ADR accepté ne se réécrit pas ; ADR et rule vont ensemble |
| [`commits-and-pull-requests.md`](.claude/rules/commits-and-pull-requests.md) | tout le dépôt | Commits et **titre de PR en anglais**, corps de PR en français |
| [`always-work-in-a-worktree.md`](.claude/rules/always-work-in-a-worktree.md) | tout le dépôt | Un worktree `wt` par tâche, jamais sur `main` |

## Commandes

```bash
mise install                       # pose Node, Yarn, Terraform, tflint, checkov (versions : mise.toml)
yarn install                       # installe le workspace
yarn check                         # lint + format + typecheck + test + build + translations, tous projets
yarn lint                          # oxlint puis nx run-many -t lint (ESLint : frontières)
yarn test                          # nx run-many -t test
yarn build                         # nx run-many -t build
yarn typecheck                     # nx run-many -t typecheck
yarn nx translations web           # i18next-cli status + lint : traduction absente, texte en dur
yarn format                        # oxfmt          (yarn format:check pour vérifier sans écrire)

yarn api                           # démarre l'API   (http://localhost:3000/health)
yarn web                           # démarre le front (http://localhost:4200)
yarn bench                         # départage les adapters VLM (appels live, hors CI) — voir tools/bench/README.md
yarn db:generate                   # génère une migration Drizzle depuis le schéma de recognition-infrastructure
docker compose up --build          # API + front + Postgres + émulateur de bucket

yarn nx run-many -t lint -p api    # cibler un projet
yarn nx affected -t lint test build
yarn nx sync                       # resynchronise les références TypeScript après un déplacement
yarn nx graph                      # visualise le graphe de dépendances
```

Avant de démarrer l'API : `cp .env.example .env`. Une variable requise manquante fait échouer le
démarrage avec la liste de ce qui manque — c'est voulu, ne pas la contourner. `yarn api` a besoin
du Postgres et de l'émulateur de bucket de la stack (`docker compose up db bucket`) : l'API applique
les migrations au démarrage, et les specs des adapters de `recognition-infrastructure` et de
`tools/db-backup` tournent contre ces deux mêmes services (la CI les démarre aussi). Celles de
`tools/db-backup` appellent aussi `pg_dump`, `pg_restore` et `psql` du `PATH`, en **version 18 ou
plus** (la majeure de la prod) : sans eux, `yarn check` échoue sur ce projet.

La **CI** (`.github/workflows/ci.yml`) tourne sur chaque PR et push `main`, et vérifie les mêmes
cibles que `yarn check` sur les seuls projets touchés — détail dans
[`toolchain.md`](.claude/rules/toolchain.md).

## Architecture

```
apps/api/                        # NestJS : composition root, orchestration inter-contextes
apps/web/                        # React : feature-slice
libs/recognition/domain/         # entités, value objects, ports — zéro dépendance technique
libs/recognition/application/    # use cases, parlent aux ports
libs/recognition/infrastructure/ # adapters (Gemini, Qwen, stub) derrière ShelfScannerPort
libs/shared/result/              # contenu partagé, une lib par sujet nommé
libs/shared/text-match/          # normalisation + comparaison floue de chaînes (bench, réconciliation)
libs/shared/i18n/                # façade i18next du front (useMessages, createI18n) — seule à importer i18next
libs/shared/ui/                  # design system du front : composants shadcn/ui, Tailwind, tokens — seule autorisée à importer Radix
tools/bench/                     # départage manuel des adapters VLM sur photos réelles (#10) — hors CI
tools/db-backup/                 # pg_dump hebdomadaire vers le bucket (Cloud Run Job, #22) — voir son README
docker/                          # Dockerfile des apps et du job de sauvegarde — contexte de build : la racine
docs/adr/                        # décisions d'architecture : le pourquoi
docs/decisions/                  # notes de décision de niveau inférieur (pas des ADR)
infra/                           # infrastructure GCP en Terraform — voir infra/README.md
.claude/rules/                   # règles d'écriture du code : le quoi (voir « Rules » plus haut)
.specify/                        # Spec Kit : constitution, templates, scripts (voir plus bas)
specs/                           # une spec par feature, gardée durablement (Spec Kit)
```

`recognition` est le seul bounded context fondé en code ; `bibliography` et `curation` arrivent
avec leur première implémentation. Les trois se croisent uniquement dans l'orchestrateur
d'`apps/api`, via des DTO de frontière. Les règles de dépendance, appliquées par les tags Nx et
`@nx/enforce-module-boundaries`, sont dans [`module-boundaries.md`](.claude/rules/module-boundaries.md).

## Spec-driven development (GitHub Spec Kit)

Toute feature non triviale se spécifie avant de se coder, avec [GitHub Spec
Kit](https://github.com/github/spec-kit) : `specs/NNN-nom-feature/spec.md` est la source de vérité
du comportement et du scope de la feature, gardée durablement dans le repo. Toute évolution
ultérieure de cette feature **repasse par la spec avant le code**, jamais l'inverse. Une spec qui
bute sur une décision transverse propose un ADR, elle ne tranche pas à sa place. L'issue GitHub
reste le point d'entrée de discussion et de suivi ; elle référence la spec sans la dupliquer.

```
/speckit-constitution   # établit/amende les principes projet (.specify/memory/constitution.md)
/speckit-specify        # crée ou met à jour spec.md à partir d'une description en langage naturel
/speckit-clarify        # (optionnel) désambiguïse spec.md avant /speckit-plan
/speckit-plan           # produit plan.md, respecte la constitution et les ADR
/speckit-tasks          # découpe plan.md en tasks.md, ordonnées par dépendance
/speckit-analyze        # (optionnel) vérifie la cohérence spec/plan/tasks avant d'implémenter
/speckit-implement      # exécute tasks.md
/speckit-taskstoissues  # (optionnel) convertit tasks.md en issues GitHub
```

Mode d'emploi détaillé — ordre d'enchaînement, entrée/sortie de chaque commande, comment reprendre
une feature déjà spécifiée — dans [`docs/spec-driven-development.md`](docs/spec-driven-development.md).

La constitution reflète les principes de ce fichier et des rules — TDD, architecture hexagonale et
bounded contexts étanches, pas de `as`, outillage unique, français en doc/anglais en code. Elle se
met à jour avec `/speckit-constitution`, jamais en divergeant à la main.

## Workflow Git

**Toujours travailler dans un worktree dédié** (worktrunk `wt`) — voir
[`always-work-in-a-worktree.md`](.claude/rules/always-work-in-a-worktree.md), config dans
[`.config/wt.toml`](.config/wt.toml). Commits et PR :
[`commits-and-pull-requests.md`](.claude/rules/commits-and-pull-requests.md).

```bash
wt switch --create feat/ma-feature   # branche + worktree isolé (pre-start fait yarn install)
wt api                               # API sur un port dérivé de la branche · wt web pour le front
gh pr create
gh pr merge --squash --delete-branch
wt remove                            # nettoie le worktree ; supprime la branche si mergée
```

Toute décision structurante passe par un ADR avant ou avec le code — procédure dans
[`docs/adr/README.md`](docs/adr/README.md).
