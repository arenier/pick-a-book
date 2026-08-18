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
| **Création du projet GCP, facturation, `terraform apply`, secrets réels, instance Neon** | ❌ **jamais** |

**Pourquoi rien n'est provisionné.** L'issue #12 le pose elle-même : le provisioning GCP est une
action sortante à forte conséquence, qui ne se fait pas sans le mainteneur. La routine produit donc
du code et des tests hermétiques (`mock_provider`, aucun credential) — à l'issue de la PR, **aucune
ressource GCP n'existe**.

**L'issue #12 reste ouverte** : la routine écrit `Refs #12`, jamais `Closes`.

## Le mode d'échec à surveiller

`terraform`, `tflint` et `checkov` ne sont pas forcément installés dans l'environnement, et les
providers se téléchargent depuis le registre — donc sortie réseau requise. Le prompt impose de
vérifier l'outillage **avant** de promettre quoi que ce soit, et d'écrire noir sur blanc dans la PR
si les tests ont été écrits sans pouvoir être exécutés. Une assertion jamais exécutée n'est pas un
test.

C'est le premier point à contrôler au réveil.

## Ce que la routine ne peut pas décider

Elle les déclare en variables **sans valeur par défaut** et les liste dans la PR :
`billing_account_id`, `project_id`, `region` (l'issue propose `europe-west1` / `europe-west9`, à
confirmer), `DATABASE_URL` de l'instance Neon, et l'hébergement du front (Cloud Run séparé vs bucket
statique + CDN).

Un défaut inventé masquerait la décision au lieu de la poser.

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
