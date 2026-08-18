# Routine — implémentation de la V1 reconnaissance (issue #10)

Routine cloud **planifiée** (ou lancée à la main) qui implémente les étapes 1-5 et 7 du découpage de
l'issue [#10](https://github.com/arenier/pick-a-book/issues/10) et ouvre **une** pull request.

Contrairement à [`routines/pr-review`](../pr-review/README.md), qui est événementielle et
consultative, celle-ci **écrit du code**. Elle part de `main`, crée une branche, et n'ouvre qu'une PR.

## Ce qu'elle livre, et ce qu'elle ne livre pas

| Étape de #10 | Statut |
|---|---|
| 1-2 · adapters Gemini et Qwen/OpenRouter | ✅ |
| 3 · config env + sélection du fournisseur | ✅ |
| 4 · harnais de réponses enregistrées + tests de contrat | ✅ |
| 5 · endpoint `POST /scan` + mapping d'erreurs | ✅ |
| 7 · doc (`.env.example`, README infra) | ✅ |
| **6 · bench, métriques, note de décision, défaut sur le gagnant** | ❌ **impossible** |

**Pourquoi l'étape 6 est exclue.** Le bench a besoin des 5-10 photos de référence et de la vérité
terrain. Les photos sont gitignorées et vivent sur la machine du mainteneur : une session cloud ne
les voit pas. Le prompt interdit donc explicitement de produire le moindre chiffre de qualité —
un tableau extrapolé désignerait le fournisseur de production sur du vide.

Conséquence à assumer au réveil : la PR contient un fournisseur par défaut **de code**, qui n'est pas
le résultat d'un arbitrage. Le vrai défaut se pose à l'étape 6, quand les photos sont là.

**L'issue #10 reste ouverte** : la routine écrit `Refs #10`, jamais `Closes`.

## Prérequis

- **Environnement** portant `GEMINI_API_KEY` et `OPENROUTER_API_KEY` (aujourd'hui `dev-pick-a-book`).
- **Réseau sortant** autorisé vers `generativelanguage.googleapis.com` et `openrouter.ai`. Sans lui,
  la routine ne s'arrête pas : elle se replie sur des fixtures construites d'après la documentation
  des fournisseurs, et le signale comme une limite dans la PR. C'est le point le plus utile à
  vérifier avant de lancer, parce que l'échec est silencieux et dégrade la valeur des tests.
- Accès en écriture au dépôt (branche + PR).

## Déployer

Depuis <https://claude.ai/code/routines> : une routine planifiée (ou un « Run now »), sur
l'environnement ci-dessus, avec pour message d'amorçage :

> Routine `recognition-v1` pour le dépôt arenier/pick-a-book. Lis tes instructions depuis
> `routines/recognition-v1/prompt.md` **au ref `main`** via l'outil GitHub MCP `get_file_contents`
> (owner: arenier, repo: pick-a-book, path: routines/recognition-v1/prompt.md, ref: main) et
> applique-le de bout en bout : ce fichier porte la totalité de tes instructions. Si le fichier est
> absent ou illisible après retries, arrête-toi sans rien modifier ni ouvrir.

Pas de `routine.template.json` ici, à la différence de `pr-review` : cette routine n'est liée à aucun
événement GitHub, il n'y a donc pas de binding à figer — la planification se règle dans l'UI.

## Au réveil

La PR est faite pour être relue, pas pour être mergée les yeux fermés. Trois points à contrôler en
priorité, que le prompt impose à la routine de déclarer dans le corps :

1. **L'origine des fixtures** — enregistrées depuis un appel réel (bien) ou construites d'après la
   documentation (à relever : les tests valident alors le mapping contre une hypothèse).
2. **La politique d'erreur** — la routine applique les exceptions faute de décision sur
   [#24](https://github.com/arenier/pick-a-book/issues/24). C'est un défaut, pas un arbitrage.
3. **Le fournisseur par défaut** dans le code, qui ne vaut pas désignation.

Le skill `pr-review` s'applique ensuite normalement, et `pr-review-triage` pour traiter la review.
