# infra — Terraform

Provisioning de l'infrastructure GCP (`ADR 0004`, `ADR 0009`). Hors du monorepo Nx : `infra/` a ses
propres outils et sa propre CI (job `terraform` dans `.github/workflows/ci.yml`), pas
`yarn check`.

## Prérequis

| Outil | Version | Installation |
|---|---|---|
| [Terraform](https://developer.hashicorp.com/terraform/install) | **1.15.9** (épinglé, comme CI) | via `tfenv`, voir ci-dessous |
| [tflint](https://github.com/terraform-linters/tflint) | **0.64.0** | `brew install tflint` ou binaire release |
| [checkov](https://www.checkov.io/) | **3.3.11** | `pip install checkov==3.3.11` |
| [gcloud CLI](https://cloud.google.com/sdk/docs/install) | — | authentification |

`infra/*/versions.tf` exige `>= 1.9` ; la CI épingle `1.15.9` exact — s'aligner en local pour éviter
tout écart de comportement entre `terraform plan` local et CI. Aucune distro ne fournit Terraform
par défaut (licence BUSL, plus dans `homebrew-core`) : passer par
[`tfenv`](https://github.com/tfutils/tfenv), un gestionnaire de versions plutôt qu'un pin à la main,
cohérent avec l'épinglage exact déjà en place pour Node/Yarn (`CLAUDE.md`) :

```bash
brew install tfenv
tfenv install   # lit infra/.terraform-version, installe 1.15.9
```

`infra/.terraform-version` fixe la version pour tout ce qui est sous `infra/` : `tfenv` la lit
automatiquement dès qu'on est dans le dossier ou un sous-dossier, sans `tfenv use` à relancer à
chaque session.

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
terraform plan -var-file=prod.tfvars
```

**Pas de sandbox GCP** (décision figée de l'issue #12) : `plan` est le seul filet avant un `apply`
qui touche directement la prod. Toujours relire un `plan` avant d'`apply`er :

```bash
terraform apply -var-file=prod.tfvars
```

`prod.tfvars` est commité (non secret : `project_id` et `region`).

## Vérifications

`fmt`, `validate`, `tflint`, `terraform test` (hermétique, `mock_provider`, sans credentials ni
coût) et `checkov` — les commandes exactes sont dans le job `terraform` de
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml), à rejouer en local à l'identique plutôt
que dupliquées ici.

Chaque module a ses tests dans `tests/*.tftest.hcl` (TDD systématique, `CLAUDE.md`) : assertions
`plan` sur entrées → sorties, sans jamais toucher à un vrai projet GCP.

## Organisation

```
infra/modules/           un module par ressource : project, bucket, secret-manager,
                          service-account, artifact-registry, cloud-run-service, neon
infra/modules/*/tests/   *.tftest.hcl — mock_provider, hermétique
infra/envs/prod/         seul environnement à ce jour ; assemble les modules
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
