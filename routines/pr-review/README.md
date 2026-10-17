# Routine — revue de code sur PR (ouverture ou label `claude`)

Routine cloud (agent claude.ai **événementiel**) qui relit **une** pull request de
`arenier/pick-a-book`, applique le skill `pr-review` (publié dans `arenier/claude-skills`, plugin
`adri-plugin`), et poste le commentaire de review sous l'identité `claude[bot]`.

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

## Deux sources de vérité — et leur frontière de sécurité

Le `prompt.md` de la routine vit ici ; le skill `pr-review` vit dans le dépôt de skills
`arenier/claude-skills`, d'où pick-a-book le charge par la marketplace `adri-skills`
(`.claude/settings.json`) — la copie locale a été retirée pour éviter les doublons.

| Fichier | Rôle |
|---|---|
| `prompt.md` | **Instructions exécutées**. Source unique lue par CHAQUE déploiement, **au ref `main`**. |
| `routine.template.json` | Body de création de l'API, à instancier (placeholders `<<…>>`). |
| `README.md` | Cette fiche. |

Le skill de review : `adri-plugin/skills/pr-review/SKILL.md` dans `arenier/claude-skills`, lu au ref
`main`.

Le skill est agnostique du dépôt et n'a aucun critère propre : il découvre les règles que pick-a-book a
écrites — [`.claude/rules/**`](../../.claude/rules), [`CLAUDE.md`](../../CLAUDE.md) et les ADR vers
lesquels ils renvoient — et y route le diff par le frontmatter `paths` de chaque rule. Une convention
que la review doit faire respecter s'écrit donc dans une rule (ou dans un ADR qu'une rule lie), pas dans
un fichier de configuration de la review.

> **Le durcissement.** Le workspace d'un run événementiel est le checkout de **la branche de la PR
> relue** — modifiable par l'auteur de la PR. Aucune instruction n'y est donc lue : tout passe par le
> canal GitHub MCP (`get_file_contents`), **au ref `main`**, **jamais** depuis le workspace.
>
> - Le prompt, les ADR, `CLAUDE.md` et `.claude/rules/**` sont lus sur la `main` de pick-a-book,
>   protégée (review requise, pas de push direct — cf. « Workflow Git » de `CLAUDE.md`) : un auteur
>   ne peut pas les altérer sans d'abord les faire merger.
> - Le skill est lu sur la `main` d'`arenier/claude-skills`, un **autre dépôt** : une PR de
>   pick-a-book ne peut pas le toucher. Qui peut pousser sur ce dépôt peut en revanche changer le
>   référentiel de review — c'est la frontière à tenir de ce côté.

## Prérequis d'accès

La session cloud lit GitHub via la **GitHub App de Claude**, pas via SSH. Cette App doit avoir accès
à `arenier/pick-a-book` **et** à `arenier/claude-skills`, **et** les deux dépôts doivent figurer
dans les `sources` de la routine (clone + allowlist de `get_file_contents`). Sans l'un ou l'autre, la
routine s'arrête proprement (fail-closed) sans rien poster.

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

- `pr-review` (skill, plugin `adri-plugin` d'`arenier/claude-skills`) — la procédure de review appliquée par cette routine, en mode « aucun humain
  dans la boucle » (les questions deviennent des remarques 💬, le second avis à froid et le fan-out
  ne se déclenchent pas).
- `pr-review-triage` (skill, même plugin) — en aval, à la main : traiter la review une fois postée (vérifier,
  corriger, répondre).
