# Infra GCP — Terraform

Provisionne le projet GCP et le bucket de photos d'expérimentation. Voir
[ADR 0007](../../docs/adr/0007-provisionnement-terraform.md) pour le pourquoi, et
[ADR 0004](../../docs/adr/0004-hebergement-cloud-run.md) pour la cible d'hébergement générale.

Cette exécution est un geste humain : elle nécessite un compte Google authentifié avec le droit de
créer un projet GCP et de le rattacher à un compte de facturation. Aucun agent ne l'exécute pour
vous.

## Prérequis

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.7
- Le SDK `gcloud`, authentifié :

  ```bash
  gcloud auth application-default login
  ```

- Un compte de facturation GCP existant :

  ```bash
  gcloud billing accounts list
  ```

## Mise en route

1. Copier le fichier de variables et le remplir :

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```

   `project_id` doit être globalement unique (essayer, sinon ajouter un suffixe). `billing_account`
   vient de la commande ci-dessus.

2. **Optionnel** — pour uploader des photos d'étagère comme base d'expérimentation, les déposer
   (JPEG ou autre) dans `data/experiment-photos/` à la racine de ce dossier. **Ce répertoire n'est
   pas versionné** (le repo est open source, on n'y publie pas de photos personnelles) : c'est un
   dépôt local, propre à chaque exécution. Sans photo dans ce dossier, le bucket est simplement
   créé vide.

3. Appliquer :

   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

## Ce que ça crée

- Le projet GCP (`google_project`), rattaché au compte de facturation fourni.
- L'API Cloud Storage, activée sur ce projet.
- Un bucket `<project_id>-experiments` (ou le nom fourni via `experiment_bucket_name`), accès
  uniforme, accès public bloqué.
- Le contenu de `data/experiment-photos/` uploadé sous le préfixe `experiment-photos/` du bucket.

Cloud Run et les autres API applicatives ne sont volontairement pas provisionnées ici — voir la
question ouverte de l'ADR 0007, renvoyée au scaffold applicatif.

## Détruire

```bash
terraform destroy
```

Supprime le bucket et son contenu (bucket non vide : `force_destroy` est à `false` par défaut,
vider le bucket ou passer temporairement cette variable à `true` si suppression volontaire).
