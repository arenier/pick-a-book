# Routine — bootstrap de l'infrastructure (issue #12)

Routine cloud **planifiée** (ou lancée à la main) qui prépare l'IaC de l'issue
[#12](https://github.com/arenier/pick-a-book/issues/12) et ouvre **une** pull request.

Comme [`routines/recognition-v1`](../recognition-v1/README.md), elle écrit du code : elle part de
`main`, crée une branche, n'ouvre qu'une PR, et ne merge rien.

## Ce qu'elle livre, et ce qu'elle ne livre pas

| Attendu de #12 | Statut |
|---|---|
| ADR de choix d'outil IaC (0009) | ✅ |
| Modules Terraform (`project`, `artifact-registry`, `bucket`, `secret-manager`, `iam`, `cloud-run`) | ✅ |
| Tests `terraform test` / `.tftest.hcl`, écrits en TDD, `mock_provider` | ✅ écrits — exécutés **si** l'outillage est disponible |
| Portes statiques (`fmt`, `validate`, `tflint`, scan sécurité) + câblage CI | ✅ |
| `terraform apply` sur les ressources **internes** au projet | ✅ |
| **Création/suppression de projet, facturation, `destroy`, valeurs de secrets, instance Neon** | ❌ **jamais** |

**Le partage.** Le mainteneur crée à la main ce qui est irréversible — projet `pick-a-book-505922`,
facturation, service account de provisioning, bucket d'état `pick-a-book-tfstate`. La routine gère
tout ce qui vit **dans** le projet, et qui est destructible et recréable. Un ID de projet n'est
jamais réutilisable ; le reste, si.

Les valeurs de secrets (`DATABASE_URL`, clés VLM) restent hors du state : Terraform crée les secrets
vides, le mainteneur ajoute les versions hors-bande.

**L'issue #12 reste ouverte** : la routine écrit `Refs #12`, jamais `Closes`.

## Elle ne s'arrête pas à la première erreur

Consigne explicite du prompt : les tests étant en `mock_provider`, ils sont aveugles au
comportement réel de l'API GCP (APIs pas actives, propagation IAM, contraintes d'organisation). Des
erreurs vont arriver — c'est le contenu de la nuit, pas son échec.

La routine corrige ce qui est local, **isole ce qui résiste et continue à côté**, ne boucle pas
au-delà de trois tentatives sur le même obstacle, et tient un journal des échecs qui atterrit dans
la PR. Ce qui reste interdit même sous cette consigne : contourner par un `destroy`, par un
élargissement de droits IAM, ou en désactivant un test qui gêne. On avance **à côté** d'un obstacle,
jamais **à travers**.

## Le mode d'échec à surveiller

`terraform`, `tflint` et `checkov` ne sont pas forcément installés dans l'environnement, et les
providers se téléchargent depuis le registre — donc sortie réseau requise. Le prompt impose de
vérifier l'outillage **avant** de promettre quoi que ce soit, et d'écrire noir sur blanc dans la PR
si les tests ont été écrits sans pouvoir être exécutés. Une assertion jamais exécutée n'est pas un
test.

C'est le premier point à contrôler au réveil.

## Valeurs figées

| Sujet | Valeur |
|---|---|
| `project_id` | `pick-a-book-505922` |
| `region` | `europe-west1` |
| Bucket d'état | `pick-a-book-tfstate` |
| Front | **Cloud Run** (second service) |
| Rétention des dumps | versions non courantes supprimées après 30 jours |

`project_id` et `region` sont commités en `*.tfvars` — ce sont des valeurs non secrètes, et #12
tranche qu'elles vivent dans le dépôt plutôt que dans un environnement.

**Le front en Cloud Run contredit ce que l'ADR 0004 laisse entendre** (statique servi depuis le
bucket). Motif : le HTTPS sur domaine depuis un bucket impose un load balancer facturé à l'heure à
vide (~18 $/mois), incompatible avec le « budget quasi nul » de 0004. La routine doit signaler la
contradiction, pas la masquer.

**La rétention des dumps est un défaut, pas un arbitrage** : l'ADR 0006 la laisse ouverte, « la
taille réelle de la base sous les yeux ».

## Déployer

Depuis <https://claude.ai/code/routines>, message d'amorçage :

> Routine `infra-bootstrap` pour le dépôt arenier/pick-a-book. Lis tes instructions depuis
> `routines/infra-bootstrap/prompt.md` **au ref `main`** via l'outil GitHub MCP `get_file_contents`
> (owner: arenier, repo: pick-a-book, path: routines/infra-bootstrap/prompt.md, ref: main) et
> applique-le de bout en bout : ce fichier porte la totalité de tes instructions. Si le fichier est
> absent ou illisible après retries, arrête-toi sans rien modifier ni ouvrir.

## Au réveil

1. **L'ADR 0009 d'abord.** C'est le premier commit, et il conditionne le reste : le refuser fait
   tomber la PR entière, ce qui est le comportement voulu. Regarde en particulier si l'arbitrage
   Terraform / OpenTofu est traité honnêtement — le prompt interdit à la routine d'inverser la
   décision seule, mais lui impose de signaler un doute sérieux.
2. **L'état réel des tests** — exécutés et verts, ou écrits sans exécution.
3. **La liste des valeurs à fournir** avant tout `apply`, et le bootstrap du bucket de `tfstate`,
   qui reste manuel par construction.
