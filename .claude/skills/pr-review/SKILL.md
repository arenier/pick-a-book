---
name: pr-review
description: Relit une pull request de pick-a-book et poste un avis structuré en commentaire GitHub, avec un verdict de mergeabilité. À utiliser quand on demande de relire, reviewer, ou donner un avis sur une PR — par numéro, par URL, ou « la PR ouverte ». Vérifie en priorité la conformité aux ADR du projet.
---

# Relecture de pull request

Produit un avis de relecture sur une PR de ce repo et le poste en commentaire GitHub.

## Entrée

Le numéro de PR. S'il n'est pas fourni, prends la seule PR ouverte
(`gh pr list --state open --json number`). S'il y en a plusieurs, demande laquelle plutôt que
d'en choisir une.

## 1. Rassembler le contexte

```bash
gh pr view <N> --json title,body,headRefName,baseRefName,author,files,additions,deletions
gh pr diff <N>
```

Puis lis `CLAUDE.md` et **tous** les fichiers de `docs/adr/`. Les ADR sont **contraignants** :
c'est le référentiel contre lequel tu juges, pas ton goût personnel.

## 2. Ce qu'il faut chercher, par ordre de gravité

**1. Violation d'ADR** — le plus grave, parce que c'est ce qu'une relecture humaine rate le plus
facilement. Les pièges connus de ce projet :

| Signal dans le diff | ADR violé |
|---|---|
| `libs/*/domain` important un framework, un ORM, du HTTP | 0002 |
| Un contexte important le `domain` ou l'`application` d'un autre contexte | 0002 |
| Une lib `common`, `utils`, `shared/utils` ou équivalent fourre-tout | 0002 |
| `libs/shared/*` important un contexte | 0002 |
| `@nestjs/cqrs`, EventEmitter applicatif, publication/abonnement d'événements | 0003 |
| Un orchestrateur qui manipule des objets de domaine au lieu de DTO de frontière | 0003 |
| Un service de base de données (Postgres, MySQL) dans `docker-compose.yml` | 0006 |
| `max-instances` absent, ou supérieur à 1, dans un script de déploiement | 0006 |
| Yarn Classic, une plage de versions au lieu d'une version exacte, Plug'n'Play | 0001 |
| Du SQL ou du dialecte SQLite hors de `infrastructure` | 0002 / 0006 |

**2. Correction** — bug, cas limite non traité, erreur avalée, promesse non attendue.

**3. Sécurité** — secret en clair, `.env` commité, jeton dans un log, dépendance non épinglée
sur une source douteuse.

**4. Tests** — du domaine ou de l'application ajouté sans test. Un adapter testé contre un mock
de lui-même.

**5. Qualité** — nommage, duplication, complexité inutile. En dernier, et seulement si ça vaut le
coup d'être dit.

## 3. Relecture statique : ce que tu ne fais pas

**N'installe rien, ne lance ni lint, ni test, ni build.** La relecture se fonde uniquement sur le
diff et sur la lecture des fichiers du repo. C'est un choix assumé : la vérification d'exécution
relève d'une CI, pas d'un commentaire.

Conséquence directe sur l'honnêteté de l'avis : **tu ne peux pas affirmer que la PR passe.** Un
verdict 🟢 veut dire « je n'ai rien trouvé en lecture », pas « ça compile ».

- **Ne signale rien que tu n'as pas vu.** Pas de remarque déduite du titre de la PR ou du nom d'un
  fichier.
- Si un doute porte sur du code **non modifié** par la PR, va lire ce code avant d'en parler.
- Une remarque fausse coûte plus cher que pas de remarque : elle fait perdre du temps et décrédibilise
  tout le reste de l'avis.

## 4. Format du commentaire

Une seule ligne de verdict en tête, avec **un seul** de ces trois emoji :

- 🟢 **Mergeable** — rien trouvé de bloquant en lecture. Des questions ou remarques mineures peuvent
  subsister.
- 🟡 **Mergeable avec réserves** — rien de cassé, mais au moins un point mérite une correction ou
  une réponse avant merge.
- 🔴 **À ne pas merger** — au moins une violation d'ADR, un bug, ou un secret exposé.

Le verdict est **consultatif**. Il ne pose aucun label, ne repasse pas la PR en draft, et ne bloque
rien : la décision de merger reste humaine.

Puis exactement ces trois sections, dans cet ordre :

```markdown
🟢 **Mergeable**

_Une phrase qui justifie le verdict._

### ✅ Ce qui a été relu

- Les fichiers parcourus et les points effectivement vérifiés en lecture.
- Ce qui n'a **pas** été vérifié. Mentionne toujours que ni le lint, ni les tests, ni le build n'ont
  été exécutés : le périmètre non couvert fait partie de l'avis.

### 🔧 À corriger

- 🔴 `chemin/fichier.ts:42` — ce qui est faux, et pourquoi. Bloquant.
- 🟠 `chemin/autre.ts:17` — à corriger, non bloquant.

### ❓ Questions

- Ce qui demande une décision humaine ou une intention que le code ne dit pas.
```

Règles de format :

- Chaque point de **À corriger** porte un `fichier:ligne` et dit **pourquoi** c'est faux, pas
  seulement quoi changer. Préfixe `🔴` si bloquant, `🟠` sinon.
- Une violation d'ADR se cite avec son numéro : « viole l'ADR 0002 (le domaine ne dépend de rien) ».
- **Aucune section vide.** S'il n'y a rien, écris-le : « Rien à corriger. », « Aucune question. »
  Une section vide se lit comme un oubli.
- Pas de compliment de politesse. « Bon travail » n'apporte rien à personne.
- Français, comme le reste de la documentation du projet.

## 5. Poster le commentaire

Commence le corps par le marqueur `<!-- pr-review -->`, pour rendre l'opération rejouable :

```bash
# Un commentaire de relecture existe-t-il déjà ?
gh pr view <N> --json comments \
  --jq '.comments[] | select(.body | startswith("<!-- pr-review -->")) | .url'
```

- **Aucun** → `gh pr comment <N> --body-file <fichier>`
- **Il en existe un** → mets-le à jour plutôt que d'en empiler un second
  (`gh api -X PATCH /repos/{owner}/{repo}/issues/comments/{id} -f body=@<fichier>`).

## Interdits

- **Ne merge jamais** la PR, ne la ferme pas, n'active pas l'auto-merge. L'avis est consultatif :
  la décision reste humaine.
- **Ne pousse aucun commit** sur la branche relue. Si un correctif est évident, décris-le dans
  **À corriger** ; ne l'applique pas.
- N'approuve pas et ne demande pas de changements via l'API de review GitHub — un commentaire
  simple, rien de plus.
