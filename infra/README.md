# infra — Terraform

Provisioning de l'infrastructure GCP (`ADR 0004`, `ADR 0009`). Hors du monorepo Nx : `infra/` a ses
propres outils et sa propre CI (job `terraform` dans `.github/workflows/ci.yml`), pas
`yarn check`.

## Prérequis

| Outil | Version | Installation |
|---|---|---|
| [Terraform](https://developer.hashicorp.com/terraform/install) | **1.15.9** | `mise install`, à la racine du dépôt |
| [tflint](https://github.com/terraform-linters/tflint) | **0.64.0** | idem |
| [checkov](https://www.checkov.io/) | **3.3.20** | idem |
| [gcloud CLI](https://cloud.google.com/sdk/docs/install) | — | authentification |

Les trois sont épinglés dans le [`mise.toml`](../mise.toml) de la racine, avec Node et Yarn
([ADR 0001](../docs/adr/0001-stack-et-monorepo-nx.md), amendement du 2026-09-28), et la CI les
installe à partir du même fichier (`jdx/mise-action`) : ce qui tourne en local est, par
construction, ce que la CI exécute. `infra/*/versions.tf` exige `>= 1.9` ; l'épinglage exact évite
tout écart entre un `terraform plan` local et celui de la CI. Aucune distro ne fournit Terraform par
défaut (licence BUSL, plus dans `homebrew-core`) : mise s'en charge.

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc && exec zsh

mise install   # à la racine : Node, Yarn, Terraform, tflint, checkov
```

Mettre à jour une version, c'est modifier une ligne de `mise.toml`. Seules les versions de Node et
de Yarn ont d'autres copies (`package.json`, `docker/*.Dockerfile`), que le garde-fou de CI
« toolchain pins agree » compare à `mise.toml`.

## Authentification

Le provider `google` (`infra/envs/prod/providers.tf`) ne porte pas d'attribut `credentials` : en
l'absence de `GOOGLE_CREDENTIALS`, il retombe sur les **Application Default Credentials** du poste.
En local, personnelles — pas de clé de service account à gérer :

```bash
gcloud auth application-default login
gcloud config set project pick-a-book-505922
```

Le compte utilisateur doit porter les rôles nécessaires aux ressources provisionnées par
`infra/modules/*` — à ajuster selon le principe de moindre privilège, pas détaillé ici.

Le provider `neon` (`infra/envs/prod/providers.tf`) ne porte pas d'attribut `api_key` : il lit
`NEON_API_KEY` dans l'environnement (clé générée depuis Neon Console → Account Settings →
API Keys) :

```bash
export NEON_API_KEY=…
```

## Le state

Le bucket `pick-a-book-tfstate` (backend `gcs`, préfixe `prod`) a été créé **à la main, hors
Terraform**, avant que cette configuration existe — il ne peut pas se gérer lui-même. Il est privé
et versionné. `terraform init` s'y connecte automatiquement via `infra/envs/prod/versions.tf`, sans
configuration supplémentaire côté local.

## Workflow courant

```bash
cd infra/envs/prod
terraform init
terraform plan
```

Pas de `-var-file` : les variables non secrètes vivent dans `prod.auto.tfvars`, que Terraform
charge **automatiquement** (tout fichier `*.auto.tfvars` ou `terraform.tfvars`). Lancer `plan`/`apply`
sans ce fichier chargé ferait retomber Terraform sur des **prompts interactifs** pour `project_id`,
`region` et `neon_org_id` — le nom `*.auto.tfvars` supprime ce piège. Le secret, lui, ne passe pas
par là : `NEON_API_KEY` est lu dans l'environnement par le provider `neon` (voir *Authentification*),
donc il **faut** l'avoir exporté, sans quoi `plan`/`apply` échoue sur `authorization key must be
provided` — tous les providers se chargent, même pour un `apply` qui ne toucherait que du GCP.

Même chose pour l'adresse de l'alerte de sauvegarde : c'est une donnée personnelle dans un dépôt
public, elle n'est donc pas dans `prod.auto.tfvars`. Sans `TF_VAR_alert_email`, Terraform la demande
en prompt interactif.

```bash
export TF_VAR_alert_email=…
```

**Pas de sandbox GCP** (décision figée de l'issue #12) : `plan` est le seul filet avant un `apply`
qui touche directement la prod. Toujours relire un `plan` avant d'`apply`er :

```bash
terraform apply
```

`prod.auto.tfvars` est commité (non secret : `project_id`, `region`, `neon_org_id`).

## Vérifications

`fmt`, `validate`, `tflint`, la **gate de couverture**,
`terraform test` (hermétique, `mock_provider`, sans credentials ni coût) et `checkov` — les
commandes exactes sont dans le job `terraform` de
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), à rejouer en local à l'identique plutôt
que dupliquées ici.

Chaque module **et chaque env** a ses tests dans `tests/*.tftest.hcl` (TDD systématique,
`CLAUDE.md`) : assertions `plan` sur entrées → sorties, sans jamais toucher à un vrai projet GCP.
Les tests de module prouvent le comportement d'une ressource ; ceux d'`envs/prod` prouvent le
**câblage** entre modules — noms dérivés des variables, contrat de secrets dont dépend l'API,
identité propre à chaque service — que par construction aucun test de module ne peut voir.

La **gate de couverture** fait échouer la CI sur tout dossier de `modules/*` ou `envs/*` sans test.
Elle existe parce que `terraform test` sort en **0** sur un dossier qui n'a aucun fichier de test :
une suite au vert ne prouve donc pas à elle seule que quelque chose a été testé, et un nouveau
module sans test passerait inaperçu. Elle compte les blocs `run`, pas les fichiers — un
`.tftest.hcl` vide passe tout aussi silencieusement.

## Organisation

```
infra/modules/           un module par ressource : project, bucket, static-site,
                          secret-manager, service-account, artifact-registry,
                          cloud-run-service, cloud-run-job, job-freshness-alert, neon
infra/modules/*/tests/   *.tftest.hcl — mock_provider, hermétique
infra/envs/prod/         seul environnement à ce jour ; assemble les modules
infra/envs/*/tests/      *.tftest.hcl — tests de câblage entre modules
```

Le module `neon` provisionne l'instance Postgres (région `aws-eu-central-1`, la plus proche
d'`europe-west1` — Neon tourne sur des régions AWS/Azure, pas GCP) et expose sa connexion poolée en
sortie. `envs/prod` la câble directement dans `secret_manager` via `secret_values` : c'est la seule
exception au principe « secrets créés vides » (issue #12, décisions, point 4) — `DATABASE_URL` est
une sortie de ressource gérée, pas une valeur saisie à la main, et peut donc transiter par le state.
`GEMINI_API_KEY` et `OPENROUTER_API_KEY` restent vides, posés hors-bande avec
`gcloud secrets versions add`.

Seule la config racine (`infra/envs/prod/main.tf`) câble les modules entre eux — un module ne
dépend jamais directement d'un autre.

## Front `apps/web` — bucket statique public

`module.static_site` (sorties `web_bucket_name`, `web_url`) sert le front comme un site statique
depuis un **bucket GCS public**, pas un second service Cloud Run. Le bundle Vite construit est du
fichier statique lisible par tous : un runtime de conteneur n'apporterait rien.

Le front est joignable sur l'endpoint partagé de Google
`https://storage.googleapis.com/<bucket>/index.html` — **HTTPS gratuit, sans coût fixe**. Pas de
CDN ni de load balancer : un domaine custom ou Cloud CDN imposerait un load balancer HTTP(S)
facturé à l'heure même à trafic nul, incompatible avec « budget quasi nul » (ADR 0004). Compromis
assumés : URL longue, pas de cache edge, et **pas de réécriture 404 → index.html côté serveur** sur
cet endpoint (le bloc `website{}` ne vaut que pour l'endpoint website HTTP) — `apps/web` porte donc
son routing SPA (hash routing, ou une entrée toujours `index.html`). Le passage à un domaine custom
plus tard est un incrément localisé à ce module.

Déploiement du front (hors Terraform, comme l'image de l'API) : construire le bundle puis le
synchroniser dans le bucket avec les ADC de l'opérateur, sans service account dédié.

```bash
yarn deploy:web                                        # nx build web + gsutil rsync vers le bucket
terraform -chdir=infra/envs/prod output -raw web_url   # URL publique à ouvrir
```

`deploy:web` lit le nom du bucket depuis `terraform output` — rien de codé en dur, portable à l'env
d'un tiers.

## Déploiement de l'API — Cloud Build

`yarn deploy:api` construit l'image `apps/api` **côté serveur avec Cloud Build** (pas de démon
Docker local requis) via [`cloudbuild.yaml`](../cloudbuild.yaml) — le Dockerfile étant à un chemin
non standard (`docker/api.Dockerfile`), `gcloud builds submit --tag` ne peut pas le cibler, d'où ce
fichier de config. Puis `gcloud run deploy` remplace l'image du service ; le module `cloud-run-service`
fait `ignore_changes` sur l'image, donc un futur `terraform apply` ne réécrase pas le déploiement.

```bash
yarn deploy:api
terraform -chdir=infra/envs/prod output -raw api_url   # URL du service
```

Comme `deploy:web`, le script lit projet/région/repo depuis `terraform output`, rien n'est codé en
dur.

Prérequis Cloud Build, une seule fois sur un projet neuf :

```bash
gcloud services enable cloudbuild.googleapis.com   # pas encore dans les APIs du module project

# Les projets GCP récents ne créent plus le service account Cloud Build « legacy » : les builds
# tournent sous le SA Compute par défaut, qui doit porter le rôle builder, sinon `gcloud builds
# submit` échoue en PERMISSION_DENIED même pour un owner.
PROJECT_NUMBER=$(gcloud projects describe pick-a-book-505922 --format='value(projectNumber)')
gcloud projects add-iam-policy-binding pick-a-book-505922 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.builder"
```

`cloudbuild.yaml` porte `logging: CLOUD_LOGGING_ONLY` pour cette raison : sous le SA Compute, le
build ne peut pas écrire dans le bucket de logs par défaut, il envoie ses logs à Cloud Logging.

### Alternative sans Cloud Build — `yarn deploy:api:local`

Build de l'image **en local** (Docker Desktop lancé), push vers Artifact Registry, puis
`gcloud run deploy`. Aucune permission Cloud Build en jeu — utile si le SA build n'est pas encore
en place, ou pour builder hors ligne. Même dérivation `terraform output`, rien codé en dur.

## Sauvegarde de la base — `pg_dump` hebdomadaire (ADR 0006, issue #22)

Le job `pick-a-book-db-backup` (Cloud Run Job, code dans [`tools/db-backup`](../tools/db-backup))
tourne **chaque lundi à 3 h 17, heure de Paris**. Il fait un `pg_dump --format=custom` de la base
Neon par sa connexion directe (`DATABASE_URL_DIRECT`), **prouve** le fichier (`pg_restore --list`
lisible, au moins une table avec des données), l'envoie dans `${project_id}-backups` sous
`postgres/AAAAMMJJTHHMMSSZ.dump`, **puis seulement** élague pour ne garder que les 8 derniers.
Une exécution qui échoue ne touche à rien. Un snapshot élagué reste récupérable 30 jours grâce au
versioning du bucket.

L'alerte `pick-a-book-db-backup — backup not fresh` envoie un email à `TF_VAR_alert_email` si
aucune exécution n'a réussi depuis 8 jours, ou dès qu'une exécution échoue.

### Mise en service (une fois)

```bash
export NEON_API_KEY=… TF_VAR_alert_email=…
cd infra/envs/prod && terraform plan && terraform apply && cd -
yarn deploy:db-backup
gcloud run jobs execute pick-a-book-db-backup --region=europe-west1 --wait
gsutil ls "gs://$(terraform -chdir=infra/envs/prod output -raw backups_bucket_name)/postgres/"
```

- Ce que le `plan` doit montrer : les APIs Cloud Scheduler et Monitoring ; le secret
  `DATABASE_URL_DIRECT` et sa version ; le compte `pick-a-book-db-backup` avec ses deux droits (ce
  secret, `objectUser` sur le bucket de sauvegardes) ; le job, son droit `run.invoker`, son
  planning ; le canal email et la politique d'alerte ; le **retrait** du droit de l'API sur le
  bucket de sauvegardes.
- Lancer la première exécution **juste après** l'`apply` : tant qu'aucune exécution n'a réussi, la
  condition « aucune réussite depuis 8 jours » est vraie, et l'alerte part.
- Si l'`apply` échoue sur `iam.serviceAccounts.actAs`, le compte qui applique Terraform doit porter
  `roles/iam.serviceAccountUser` sur `pick-a-book-db-backup` : créer un job ou un planning qui
  s'exécute sous une identité, c'est agir en son nom.

### Vérifier que l'alerte arrive

Une exécution volontairement cassée doit produire un email dans les minutes qui suivent. La
surcharge ne vaut que pour cette exécution :

```bash
gcloud run jobs execute pick-a-book-db-backup --region=europe-west1 --wait \
  --update-env-vars=BACKUP_GENERATIONS=0
```

### Restaurer

On ne restaure **jamais directement sur la base de prod** : d'abord dans une base vide, qu'on
vérifie, puis on bascule `DATABASE_URL` si c'est un vrai sinistre. `--no-owner --no-privileges` :
les rôles de Neon ne sont pas ceux de la base cible. Il faut `pg_restore` 18 ou plus (`brew install
libpq`, ou l'image `postgres:18.6`).

```bash
BUCKET=$(terraform -chdir=infra/envs/prod output -raw backups_bucket_name)
gsutil ls "gs://${BUCKET}/postgres/"                       # le plus récent est le dernier
gsutil cp "gs://${BUCKET}/postgres/<snapshot>.dump" ./restore.dump

# Essai de restauration, dans le Postgres local (docker compose up db)
psql postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book -c 'CREATE DATABASE restore_check'
pg_restore --no-owner --no-privileges --exit-on-error \
  --dbname=postgresql://pick_a_book:pick_a_book@localhost:5433/restore_check ./restore.dump
psql postgresql://pick_a_book:pick_a_book@localhost:5433/restore_check \
  -c 'SELECT status, count(*) FROM shelf_scans GROUP BY status'
```

En cas de sinistre réel, même commande vers une base Neon **vide** : une branche Neon neuve, ou un
nouveau projet recréé par `terraform apply`, puis `DATABASE_URL` mis à jour. La table des migrations
Drizzle fait partie du dump : au démarrage, l'API trouve le schéma à jour et ne rejoue rien.

L'aller-retour dump → restauration est couvert par les specs de `tools/db-backup`. **La procédure
ci-dessus doit quand même avoir été jouée une fois sur un vrai snapshot de prod** (critère
d'acceptation de #22) : c'est ce qui prouve qu'elle fonctionne contre Neon.

## Bucket des photos de référence (bench reconnaissance, issue #10)

`module.bucket_reference_photos` (sortie `reference_photos_bucket_name`) héberge les photos
d'étagère réelles servant au bench des adapters VLM — l'alternative bucket au dossier local
gitignoré `fixtures/reference-photos/` prévue par l'issue #10. Bucket privé, sans service account
dédié : accès via les ADC de l'opérateur, comme pour `terraform apply` (voir Authentification
ci-dessus).

```bash
gsutil cp mes-photos/*.jpg gs://$(terraform -chdir=infra/envs/prod output -raw reference_photos_bucket_name)/
gsutil ls gs://$(terraform -chdir=infra/envs/prod output -raw reference_photos_bucket_name)/
```

La vérité terrain (YAML) reste commitée dans le dépôt à côté du protocole de bench — seules les
photos elles-mêmes (poids, contexte ressourcerie) passent par ce bucket ou par le dossier local,
jamais par un commit.
