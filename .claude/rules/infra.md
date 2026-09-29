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
  `terraform output`.

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
- Local = CI : `terraform fmt -check -recursive infra`, puis `validate`, `tflint`, `terraform test`
  et `checkov`, commandes exactes dans le job `terraform` de `.github/workflows/ci.yml`.
