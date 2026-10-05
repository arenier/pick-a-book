---
paths:
  - "infra/**"
  - "cloudbuild.yaml"
---

# Infrastructure Terraform

Pourquoi : [ADR 0004](../../docs/adr/0004-hebergement-cloud-run.md) (Cloud Run + bucket, budget
quasi nul), [ADR 0009](../../docs/adr/0009-outillage-iac-terraform.md) (Terraform). Mode
d'emploi complet : [`infra/README.md`](../../infra/README.md).

## Structure

- **Un module par ressource** sous `infra/modules/<nom>/` : `main.tf`, `variables.tf`,
  `outputs.tf`, `versions.tf`, `tests/`. La ressource principale se nomme `this`.
- **Seule la config racine (`infra/envs/prod/main.tf`) câble les modules entre eux.** Un module ne
  dépend jamais directement d'un autre.
- Rien de codé en dur côté scripts de déploiement : projet, région, bucket se lisent dans
  `terraform output`. Seuls les scripts `deploy:*` lancés depuis un poste le font : un déploiement
  de la CI ne lit jamais l'état (voir « Déployer par la CI »).

## Tests d'abord

TDD systématique ([`tdd.md`](tdd.md)) : l'assertion s'écrit avant la ressource.

- Chaque module **et** chaque env a ses tests dans `tests/*.tftest.hcl`, en `command = plan` avec
  `mock_provider` : hermétiques, sans credentials ni coût.
- Les tests de module prouvent le comportement d'une ressource ; ceux d'`envs/prod` prouvent le
  **câblage** (noms dérivés, contrat de secrets dont dépend l'API, identité propre à chaque
  service), qu'aucun test de module ne peut voir.
- L'`error_message` d'une assertion dit **pourquoi** la propriété compte, pas seulement ce qui est
  attendu.
- La gate de couverture de la CI compte les blocs `run` : un dossier sans `run` échoue, un
  `.tftest.hcl` vide aussi.

## Sécurité et coût

- **checkov passe en CI.** Un `# checkov:skip=CKV_…` n'est permis qu'avec sa raison sur la même
  ligne (coût, intention assumée), jamais pour faire taire un constat.
- **Moindre privilège** : un service account par service ou job, un droit par besoin.
- **Secrets créés vides**, leur valeur posée hors-bande (`gcloud secrets versions add`). Seule
  exception : `DATABASE_URL`, sortie d'une ressource gérée, qui peut transiter par le state.
- **Aucune donnée personnelle ni secret dans `prod.auto.tfvars`** — le dépôt est public. Ils passent
  par l'environnement (`NEON_API_KEY`, `TF_VAR_alert_email`).
- **Pas de coût fixe** sans nouvel ADR : ni load balancer, ni Cloud CDN, `min_instances = 0`.

## Appliquer

- **Pas de sandbox GCP** : `plan` est le seul filet avant un `apply` qui touche la prod. Ne jamais
  lancer `terraform apply` sans que l'utilisateur ait relu le `plan`.
- Le bucket de state `pick-a-book-tfstate` est géré à la main, hors Terraform : ne pas l'importer.

## Déployer par la CI

Pourquoi : [ADR 0015](../../docs/adr/0015-deploiement-par-la-ci-wif-et-apply-approuve.md).

- **Aucune clé de service account** dans un secret GitHub : Workload Identity Federation, une
  identité par rôle (déploiement, `plan`, `apply`), chacune liée à son environnement et à `main`.
- **L'état et un fichier de plan contiennent des secrets.** Le plan ne se transmet jamais par un
  artefact GitHub (dépôt public) : il passe par le préfixe `plans/` du bucket d'état.
- **L'identité de déploiement ne lit pas l'état.** Les valeurs non secrètes viennent de variables
  GitHub ou de `gcloud ... describe`, pas de `terraform output`.
- **L'`apply` applique le fichier de plan relu**, jamais un nouveau `plan`, et uniquement depuis
  `main`. Un `destroy` ou un `replace` dans le plan fait échouer le job : cela se traite à la main.
- **Déploiement après `apply`**, image taguée par le SHA du commit, Cloud Run redéployé par un
  `gcloud run deploy` explicite (Terraform ignore l'image).
- **Jamais de `plan` ni d'`apply` sur une PR** : le job `terraform` de `ci.yml` reste hermétique.
- La règle « jamais d'`apply` sans `plan` relu » (section précédente) vaut aussi pour un
  déclenchement du workflow par l'outil de Claude Code : la condition sur l'acteur ne l'arrête pas,
  seule cette règle le fait.
- Local = CI : `terraform fmt -check -recursive infra`, puis `validate`, `tflint`, `terraform test`
  et `checkov`, commandes exactes dans le job `terraform` de `.github/workflows/ci.yml`.
