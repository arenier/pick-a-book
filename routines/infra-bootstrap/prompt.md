Routine d'implémentation sur le dépôt **arenier/pick-a-book**. Tu démarres sans aucun contexte : tout part d'ici. Écris en français dans la doc, les ADR et la PR ; **anglais dans le code**.

Aucun humain ne te relit pendant l'exécution. Tu ne poses donc pas de question : ce qui aurait pu bloquer est tranché plus bas, et ce qui appartient au mainteneur se **déclare dans la PR** au lieu d'être inventé.

## Étape 0 — Charger le cadre

Lis, dans cet ordre, avant d'écrire une ligne :

1. `CLAUDE.md` à la racine — conventions et garde-fous. Il **prime** sur tes habitudes. Retiens en particulier : **TDD systématique, y compris pour l'IaC** (« les modules d'infrastructure sont testés, assertions écrites d'abord »).
2. L'issue **#12** (`arenier/pick-a-book`) — le *quoi* contractuel, et **ses commentaires**, qui contiennent des décisions figées et un rectificatif.
3. `docs/adr/README.md` — la procédure d'ADR : numérotation, index à mettre à jour, statuts, pondération des critères, conditions de bascule.
4. Les ADR qui contraignent : `0004` (Cloud Run + bucket, et sa note révisée), `0006` (Postgres managé Neon, `DATABASE_URL`, `pg_dump` vers le bucket), `0001` (stack, Node 26 non-LTS, Docker).
5. `docker/` (les deux Dockerfile, contexte de build = racine) et `docker-compose.yml`.

## Ce que tu livres cette nuit

Dans l'ordre de priorité. **Si le temps ou le contexte manque, arrête-toi proprement et ouvre la PR avec ce qui est fait** — ne commence pas tout pour ne rien finir.

### 1. L'ADR de choix d'outil IaC — le prérequis

C'est le premier point de la DoD de #12, et il conditionne tout le reste : *« une issue ne suffit pas »* à acter l'outil. Numéro **0009** (le suivant libre — vérifie), `docs/adr/0009-<titre-en-kebab-case>.md`, ligne ajoutée à l'index de `docs/adr/README.md`, statut **Proposé**.

Applique la procédure du `README.md` des ADR : pondération explicite des critères, chaque raison de la solution retenue rattachée à un critère fort, et des **conditions de bascule** mesurables.

**Pèse sérieusement OpenTofu** — le changement de licence de Terraform et l'existence d'un fork CNCF sont exactement le genre de fait qu'un ADR doit regarder en face, pas éluder. Pèse aussi les alternatives honnêtes : Pulumi, scripts `gcloud` versionnés, Config Connector.

> **Garde-fou.** La solution retenue reste **Terraform**, comme l'acte l'issue #12. Si ton analyse fait réellement pencher vers OpenTofu, tu **n'inverses pas la décision toi-même** : tu écris l'arbitrage tel qu'il est, tu retiens Terraform, et tu ouvres une **question ouverte** dans l'ADR + un point explicite dans la PR. Un changement d'outil de stack ne se décide pas dans une exécution sans personne en face. Écrire un faux arbitrage qui ne mentionne pas OpenTofu serait tout aussi mauvais.

### 2. Les modules, en TDD

Dans `infra/modules/…`, assemblés par `infra/envs/…`. Un module = une responsabilité, ne connaît que ses entrées/sorties ; le câblage inter-modules vit dans la config racine, **jamais** dans les modules.

Ordre : `project` → `artifact-registry` → `bucket` → `secret-manager` → `service-account`/`iam` → `cloud-run`.

**Les assertions s'écrivent d'abord** (`CLAUDE.md`). Pour chaque module, un `.tftest.hcl` qui échoue, puis le module qui le fait passer. Les invariants durs que la DoD de #12 nomme, à couvrir en priorité :

- versioning du bucket **activé** ;
- secret `DATABASE_URL` présent ;
- service account en **moindre privilège** : lecture des secrets + écriture bucket pour les `pg_dump`, rien de plus ;
- service Cloud Run **sans montage de bucket** (l'ADR 0006 a supprimé gcsfuse) ;
- `max-instances` libre — ce **n'est plus** une contrainte d'intégrité, seulement un plafond de coût.

Utilise `mock_provider` pour rester hermétique et sans coût. Les tests doivent tourner **sans credentials GCP**.

### 3. Les portes statiques et la CI

`terraform fmt -check`, `terraform validate`, `tflint`, et un scan sécurité (`checkov` ou `trivy`). Câblées dans `.github/workflows/` de sorte que le vert soit bloquant. Ajoute un job dédié plutôt que d'alourdir le job `check` existant, qui est monté autour de Nx et n'a rien à voir avec l'IaC.

## Interdits absolus

- **Ne lance jamais `terraform apply`.** Ni `gcloud` qui crée, modifie ou supprime quoi que ce soit. Ni création de projet, ni rattachement de facturation, ni création de secret réel. L'issue #12 le pose noir sur blanc : le provisioning est une action sortante à forte conséquence qui ne se fait pas sans le mainteneur.
- **Ne crée aucun compte** et ne provisionne aucune instance Neon.
- **N'écris aucune valeur de secret** nulle part. Terraform crée le secret **vide** ; la version (la valeur) est ajoutée hors-bande, précisément pour ne pas transiter par le state.
- **N'affiche jamais la valeur d'une variable d'environnement** et ne colle aucune clé dans un fichier, un log, un commit ou la PR.
- Ne commite aucun `.tfvars` contenant une valeur secrète. Les `*.tfvars` **non secrets** (project_id, region, nom d'env) sont commités par environnement ; les secrets passent par `TF_VAR_*` à l'`apply`.

## Ce que tu ne peux pas décider — déclare-le, ne l'invente pas

Ces choix appartiennent au mainteneur. Déclare chacun comme une **variable requise sans valeur par défaut**, documentée, et liste-les dans la PR sous un titre visible :

| À fournir | Pourquoi tu ne peux pas trancher |
|---|---|
| `billing_account_id` | compte de facturation réel |
| `project_id` | nomme un projet à créer |
| `region` | l'issue propose `europe-west1` / `europe-west9`, **à confirmer** — ne choisis pas à sa place |
| `DATABASE_URL` (Neon) | l'instance n'existe pas encore |
| Hébergement du front | Cloud Run séparé **ou** bucket statique + CDN : arbitrage produit, ouvert dans #12 |

Une variable sans défaut force la décision au bon moment. Un défaut inventé la masque et finit en production.

## Vérifie ton outillage AVANT de promettre quoi que ce soit

C'est le principal mode d'échec de cette nuit. `terraform`, `tflint` et `checkov` **ne sont pas forcément installés** dans cet environnement, et le téléchargement des providers a besoin d'un accès sortant vers le registre.

Commence par vérifier ce dont tu disposes (`terraform version`, etc.) et tente une installation si nécessaire. Puis :

- **Si `terraform test` tourne** : les tests doivent être **verts** avant d'ouvrir la PR, et tu le dis.
- **Si l'outillage est indisponible** : tu écris quand même les modules et leurs `.tftest.hcl` — mais tu déclares dans la PR, en une phrase qui ne se noie pas, que **les tests n'ont pas pu être exécutés** et pourquoi. Tu n'écris jamais « tests verts » sans les avoir vus verts. Une assertion jamais exécutée n'est pas un test, c'est une intention.

## Ouvrir la PR

Une seule PR, branche `feat/infra-bootstrap-terraform` créée depuis `main`. Commits petits, en anglais, **l'ADR en premier commit** : si le mainteneur refuse le choix d'outil, toute la PR tombe avec lui, et c'est le comportement voulu.

Utilise le skill **`create-pr`** du dépôt (`.claude/skills/create-pr/SKILL.md`). Le corps doit dire, sans enjoliver :

- ce qui est livré, et **que rien n'a été provisionné** — aucune ressource GCP n'existe à l'issue de cette PR, c'est du code et des tests ;
- **l'état réel des tests** (exécutés et verts, ou écrits mais non exécutés faute d'outillage) ;
- la liste des **valeurs à fournir** avant tout `apply` ;
- le **bootstrap hors Terraform** qui reste à faire à la main : le bucket du `tfstate` ne peut pas être géré par le state qu'il contient ;
- si l'ADR a fait apparaître un doute sérieux sur Terraform vs OpenTofu, le dire.

`Refs #12`, jamais `Closes` : l'issue reste ouverte tant que rien n'est provisionné.

## Si tu es bloqué

N'invente rien et ne rends pas la main les mains vides. Ouvre la PR avec ce qui **est** fait et liste en clair ce qui manque et pourquoi. Une PR partielle honnête est utile au réveil ; une PR qui affirme des tests verts jamais exécutés, ou qui masque une décision par un défaut inventé, fait perdre bien plus qu'une nuit.
