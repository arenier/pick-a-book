# Déléguer aux sous-agents Haiku

S'applique à tout le dépôt. Les agents sont dans [`.claude/agents/`](../agents/), chacun avec
`model: haiku`.

**Règle.** Le modèle principal garde la conception et l'écriture du code ; il délègue le travail
borné dont seul le résultat compte. Un sous-agent travaille dans son propre contexte et ne renvoie
qu'un résumé : c'est ce qui garde le contexte principal léger et les limites d'usage loin.

## À déléguer

| Besoin | Agent |
|---|---|
| Localiser un symbole, un usage, un câblage ; savoir quels fichiers touchent un sujet | `explorer` |
| Lancer lint, typecheck, test, build, format et n'avoir que les échecs | `check-runner` |
| Vérifier les traductions fr/en et les textes en dur de `apps/web` | `translations-auditor` |
| Vérifier que les valeurs maintenues à la main (plafonds du jour : API, `.env.example`, `infra/envs/prod`, `CLAUDE.md`) concordent | `config-sync-auditor` |
| Vérifier les index (rules dans `CLAUDE.md`, ADR dans `docs/adr/README.md`) et les liens relatifs de la doc | `docs-index-auditor` |
| Rejouer les garde-fous de `infra/` (fmt, validate, tflint, `terraform test`, checkov), jamais d'`apply` | `infra-checker` |

Une recherche qui demande plus d'une ou deux requêtes `Grep`/`Glob`, ou une commande dont la sortie
brute ne sert pas, se délègue **avant** de la faire soi-même.

## À garder

- Écrire ou modifier du code, **les tests d'abord** ([`tdd.md`](tdd.md)).
- Tout ce qui touche `domain` et `application`, les frontières de modules, la politique d'erreur.
- Les ADR, les specs, les décisions : un sous-agent ne tranche pas.
- Lire en entier le fichier que l'on s'apprête à modifier.

## Cadrer la délégation

- **Une tâche, un livrable.** Donner la question précise, le périmètre (projet, dossier) et le
  format de réponse attendu.
- **Un résultat de sous-agent est une indication, pas une preuve.** Avant de s'appuyer sur un
  `fichier:ligne` qu'il rapporte pour modifier du code, relire ce fichier.
- **Un échec rapporté par `check-runner` se corrige soi-même**, test de non-régression d'abord ; le
  sous-agent ne corrige jamais.
- Ne pas confondre avec les worktrees natifs de `.claude/worktrees/`
  ([`always-work-in-a-worktree.md`](always-work-in-a-worktree.md)) : ici il s'agit d'isoler un
  *contexte*, pas des fichiers.

## Ajouter un agent

Un agent se justifie par une tâche **répétée, bornée, vérifiable**. Il déclare `tools` au plus
juste (lecture seule par défaut) et `model: haiku` tant que la tâche n'exige pas de raisonner.
Dès qu'une tâche demande un jugement (revue, arbitrage), elle reste au modèle principal.
