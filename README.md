# pick-a-book

Aide à la sélection de livres à partir d'une **photo d'étagère prise au téléphone**, pour un usage
en ressourcerie : extraction de couples `(auteur, titre)`, réconciliation contre un référentiel
bibliographique, enrichissement.

Usage personnel, 20–200 photos par mois. Open source, hébergement simple et peu coûteux.

## Démarrer

Node **26.5.1** et Yarn **4.18.0**, épinglés dans `package.json` (champ `volta`). Avec
[Volta](https://volta.sh) installé, les deux versions sont posées automatiquement en entrant dans
le dossier. Sans Volta, installer Yarn 4 explicitement — Node 26 ne fournit plus Corepack :

```bash
npm install -g @yarnpkg/cli-dist@4.18.0
```

Puis :

```bash
yarn install
cp .env.example .env    # les variables requises sont commentées dans le fichier
yarn api                # http://localhost:3000/health
yarn web                # http://localhost:4200
```

Ou tout en conteneurs, avec un émulateur de bucket :

```bash
docker compose up --build
```

## Vérifier

```bash
yarn check              # lint + test + build sur tous les projets
```

Build et tests passent par **Vite** et **Vitest** sur tous les projets
([ADR 0007](docs/adr/0007-vite-et-vitest-outillage-unique.md)).

## Organisation

```
apps/api/                        NestJS — composition root, orchestration inter-contextes
apps/web/                        React — feature-slice
libs/recognition/domain/         entités, value objects, ports — zéro dépendance technique
libs/recognition/application/    use cases, parlent aux ports
libs/recognition/infrastructure/ adapters
libs/shared/result/              contenu partagé, une lib par sujet nommé
docker/                          Dockerfile des deux apps — contexte de build : la racine
docs/adr/                        décisions d'architecture
```

Les frontières entre couches et entre contextes ne sont pas qu'une convention : elles sont
appliquées par `@nx/enforce-module-boundaries` et des `tags` Nx, et un import interdit fait échouer
`yarn lint`. Les règles et le *pourquoi* sont dans [`docs/adr/`](docs/adr/) ; le mode d'emploi au
quotidien dans [`CLAUDE.md`](CLAUDE.md).

## Licence

MIT — voir [LICENSE](LICENSE).
