Routine d'implémentation sur le dépôt **arenier/pick-a-book**. Tu démarres sans aucun contexte : tout part d'ici. Écris en français dans la doc, les ADR et la PR ; **anglais dans le code**.

Aucun humain ne te relit pendant l'exécution. Tu ne poses donc pas de question, et surtout **tu ne t'arrêtes pas au premier obstacle** : la règle de cette nuit est d'en faire le maximum et de tout documenter. Ce qui appartient au mainteneur se déclare dans la PR au lieu d'être inventé.

## Étape 0 — Charger le cadre

Lis, dans cet ordre, avant d'écrire une ligne :

1. `CLAUDE.md` à la racine — conventions et garde-fous. Il **prime** sur tes habitudes. Retiens en particulier : **TDD systématique, y compris pour l'IaC** (« les modules d'infrastructure sont testés, assertions écrites d'abord »).
2. L'issue **#12** (`arenier/pick-a-book`) — le *quoi* contractuel, et **ses commentaires**, qui contiennent des décisions figées et un rectificatif.
3. `docs/adr/README.md` — la procédure d'ADR : numérotation, index à mettre à jour, statuts, pondération des critères, conditions de bascule.
4. Les ADR qui contraignent : `0004` (Cloud Run + bucket, et sa note révisée), `0006` (Postgres managé Neon, `DATABASE_URL`, `pg_dump` vers le bucket), `0001` (stack, Node 26 non-LTS, Docker).
5. `docker/` (les deux Dockerfile, contexte de build = racine) et `docker-compose.yml`.

## Valeurs et décisions figées — applique-les, ne les rouvre pas

Le mainteneur a créé le projet, la facturation, le service account et le bucket d'état **à la main, avant cette exécution**. Tu travailles donc dans un projet qui **existe déjà**.

| Sujet | Valeur |
|---|---|
| `project_id` | `pick-a-book-505922` |
| `region` | `europe-west1` |
| Bucket du `tfstate` | `pick-a-book-tfstate` (déjà créé : privé, versioning activé) |
| Hébergement du front | **Cloud Run**, un second service — pas de bucket statique + CDN |
| Credentials | variable d'environnement `GOOGLE_CREDENTIALS` (JSON du service account) |
| Rétention des `pg_dump` | versioning activé ; versions non courantes supprimées après **30 jours** ; aucune règle de suppression sur les objets courants |

`project_id` et `region` sont **non secrets** : commite-les en `*.tfvars` par environnement dans `infra/envs/`, comme #12 le décide — pas en variables d'environnement.

> **Sur le front en Cloud Run.** Ce choix **contredit ce que l'ADR 0004 laisse entendre** (front statique servi depuis le bucket). Motif : servir du statique en HTTPS sur un domaine depuis un bucket impose un load balancer HTTPS, facturé à l'heure même à vide — de l'ordre de 18 $/mois, incompatible avec le « budget quasi nul » de l'ADR 0004. Cloud Run donne HTTPS gratuit sur `*.run.app` et le scale-to-zero. **Signale cette contradiction** : note d'amendement sur l'ADR 0004, ou point traité dans l'ADR 0009. Ne la passe pas sous silence.

> **Sur la rétention des dumps.** L'ADR 0006 laisse cadence et rétention ouvertes, « à trancher la taille réelle de la base sous les yeux ». La valeur ci-dessus est un défaut raisonnable posé faute de données, **pas un arbitrage** — dis-le dans la PR. Le **job** de `pg_dump` reste hors périmètre (il vit dans `infrastructure`) : tu ne provisionnes que le bucket et sa politique de cycle de vie.

## Ce que tu livres cette nuit

Dans cet ordre de priorité.

### 1. L'ADR de choix d'outil IaC — le prérequis

C'est le premier point de la DoD de #12, et il conditionne le reste : *« une issue ne suffit pas »* à acter l'outil. Numéro **0009** (le suivant libre — vérifie), `docs/adr/0009-<titre-en-kebab-case>.md`, ligne ajoutée à l'index de `docs/adr/README.md`, statut **Proposé**.

Applique la procédure du `README.md` des ADR : pondération explicite des critères, chaque raison de la solution retenue rattachée à un critère fort, **conditions de bascule** mesurables.

**Pèse sérieusement OpenTofu** — le changement de licence de Terraform et l'existence d'un fork CNCF sont exactement le genre de fait qu'un ADR doit regarder en face. Pèse aussi Pulumi, les scripts `gcloud` versionnés, et Config Connector.

> **Garde-fou.** La solution retenue reste **Terraform**, comme l'acte #12. Si ton analyse fait réellement pencher vers OpenTofu, tu **n'inverses pas la décision toi-même** : tu écris l'arbitrage tel qu'il est, tu retiens Terraform, et tu ouvres une **question ouverte** dans l'ADR + un point explicite dans la PR. Un changement d'outil de stack ne se décide pas dans une exécution sans personne en face. Écrire un faux arbitrage qui ne mentionne pas OpenTofu serait tout aussi mauvais.

### 2. Les modules, en TDD

Dans `infra/modules/…`, assemblés par `infra/envs/…`. Un module = une responsabilité, ne connaît que ses entrées/sorties ; le câblage inter-modules vit dans la config racine, **jamais** dans les modules.

Ordre : `project` → `artifact-registry` → `bucket` → `secret-manager` → `service-account`/`iam` → `cloud-run` (API) → `cloud-run` (front).

**Le module `project` ne crée pas le projet** — il existe déjà. Il **active les APIs** nécessaires, et rien d'autre. Aucune ressource `google_project` ni `google_billing_account` dans le code.

**Les assertions s'écrivent d'abord** (`CLAUDE.md`). Pour chaque module, un `.tftest.hcl` qui échoue, puis le module qui le fait passer. Les invariants durs que la DoD de #12 nomme, en priorité :

- versioning du bucket **activé** ;
- secret `DATABASE_URL` présent, et **vide** ;
- service account en **moindre privilège** : lecture des secrets + écriture bucket pour les `pg_dump`, rien de plus ;
- service Cloud Run **sans montage de bucket** (l'ADR 0006 a supprimé gcsfuse) ;
- `max-instances` libre — ce **n'est plus** une contrainte d'intégrité, seulement un plafond de coût.

`mock_provider` pour rester hermétique. Ces tests doivent tourner **sans credentials**.

### 3. Les portes statiques et la CI

`terraform fmt -check`, `terraform validate`, `tflint`, et un scan sécurité (`checkov` ou `trivy`). Câblées dans `.github/workflows/` de sorte que le vert soit bloquant. Ajoute un **job dédié** plutôt que d'alourdir le job `check` existant, monté autour de Nx et sans rapport avec l'IaC.

### 4. L'`apply`

Backend `gcs` sur `pick-a-book-tfstate`, puis `terraform plan` (garde le résumé pour la PR) et `terraform apply` sur les ressources internes au projet.

## Ce que tu as le droit de faire, et ce que tu n'as pas le droit de faire

**`terraform apply` est autorisé** sur les ressources **internes** au projet `pick-a-book-505922` : activation d'APIs, Artifact Registry, bucket, secrets vides, service accounts et rôles, services Cloud Run.

Interdits, sans exception — y compris pour « débloquer » quelque chose :

- **Ne crée, ne modifie, ne supprime aucun projet GCP**, et ne touche jamais au rattachement de facturation. Un ID de projet n'est jamais réutilisable, une suppression est irréversible à 30 jours.
- **Aucun `terraform destroy`**, jamais, sous aucun prétexte — y compris pour « repartir propre ».
- **N'élargis jamais un rôle IAM pour faire passer un `apply`.** Si les droits manquent, c'est un constat à remonter dans la PR, pas un obstacle à contourner. Le moindre privilège est un invariant testé : le violer pour aller plus vite détruit ce que la nuit était censée construire.
- **N'écris aucune valeur de secret.** Terraform crée les secrets **vides** ; les valeurs (`DATABASE_URL`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`) sont ajoutées hors-bande par le mainteneur, pour ne pas transiter par le state. Rappelle la commande dans la PR.
- **Ne crée aucun compte** et ne provisionne aucune instance Neon.
- **N'affiche jamais la valeur d'une variable d'environnement**, ne colle aucun credential dans un fichier, un log, un commit ou la PR. `GOOGLE_CREDENTIALS` n'apparaît nulle part ailleurs que consommée par le provider.
- Ne commite aucun `.tfvars` contenant une valeur secrète.

## Ne t'arrête pas à la première erreur

C'est la consigne principale de la nuit. Les tests sont en `mock_provider`, donc **aveugles au comportement réel de l'API GCP** : APIs pas encore actives, propagation IAM, contraintes d'organisation, champs obligatoires que le schéma tolère. Des erreurs vont arriver — ce n'est pas un échec de la nuit, c'est le contenu de la nuit.

La marche à suivre, à chaque obstacle :

1. **Diagnostique et corrige** si la cause est locale et claire (un champ, une dépendance manquante, une API à activer), puis relance.
2. **Si ça résiste, isole et continue.** Une ressource ou un module qui bloque ne doit pas emporter le reste : passe au module suivant, applique ce qui est indépendant, écris ce qui peut l'être. Terraform le permet naturellement — ce qui ne dépend pas de la ressource en échec s'applique quand même.
3. **Consigne chaque échec** au fil de l'eau : la commande, l'erreur exacte, ce que tu as tenté, où ça en est resté. Ce journal va dans la PR.
4. **Ne boucle pas.** Trois tentatives sur le même obstacle suffisent ; au-delà, note-le et avance. Une nuit passée sur une seule erreur est une nuit perdue.

Ce qui reste interdit même sous cette consigne : contourner par un `destroy`, par un élargissement de droits, ou en désactivant un test qui gêne. On avance **à côté** d'un obstacle, jamais **à travers**.

À la fin, quel que soit l'état : ouvre la PR. Une PR partielle honnête est utile au réveil.

## Vérifie ton outillage avant de promettre quoi que ce soit

`terraform`, `tflint` et `checkov` ne sont pas forcément installés dans cet environnement, et les providers se téléchargent depuis le registre — accès sortant requis vers `*.googleapis.com`, `registry.terraform.io` et `releases.hashicorp.com`.

Vérifie ce dont tu disposes (`terraform version`…) et tente une installation si nécessaire. Puis :

- **Si `terraform test` tourne** : les tests doivent être **verts** avant la PR, et tu le dis.
- **Si l'outillage est indisponible** : écris quand même les modules et leurs `.tftest.hcl`, et déclare dans la PR, en une phrase qui ne se noie pas, que **les tests n'ont pas pu être exécutés** et pourquoi. Tu n'écris jamais « tests verts » sans les avoir vus verts. Une assertion jamais exécutée n'est pas un test, c'est une intention.

## Ouvrir la PR

Une seule PR, branche `feat/infra-bootstrap-terraform` créée depuis `main`. Commits petits, en anglais, **l'ADR en premier commit** : si le mainteneur refuse le choix d'outil, toute la PR tombe avec lui, et c'est le comportement voulu.

Utilise le skill **`create-pr`** du dépôt (`.claude/skills/create-pr/SKILL.md`). Le corps doit dire, sans enjoliver :

- ce qui est livré, et **ce qui a réellement été provisionné** dans `pick-a-book-505922` — la liste des ressources créées, sans aucune valeur sensible ;
- **l'état réel des tests** (exécutés et verts, ou écrits mais non exécutés faute d'outillage) ;
- **le journal des échecs** rencontrés et non résolus, avec l'erreur exacte et l'état où c'est resté ;
- les **valeurs de secrets à poser hors-bande**, avec la commande `gcloud secrets versions add` correspondante ;
- la contradiction **front en Cloud Run vs ADR 0004**, et la rétention des dumps posée par défaut ;
- si l'ADR a fait apparaître un doute sérieux sur Terraform vs OpenTofu, le dire.

`Refs #12`, jamais `Closes` : l'issue reste ouverte tant que tout n'est pas provisionné et vérifié.
