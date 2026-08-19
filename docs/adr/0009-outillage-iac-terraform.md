# ADR 0009 — Outillage d'infrastructure as code : Terraform

Statut : proposé · Date : 2026-08-19 · Phase 1 · Couplé aux ADR [0004](0004-hebergement-cloud-run.md)
(hébergement) et [0006](0006-persistance-postgres-neon.md) (persistance)

## Contexte

L'issue [#12](https://github.com/arenier/pick-a-book/issues/12) ouvre le premier chantier
d'infrastructure : projet GCP (déjà créé à la main), Artifact Registry, bucket de sauvegardes,
Secret Manager, services Cloud Run. Le repo n'a aujourd'hui aucune IaC. L'issue acte l'usage de
Terraform dans `infra/`, mais **une issue ne suffit pas à trancher une décision structurante** — le
[`README.md`](README.md) des ADR l'exige explicitement, et l'issue elle-même en fait le premier
point de sa Definition of Done : cet ADR est ce qui acte réellement l'outil.

Contraintes déjà posées, à respecter par l'outil retenu :

- **TDD systématique, y compris pour l'IaC** (`CLAUDE.md`) : chaque module a ses assertions
  écrites d'abord, exécutées sans credentials ni coût, en CI, vertes et bloquantes.
- **Un seul mainteneur** ([0001](0001-stack-et-monorepo-nx.md)) : la familiarité et la charge
  d'apprentissage d'un nouvel outil sont un critère de premier ordre, pas un confort — l'ADR 0001
  l'a déjà tranché ainsi pour Yarn.
- **Open source, hébergement peu coûteux** : un tiers doit pouvoir cloner le dépôt et reproduire
  l'infrastructure sans dépendre d'un outil au statut incertain.
- **Pas de sandbox GCP** pour les tests d'`apply` (décision figée du commentaire de portée de
  #12) : le filet de sécurité avant l'`apply` en production est `plan` + les tests hermétiques,
  rien d'autre.

Un fait externe pèse sur ce choix et doit être regardé en face, pas glissé sous le tapis :
**HashiCorp a changé la licence de Terraform en août 2023**, passant de MPL 2.0 (open source) à la
**BUSL 1.1** (Business Source License) à partir de la version 1.6 — une licence à source ouverte
mais qui restreint l'usage commercial concurrent du produit HashiCorp lui-même. En réaction, la
**Linux Foundation a créé OpenTofu**, un fork sous gouvernance CNCF qui reste en MPL 2.0, compatible
en syntaxe et en état avec Terraform jusqu'à la version du fork.

## Problématique

Où placer l'effort et le risque : un outil au provider GCP le plus mature et le plus documenté,
sous une licence désormais restrictive et une gouvernance mono-entreprise, contre une alternative
plus jeune qui préserve les garanties open source mais avec un écosystème et une communauté encore
en formation. Corollaire : quel outil permet réellement le test hermétique en TDD qu'exige la
Definition of Done de #12, sans quoi le choix ne tient pas la contrainte la plus dure de l'issue.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible

| Critère | Poids | Motif |
|---|---|---|
| Test natif hermétique (TDD, sans credentials) | 🔴 | Exigence non négociable de #12 et de `CLAUDE.md` ; sans lui l'outil ne remplit pas la Definition of Done. |
| Maturité et complétude du provider GCP | 🔴 | Ressources visées (Cloud Run v2, Secret Manager, Artifact Registry, lifecycle GCS) doivent être couvertes sans détour ni ressource manquante. |
| Coût d'apprentissage, un seul mainteneur | 🔴 | Comme pour Yarn en [0001](0001-stack-et-monorepo-nx.md) : la familiarité déjà acquise pèse plus qu'un avantage marginal d'un outil inconnu. |
| État déclaratif, `plan` avant `apply` | 🔴 | Aucun environnement sandbox (#12) : l'`apply` touche la prod directement, la prévisualisation est le seul filet restant. |
| Licence et gouvernance | 🟠 | Projet open source, éthique de dépendance à un seul fournisseur ; réel mais n'empêche pas l'usage ici (pas de revente d'un produit concurrent). |
| Portabilité pour un tiers | 🟠 | Contrainte déjà posée par [0001](0001-stack-et-monorepo-nx.md) et [0004](0004-hebergement-cloud-run.md) : un contributeur doit pouvoir reproduire l'infra sans connaissance implicite. |
| Verrouillage d'état natif sans infra supplémentaire | 🟢 | Le backend `gcs` suffit aux deux outils ; discriminant faible. |

## Solutions proposées

**A — Terraform (HashiCorp).** ← retenue
- Pour : provider GCP le plus complet et le plus documenté du marché, `terraform test`
  (`.tftest.hcl`) natif depuis la 1.6 avec `mock_provider` depuis la 1.7 — exactement le mécanisme
  que #12 exige, sans dépendance supplémentaire. Écosystème d'outils satellites mûr : `tflint`,
  `checkov`, `terraform fmt`/`validate`. Documentation et exemples abondants, ce qui réduit le
  coût d'apprentissage pour un mainteneur seul.
- Contre : licence **BUSL 1.1** depuis la 1.6 (2023) — plus MPL 2.0, gouvernance resserrée sur une
  seule entreprise, avenir de la licence non garanti. Un usage comme celui-ci (déployer sa propre
  infrastructure, ne pas revendre un produit concurrent de Terraform Cloud/Enterprise) reste
  autorisé par la BUSL, mais le risque n'est pas nul : HashiCorp a déjà changé la licence une fois.

**B — OpenTofu (Linux Foundation, fork CNCF).**
- Pour : reste en **MPL 2.0**, gouvernance communautaire (CNCF) plutôt que mono-entreprise — répond
  directement au critère « licence et gouvernance ». Compatible en syntaxe HCL et en format d'état
  avec Terraform ≤ 1.5.x (point de fork), y compris `terraform test` et `mock_provider`, hérités
  avant la divergence. Migration triviale dans les deux sens sur la version actuelle : même
  binaire, `tofu` en remplacement direct de `terraform`.
- Contre : projet plus jeune (fork d'août 2023), communauté et rythme de publication de provider
  encore en formation comparés à HashiCorp ; sur un provider aussi mouvant que `google` (Cloud Run
  v2 encore actif en évolutions), le risque de décalage de version ou de bug non encore corrigé
  est réel, même s'il ne s'est pas matérialisé à ce jour sur les ressources visées ici.

**C — Pulumi.**
- Pour : état déclaratif avec un vrai langage de programmation (TypeScript, cohérent avec
  [0001](0001-stack-et-monorepo-nx.md)) plutôt que HCL — types partagés envisageables avec le
  reste du repo.
- Contre : le test hermétique sans credentials n'est pas un mécanisme intégré comparable à
  `mock_provider` — Pulumi expose des mocks programmatiques par SDK, à écrire soi-même comme du
  code applicatif, sans le format déclaratif `assert`/`condition` de `.tftest.hcl`. Écarte le
  critère 🔴 le plus dur. Écosystème GCP moins complet que le provider `google` de Terraform.
  Nouvel outil et nouveau modèle mental pour un mainteneur seul, sans bénéfice net ici.

**D — Scripts `gcloud` versionnés.**
- Pour : zéro nouvel outil, contrôle total, pas de state à gérer.
- Contre : écartée d'emblée. Pas d'état déclaratif ni de `plan` — sans sandbox, un script imparfait
  s'exécute directement en prod sans prévisualisation. Aucun cadre de test natif : chaque assertion
  serait à réinventer à la main. Idempotence à la charge du script, pas de la plateforme. Contredit
  le critère 🔴 le plus dur autant que Pulumi, sans même l'atout de Pulumi sur le langage.

**E — GCP Config Connector.**
- Pour : déclaratif via des CRD Kubernetes, cohérent si le projet visait GKE.
- Contre : écartée d'emblée. Suppose un cluster Kubernetes (ou Config Connector en mode
  autonome, lui-même en service géré payant) comme prérequis d'exécution — contraire au budget
  quasi nul de [0004](0004-hebergement-cloud-run.md) pour héberger *l'outil qui héberge*
  l'infrastructure. Pas de mécanisme de test hermétique comparable. Hors de proportion avec un
  service Cloud Run et quelques ressources GCP.

## Solution retenue

**A — Terraform.**

Périmètre : acte l'outil pour l'ensemble de l'infrastructure du projet, tant qu'aucune des
conditions de bascule ci-dessous ne se matérialise. Réversibilité prévue : la syntaxe HCL et le
format d'état sont partagés avec OpenTofu jusqu'au point de fork, ce qui borne le coût d'une
bascule future.

1. **Test natif hermétique (🔴)** — `terraform test` avec `mock_provider` est exactement le
   mécanisme que #12 rend non négociable : assertions `plan` sur entrées → sorties, invariants durs
   (versioning du bucket, secret vide, moindre privilège), sans credentials ni coût, en CI. C'est
   un critère éliminatoire pour Pulumi et les scripts `gcloud`, et Terraform le remplit nativement.
2. **Maturité du provider GCP (🔴)** — `google` et `google-beta` couvrent Cloud Run v2, Secret
   Manager, Artifact Registry et les règles de cycle de vie GCS sans ressource manquante ni détour,
   avec une documentation abondante pour un mainteneur seul qui n'a pas de collègue à qui demander.
3. **Coût d'apprentissage (🔴)** — HCL et le modèle Terraform sont l'option la plus documentée et
   la plus répandue ; le choix suit le même raisonnement que Yarn en
   [0001](0001-stack-et-monorepo-nx.md) : la familiarité déjà large de l'écosystème pèse plus
   qu'un gain marginal d'un outil moins éprouvé.
4. **`plan` avant `apply`, sans sandbox (🔴)** — la prévisualisation de `terraform plan` est le
   seul filet avant un `apply` qui touche directement la prod (#12, absence de sandbox). Terraform
   et OpenTofu l'offrent identiquement ; ce n'est donc pas ce critère qui départage A de B, mais il
   élimine C et D.

### Conditions de bascule

- **La licence BUSL se durcit** (restriction élargie au-delà de la revente d'un produit
  concurrent, ou clause qui toucherait un usage comme le nôtre) → migration vers OpenTofu.
  Techniquement peu coûteuse tant que la divergence syntaxique reste faible : même HCL, état
  compatible, remplacement du binaire.
- **Le provider `google` d'OpenTofu diverge significativement en couverture ou en stabilité** par
  rapport au provider Terraform, dans un sens favorable à OpenTofu → réévaluer alors, pas avant :
  aujourd'hui la divergence est nulle sur les ressources utilisées ici (le fork n'a pas encore
  développé de provider concurrent, il consomme le même registre de providers).
- **HashiCorp restreint l'accès au [registre de providers](https://registry.terraform.io) pour les
  utilisateurs d'OpenTofu**, ce qui a déjà fait l'objet de tensions publiques entre les deux
  projets → si cela se matérialise au point de gêner l'usage d'OpenTofu, cela retire un argument
  de la bascule plutôt que d'en ajouter un.

### Conséquences

- `infra/` s'écrit en HCL, format Terraform natif, avec `terraform test` (`.tftest.hcl`) par
  module et `mock_provider "google"` pour rester hermétique.
- Le binaire `terraform` (1.13.x au moment de cet ADR) devient un outil à installer explicitement
  en CI et en local — comme Yarn 4 sur Node 26 ([0001](0001-stack-et-monorepo-nx.md)), aucune
  distribution ne le fournit par défaut.
- Le state contient des secrets en clair pour toute ressource dont la valeur transite par lui : le
  bucket `pick-a-book-tfstate` reste strictement privé et versionné (déjà posé par #12), quel que
  soit l'outil.
- **Aucun module n'est encore écrit à la date de cet ADR** ; le choix engage la totalité du
  chantier de #12, pas une réécriture partielle.

## Question ouverte

**OpenTofu reste une alternative sérieuse, pas une case cochée par principe.** L'arbitrage ci-dessus
penche pour Terraform sur les critères 🔴 mesurés aujourd'hui (couverture provider, maturité,
familiarité), mais le motif de bascule le plus probable — un durcissement de la licence BUSL — n'est
pas hypothétique : HashiCorp a déjà changé les règles une fois, en 2023, précisément sur ce point.
Cette décision n'inverse pas ce que l'issue [#12](https://github.com/arenier/pick-a-book/issues/12)
a acté (Terraform), et un changement d'outil de stack pour un dépôt qui a un seul mainteneur ne se
décide pas dans une exécution automatisée sans personne en face pour la confirmer : si une évolution
de la licence rend cette question urgente, elle doit être rouverte explicitement par un nouvel ADR (ou
un amendement de celui-ci), pas tranchée silencieusement dans une PR d'infrastructure.
