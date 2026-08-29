# infra — Terraform

Provisioning de l'infrastructure GCP (`ADR 0004`, `ADR 0009`). Hors du monorepo Nx : `infra/` a ses
propres outils et sa propre CI (job `terraform` dans `.github/workflows/ci.yml`), pas
`yarn check`.

## Prérequis

| Outil | Version | Installation |
|---|---|---|
| [Terraform](https://developer.hashicorp.com/terraform/install) | **1.15.9** (épinglé, comme CI) | via `mise` ou `tfenv`, voir ci-dessous |
| [tflint](https://github.com/terraform-linters/tflint) | **0.64.0** | via `mise`, ou `brew install tflint` |
| [checkov](https://www.checkov.io/) | **3.3.11** | `pip install checkov==3.3.11` |
| [gcloud CLI](https://cloud.google.com/sdk/docs/install) | — | authentification |

`infra/*/versions.tf` exige `>= 1.9` ; la CI épingle `1.15.9` exact — s'aligner en local pour éviter
tout écart de comportement entre `terraform plan` local et CI. Aucune distro ne fournit Terraform
par défaut (licence BUSL, plus dans `homebrew-core`) : passer par un gestionnaire de versions
plutôt qu'un pin à la main, cohérent avec l'épinglage exact déjà en place pour Node/Yarn
(`CLAUDE.md`). Deux options équivalentes, `mise` ou `tfenv` — les deux lisent le même
`infra/.terraform-version`, il n'y a rien à trancher au niveau du projet.

**mise** ([`infra/mise.toml`](mise.toml)) couvre Terraform *et* tflint d'un coup :

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc && exec zsh

cd infra && mise install   # Terraform 1.15.9 (via .terraform-version) + tflint 0.64.0
```

**tfenv**, pour Terraform seul :

```bash
brew install tfenv
cd infra && tfenv install   # lit infra/.terraform-version, installe 1.15.9
```

`infra/.terraform-version` fixe la version pour tout ce qui est sous `infra/` : les deux outils la
lisent automatiquement dès qu'on est dans le dossier ou un sous-dossier, sans commande à relancer à
chaque session. Côté mise, c'est le réglage `idiomatic_version_file_enable_tools` de `mise.toml` qui
l'autorise — mise ne lit plus ces fichiers par défaut. C'est ce qui évite d'épingler `1.15.9` une
troisième fois, après `.terraform-version` et la CI : côté local, il ne vit que dans
`.terraform-version`.

Volta reste seul maître de Node et Yarn (`CLAUDE.md`) : `mise.toml` ne les déclare pas, et ne doit
pas — deux gestionnaires sur le même outil, c'est une version qui dépend du hook shell qui a
tourné en dernier.

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

`fmt`, `validate`, `tflint`, la **gate de couverture**, `terraform test` (hermétique,
`mock_provider`, sans credentials ni coût) et `checkov` — les commandes exactes sont dans le job
`terraform` de [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), à rejouer en local à
l'identique plutôt que dupliquées ici.

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
infra/modules/           un module par ressource : project, bucket, secret-manager,
                          service-account, artifact-registry, cloud-run-service, neon
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
