# ADR 0015 — Déploiement par la CI : Workload Identity Federation, et `apply` Terraform sur un plan relu

Statut : proposé · Date : 2026-10-04 · Couplé aux ADR [0004](0004-hebergement-cloud-run.md)
(hébergement), [0006](0006-persistance-postgres-neon.md) (persistance) et
[0009](0009-outillage-iac-terraform.md) (Terraform)

## Contexte

Aujourd'hui, tout ce qui touche la prod se lance **à la main, depuis un poste** : `yarn deploy:api`
(Cloud Build puis `gcloud run deploy`), `yarn deploy:web` (`nx build web` puis `gsutil rsync`),
`yarn deploy:db-backup`, et `terraform apply`. La CI (`ci.yml`) vérifie sans jamais déployer, et
elle n'a aucun chemin d'authentification vers GCP : le job `terraform` est hermétique par
construction (`init -backend=false`, `mock_provider`).

Trois faits contraignent la solution :

- **Le dépôt est public.** Une PR d'un fork ne reçoit ni jeton OIDC ni secret ; une branche du
  dépôt lui-même en reçoit.
- **L'état Terraform contient des secrets** (`DATABASE_URL` et `DATABASE_URL_DIRECT` y transitent,
  par exception assumée de l'issue #12). Lire l'état, ou un fichier de plan, c'est lire ces
  secrets.
- **Le projet GCP est partagé** avec d'autres services : une identité d'`apply` en `roles/owner`
  pourrait les toucher.

Le garde-fou « pas de sandbox GCP, `plan` relu avant `apply` » ([0009](0009-outillage-iac-terraform.md),
issue #12) reste en vigueur : l'automatisation ne doit pas l'affaiblir.

## Problématique

Où placer la confiance. D'une part, **qui peut obtenir quelle identité GCP**, sans clé longue durée
qui traîne dans un secret GitHub. D'autre part, **où l'humain approuve un `apply`**, pour que son
accord porte sur le **plan** et non sur le diff de code : l'incident de #28 a montré que les deux
divergent.

Corollaire : un déploiement d'image et un `apply` n'ont pas le même profil de risque. Le premier se
retire par un retour de trafic vers la révision précédente ; le second peut détruire une ressource.
Le même garde-fou ne leur convient pas.

## Critères de choix

Légende : 🔴 fort · 🟠 moyen · 🟢 faible

| Critère | Poids | Motif |
|---|---|---|
| Aucun secret longue durée vers GCP | 🔴 | Dépôt public, un seul mainteneur : une clé de service account en secret est la fuite qu'on ne verrait pas. |
| L'`apply` applique le plan relu | 🔴 | Sans sandbox, le plan est le seul filet ; il ne vaut que s'il est celui qui s'exécute. |
| Moindre privilège, projet partagé | 🔴 | Le déploiement n'a pas à lire l'état (donc les secrets) ; l'`apply` n'a pas à être `owner`. |
| Aucun secret dans un support lisible du public | 🔴 | Plan et état contiennent des valeurs sensibles en clair ; un artefact de dépôt public est téléchargeable. |
| Peu de machinerie pour un seul mainteneur | 🟠 | Un contrôle qui n'ajoute rien à un seul humain est du coût. |
| Budget quasi nul | 🟠 | [0004](0004-hebergement-cloud-run.md) : pas de service facturé au repos. |

## Étude des candidats

Consignée dans les issues [#32](https://github.com/arenier/pick-a-book/issues/32) et
[#33](https://github.com/arenier/pick-a-book/issues/33) : authentification (clé de service account
contre Workload Identity Federation), forme de l'approbation (`plan` sur PR, après merge, ou manuel),
transport du plan (artefact en clair, artefact chiffré, bucket privé), et les écarts entre
l'énoncé de #32 et l'état réel du dépôt.

## Solution retenue

**Workload Identity Federation** depuis GitHub Actions, trois identités distinctes, et un
**workflow unique déclenché à la main** (`workflow_dispatch`, depuis `main`) qui enchaîne build,
`plan`, `apply` éventuel puis déploiement.

**Les identités.** Un pool d'identités et un provider OIDC GitHub, dont la condition d'attribut
limite à ce dépôt. Chaque identité GCP n'est impersonable que depuis un contexte précis, imposé par
Google et non par une convention de workflow :

| Identité | Contexte exigé | Droits |
|---|---|---|
| déploiement | environnement `prod-deploy`, `main` | construire et pousser l'image, déployer l'API et le job de sauvegarde, écrire dans le bucket du front. **Aucun accès à l'état.** |
| `plan` | environnement `prod-plan`, `main` | lire les ressources du projet, lire et verrouiller l'état, écrire sous `plans/` |
| `apply` | environnement `prod-apply`, `main`, déclenchement manuel | écrire les ressources gérées par `infra/`, **sans `roles/owner`** |

**L'enchaînement.**

```
build + push image ─┐
                    ├─► apply (si le plan a des changements) ─► déploiement API, front, job
terraform plan ─────┘                    (sans changement : directement)
```

1. **Le plan est transmis par un bucket privé** (préfixe `plans/` du bucket d'état, expiré par une
   règle de cycle de vie), **jamais en artefact GitHub** : un fichier de plan contient les valeurs
   sensibles, et les artefacts d'un dépôt public sont téléchargeables.
2. **L'`apply` applique ce fichier de plan**, pas un nouveau `plan`. Terraform refuse un plan périmé
   si l'état a changé entre-temps.
3. **Le job échoue (rouge) sur un `destroy` ou un `replace`.** Un `state mv`, une suppression ou une
   récupération se traite à la main, avec une procédure écrite dans `infra/README.md`. Une erreur
   transitoire (propagation IAM) ne se relance pas automatiquement : l'humain décide.
4. **Le déploiement vient après l'`apply`.** Un code qui exige une ressource nouvelle (c'est le
   cas de `BUCKET_NAME`, #68) atterrit sur l'infrastructure déjà appliquée.
5. **Chaque image est taguée par le SHA du commit**, et Cloud Run est redéployé par un
   `gcloud run deploy` explicite : Terraform ne gère pas l'image (`ignore_changes`, #31), et un tag
   par SHA change la spec à chaque déploiement.
6. **Le déploiement ne lit pas l'état.** Les valeurs non secrètes (projet, région, noms) viennent de
   variables GitHub ou de `gcloud ... describe`, pas de `terraform output`.
7. **Pas de `plan` ni d'`apply` sur une PR**, et jamais d'`apply` depuis une autre branche que
   `main`. Le job `terraform` de `ci.yml` reste hermétique.
8. **Les secrets de l'`apply`** (`NEON_API_KEY`, `TF_VAR_alert_email`) sont des secrets de
   l'environnement `prod-apply`, visibles du seul job concerné.

Raisons : la WIF répond au critère « aucun secret longue durée » ; des identités liées à un
contexte et séparées, dont une sans accès à l'état, répondent au moindre privilège ; le fichier de
plan relayé par un bucket répond à la fois à « l'`apply` applique le plan relu » et à « aucun
secret dans un support public » ; un seul déclenchement manuel garde peu de machinerie pour un seul
mainteneur.

L'amorçage se fait à la main, comme le bucket d'état : la première application qui crée les
identités ne peut pas passer par elles.

### Conditions de bascule

- **Un second contributeur peut déclencher le workflow** → activer un reviewer requis sur
  `prod-apply` : le déclenchement manuel ne vaut plus approbation par une seule personne.
- **Le workflow passe sur `push main`** → même condition, reviewer requis, et le `plan` ne demande
  une approbation que s'il a des changements (`-detailed-exitcode`).
- **Un `plan` sur PR devient nécessaire** (relire avant de merger) → seulement si l'état ne porte
  plus de secrets, ou si le dépôt devient privé.
- **Le dépôt devient privé** → un artefact GitHub redevient une option, à la place du bucket, pour
  transporter le plan.

### Conséquences

- `infra/` gagne un module d'identités (pool, provider, comptes, liaisons) et la règle de cycle de
  vie du préfixe `plans/`, avec leurs tests `plan` écrits d'abord.
- Les `deploy:*` locaux restent comme secours, avec `terraform output` ; la CI n'en dépend pas.
- Un workflow de déploiement et d'`apply` rejoint `.github/workflows/` ; le mode d'emploi,
  le retour arrière (`update-traffic` d'une révision précédente) et la procédure manuelle sur
  dérive vont dans `infra/README.md`.
- Les réglages GitHub (environnements `prod-deploy`, `prod-plan`, `prod-apply` ; le job
  `terraform` comme contexte requis du ruleset « Protect main ») sont faits par le propriétaire
  du dépôt, hors code.
- Un déclenchement manuel peut être oublié : l'infrastructure peut rester en retard sur `main`.
- Les secrets de l'environnement `prod-apply` recoupent l'issue #41.

## Question ouverte

À éprouver par un essai avant d'accepter cet ADR (le statut reste « proposé » jusqu'à la première
exécution réelle) :

- les claims OIDC que la condition d'attribut doit lire (`ref`, `event_name`, `actor`,
  environnement) et leur forme exacte ;
- la liste précise des rôles de l'identité d'`apply`, déduite du `plan` actuel ressource par
  ressource ;
- que le verrou d'état du backend `gcs` fait échouer deux exécutions qui se chevauchent.

L'outil de déclenchement de workflows de Claude Code agit avec le compte du propriétaire : la
condition sur l'acteur ne l'arrête pas. Ce qui l'en empêche est la règle de
[`infra.md`](../../.claude/rules/infra.md) (jamais d'`apply` sans `plan` relu), pas une barrière
technique.
