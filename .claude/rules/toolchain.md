---
paths:
  - "mise.toml"
  - "package.json"
  - ".yarnrc.yml"
  - "nx.json"
  - "**/project.json"
  - "docker/**"
  - ".github/workflows/**"
  - "**/vite.config.mts"
  - "**/vitest.config.mts"
  - ".oxlintrc.json"
  - ".oxfmtrc.json"
  - "eslint.config.mjs"
---

# Outillage

## Versions

- **`mise.toml` à la racine est la seule source des versions** (Node, Yarn, Terraform, tflint,
  checkov). La CI les installe à partir du même fichier (`jdx/mise-action`)
  ([ADR 0001](../../docs/adr/0001-stack-et-monorepo-nx.md), amendement du 2026-09-28).
- **Épinglage exact, jamais en plage.** Vaut aussi pour `oxlint-tsgolint`.
- Les `Dockerfile` de `docker/` et les champs `engines`/`packageManager` de `package.json` gardent
  leur copie des versions : le garde-fou de CI « toolchain pins agree » les compare à `mise.toml`.
  Changer une version, c'est la changer partout dans le même commit.
- `nodeLinker: node-modules` dans `.yarnrc.yml` — pas de Plug'n'Play.
- Le client Postgres (`psql`, `pg_dump`) reste hors de mise : `brew install libpq`.

Trois pièges :

- sur npm, `yarn@latest` est **1.22.22** (Yarn Classic). La ligne moderne est publiée sous
  `@yarnpkg/cli`, et le binaire prêt à l'emploi sous `@yarnpkg/cli-dist` ;
- **Node 26 ne fournit plus Corepack.** Le champ `packageManager` ne suffit pas : `mise.toml`
  déclare Yarn par son paquet npm (`"npm:@yarnpkg/cli-dist"`), et les images Docker l'installent
  explicitement (`npm i -g @yarnpkg/cli-dist@<version>`) ;
- **Node 26 n'est pas encore LTS** (attendu vers octobre 2026), à reconfirmer avant le premier
  déploiement.

## Build et test : Vite et Vitest partout

Pourquoi : [ADR 0007](../../docs/adr/0007-vite-et-vitest-outillage-unique.md).

- Un `vite.config.mts` par app, un `vitest.config.mts` par lib, `tsc` pour compiler les libs.
- **Ni webpack ni Jest.** Les générateurs Nx d'app Node proposent encore webpack : ne pas garder ce
  qu'ils écrivent.
- `apps/api/vite.config.mts` passe par **SWC** (`unplugin-swc`) : ni esbuild ni Oxc n'émettent les
  métadonnées de décorateurs dont NestJS a besoin. Sans elles, l'injection casse **à l'exécution**,
  pas à la compilation.

## Lint et format : oxlint + oxfmt

Pourquoi, et relevé des règles retenues et écartées :
[ADR 0008](../../docs/adr/0008-lint-et-format-oxlint-oxfmt.md).

- **oxlint** est le linter principal, en catégories strictes, lancé avec `--type-aware`.
- **`oxlint-tsgolint` est requis** : sans lui, `yarn lint` s'arrête sur
  `Failed to find tsgolint executable`.
- **ESLint n'est conservé que pour ce qu'oxlint ne sait pas exprimer** :
  `@nx/enforce-module-boundaries` et `@nx/dependency-checks`, fondées sur le graphe Nx.
- **`eslint-plugin-oxlint` reste en dernier** dans `eslint.config.mjs` : il éteint les doublons.
- Le bloc **`overrides`** de `.oxlintrc.json` cible `**/*.{spec,test}.{ts,tsx}`. Ce scope n'est
  pas décoratif : sans lui, les règles du plugin `vitest` contraignent aussi `main.ts`.
- Chaque règle stricte désactivée l'est pour une raison tracée dans l'ADR 0008 (runtime JSX de
  React 19, CommonJS de l'API, modules NestJS). En désactiver une autre passe par l'ADR.
- **oxfmt** remplace Prettier (`singleQuote`, `printWidth: 100`) et ne touche pas au Markdown.
- Adopter Oxc ne rouvre pas l'ADR 0007 : SWC reste le transpileur du build.

## `yarn check` et la CI vérifient les mêmes cibles

- CI : oxlint et oxfmt sur tout le dépôt, puis `nx affected -t lint typecheck test build
  translations` (base calculée par `nrwl/nx-set-shas`). `yarn check` : les mêmes, en `run-many`.
- La seule différence assumée est la sélection des projets. Le garde-fou « check and CI verify the
  same targets » échoue si la liste des cibles Nx ou l'une des deux étapes Oxc diverge : ajouter
  une cible, c'est l'ajouter des deux côtés.
