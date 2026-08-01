# ADR 0007 — Provisionnement de l'infra GCP par Terraform

Statut : accepté · Date : 2026-08-01 · Phase 1 · Couplé à l'ADR [0004](0004-hebergement-cloud-run.md)

## Contexte

Avant même le scaffold de l'application, il faut un projet GCP et un bucket de stockage — d'abord
pour héberger un lot de photos d'étagère servant de base d'expérimentation pour
[0005](0005-reconnaissance-livres-photo-etagere.md), avant même que le code n'existe. L'ADR 0004 a
déjà acté Cloud Run + bucket comme cible d'hébergement, et pose une contrainte : un tiers doit
pouvoir redéployer le projet chez lui sans configuration connue de nous seuls.

L'environnement d'exécution de l'agent qui rédige ce projet n'a pas d'identifiants GCP : la
création réelle des ressources est nécessairement exécutée par un humain authentifié avec son
propre compte Google.

## Problématique

Comment décrire la provision de l'infra pour qu'elle soit rejouable par n'importe qui disposant
d'un compte GCP, plutôt que consignée comme une suite de commandes tapées une fois et oubliées.

## Critères de choix

| Critère | Poids | Motif |
|---|---|---|
| Reproductibilité pour un tiers | 🔴 | Contrainte open source héritée de l'ADR 0004. |
| Pas de nouvel écosystème de langage | 🟠 | Le projet est déjà Node/TypeScript ; un outil d'infra dans un autre langage est acceptable seulement s'il n'ajoute pas de coût d'apprentissage disproportionné. |
| État traçable / dérive détectable | 🟠 | Le projet vivra plusieurs mois ; savoir ce qui existe réellement compte plus qu'au premier jour. |
| Coût d'outillage | 🟢 | Usage personnel, pas d'équipe à former. |

## Solutions proposées

**A — Terraform (provider `google`).** Déclaratif, état explicite, `plan` avant `apply`,
largement documenté pour GCP, indépendant du langage applicatif.
- Pour : reproductible par un tiers avec le seul binaire `terraform` ; détecte la dérive ; le
  provider `google` couvre projet, IAM, bucket sans code custom.
- Contre : un outil et un langage (HCL) de plus dans le dépôt.

**B — Script `gcloud` shell.** Suite de commandes `gcloud`/`gsutil` versionnée.
- Pour : zéro dépendance nouvelle, lisible directement.
- Contre : pas d'état, pas de détection de dérive, ré-exécution non idempotente sans travail
  manuel (vérifier l'existant avant chaque création).

**C — Pulumi (TypeScript).** Même modèle que Terraform mais dans le langage du reste du repo.
- Pour : cohérent avec la stack déclarée en 0001.
- Contre : écosystème GCP moins mature que le provider Terraform officiel ; pas de gain réel ici
  puisque l'infra ne partage ni types ni code avec l'application. Écartée pour ce motif, pas
  rouverte sans un besoin concret de partage de code.

**D — Google Cloud Deployment Manager / Config Connector.** Écartée d'emblée : Deployment Manager
est en fin de vie, Config Connector suppose un cluster Kubernetes déjà écarté en 0004.

## Solution retenue

**A — Terraform**, périmètre initial : projet GCP, API Storage, bucket unique pour les photos
d'expérimentation. Le Cloud Run et les API associées suivront dans une PR ultérieure, au moment du
scaffold applicatif — pas anticipés ici pour rester couplés au besoin réel.

1. Reproductibilité 🔴 : `terraform apply` avec un fichier de variables est la définition même de
   « redéployable par un tiers ».
2. État traçable 🟠 : le state Terraform répond à « qu'est-ce qui existe vraiment », ce qu'un
   script shell ne peut pas garantir sans relecture manuelle.

### Conditions de bascule

Si l'infra applicative (Cloud Run, IAM fin, comptes de service) devient assez complexe pour que
partager des types avec le code TypeScript du repo apporte une valeur réelle, reconsidérer Pulumi
à ce moment — pas avant, faute de besoin concret.

### Conséquences

- Le repo gagne un dossier `infra/terraform/` hors du monorepo Nx applicatif — pas de conflit avec
  le générateur Nx à venir.
- La création réelle des ressources (`terraform apply`) reste un geste humain, authentifié avec un
  compte GCP personnel ou un compte de service — jamais exécutée par un agent sans identifiants.
- Le state Terraform et les fichiers `.tfvars` contiennent des identifiants de projet et de
  facturation : ils ne sont pas versionnés (voir `.gitignore`), seul le code déclaratif l'est.
- Les photos d'expérimentation elles-mêmes ne sont pas versionnées dans le repo (open source) :
  Terraform les uploade depuis un dossier local ignoré de git, à charge de chacun d'y déposer ses
  propres photos.

## Question ouverte

Le périmètre exact des API et ressources GCP à activer pour Cloud Run (comptes de service,
IAM, registre de conteneurs) est renvoyé au moment du scaffold — pas tranché ici.
