# Routine — revue de code sur PR (ouverture ou label `claude`)

Routine cloud (agent claude.ai **événementiel**) qui relit **une** pull request de
`arenier/pick-a-book`, applique le skill `pr-review` du repo, et poste le commentaire de review sous
l'identité `claude[bot]`.

Un **seul** prompt couvre les deux déclenchements possibles — l'**ouverture / mise à jour** d'une PR
et l'**ajout du label `claude`** — parce que la seule chose qui change entre eux (la déduplication)
se **déduit à l'exécution de la présence du label `claude`** sur la PR.

## Comportement unifié

La config des déclencheurs dans l'UI décide **quand** la routine se réveille ; le prompt décide
**comment** se comporter d'après l'état du label sur la PR relue.

| État de la PR au moment de la lecture | Mode | Déduplication |
|---|---|---|
| **Sans** label `claude` | Automatique | **Stricte par SHA** — marqueur au même SHA → on ne poste rien, quel que soit son âge |
| **Avec** label `claude` | À la demande | Fenêtre de **10 min** — un ré-étiquetage volontaire relance une review à SHA inchangé |

Conséquence du montage des déclencheurs (dans l'UI, voir plus bas) :

- déclencheur **ouverture seule** → toute PR ouverte est relue ;
- déclencheur **label seul** → relue à la pose du label ;
- **les deux** → auto-review à l'ouverture **et** review à la demande par label, sans doublon.

## Une seule source de vérité — et sa frontière de sécurité

Contrairement au montage multi-repos d'autres organisations (prompt + skill dans un dépôt d'agents
séparé), **pick-a-book est mono-repo** : le `prompt.md` **et** le skill `pr-review` vivent ici même.

| Fichier | Rôle |
|---|---|
| `prompt.md` | **Instructions exécutées**. Source unique lue par CHAQUE déploiement, **au ref `main`**. |
| `routine.template.json` | Body de création de l'API, à instancier (placeholders `<<…>>`). |
| `README.md` | Cette fiche. |

Le skill de review : `.claude/skills/pr-review/SKILL.md`.

> **Le durcissement mono-repo.** Le workspace d'un run événementiel est le checkout de **la branche
> de la PR relue** — modifiable par l'auteur de la PR. Le prompt et le skill sont donc lus **au ref
> `main`** via le canal GitHub MCP (`get_file_contents`), **jamais** depuis le workspace. Comme
> `main` est protégée (review requise, pas de push direct — cf. « Workflow Git » de `CLAUDE.md`), un
> auteur ne peut pas altérer le référentiel de review sans d'abord le faire merger sur `main`. C'est
> l'équivalent mono-repo du dépôt d'agents séparé : la protection de branche **est** la frontière de
> sécurité.

## Prérequis d'accès

La session cloud lit GitHub via la **GitHub App de Claude**, pas via SSH. Cette App doit avoir accès
à `arenier/pick-a-book`, **et** le dépôt doit figurer dans les `sources` de la routine (clone +
allowlist de `get_file_contents`). Sans l'un ou l'autre, la routine s'arrête proprement
(fail-closed) sans rien poster.

## Déployer

Instancier `routine.template.json` en substituant :

| Placeholder | Où le trouver |
|---|---|
| `<<ENVIRONMENT_ID>>` | `/schedule` liste les environnements (`env_…`) |
| `<<UUID_V4>>` | n'importe quel UUID v4 minuscule |
| `<<CONNECTOR_UUID_CLAUDE_CODE_REMOTE>>` | copié depuis les `mcp_connections` d'une routine existante |

> **Le binding événementiel n'est PAS dans ce body.** Le ou les déclencheurs (dépôt, événement
> `pull_request` — action `opened`/`synchronize` et/ou `labeled` —, et **tous** les filtres : label
> `claude`, auteur, état de la PR) se configurent depuis <https://claude.ai/code/routines>. C'est le
> seul endroit qui décide quels événements atteignent un run ; le prompt ne redouble aucun de ces
> filtres.
>
> - **Choisis les déclencheurs selon l'usage voulu** (voir le tableau [Comportement
>   unifié](#comportement-unifié)) : ouverture, label, ou les deux.
> - **Sans filtre auteur sur le déclencheur d'ouverture, chaque PR ouverte du dépôt est relue** — à
>   contrôler après déploiement.

## Vérifier

Faire un **run manuel** (« Run now ») et contrôler : commentaire posté, **auteur = `claude[bot]`**,
une seule PR traitée. Une autre identité d'auteur = mauvais canal d'écriture (l'écriture doit passer
par `curl`, pas par un outil MCP). Pour couvrir les deux modes, valider une PR **sans** label (dédup
stricte par SHA) puis une PR **labellisée** (ré-étiquetage → nouvelle review).

## Composition

- `pr-review` (skill) — la procédure de review appliquée par cette routine, en mode « aucun humain
  dans la boucle » (les questions deviennent des remarques 💬, le second avis à froid et le fan-out
  ne se déclenchent pas).
- `pr-review-triage` (skill) — en aval, à la main : traiter la review une fois postée (vérifier,
  corriger, répondre).
