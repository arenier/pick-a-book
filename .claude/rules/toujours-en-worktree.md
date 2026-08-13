# Toujours travailler dans un worktree dédié

**Règle.** Aucun changement ne se fait directement sur `main` ni dans le checkout principal. Chaque
tâche (feature, fix, ADR, expérimentation) vit dans son propre worktree, créé avec worktrunk (`wt`).

## Pourquoi

- `main` est protégée (push direct refusé) : le travail passe forcément par une branche + PR.
- Un worktree par tâche isole les changements, le `node_modules` et l'état de build — on peut en
  mener plusieurs de front sans se marcher dessus.
- Les serveurs de dev tournent sur des ports **dérivés du nom de branche** (`wt api`, `wt web`),
  donc plusieurs worktrees servent en parallèle sans collision.

## Comment

```bash
wt switch --create feat/ma-feature   # crée la branche + le worktree ; `pre-start` fait `yarn install`
# ... on code dans le worktree ...
wt api          # API NestJS sur un PORT dérivé de la branche
wt web          # front Vite sur un WEB_PORT dérivé de la branche
wt list         # état des worktrees (URL grisée tant que le port n'écoute pas)
gh pr create
gh pr merge --squash --delete-branch
wt remove       # retire le worktree ; supprime la branche si elle est mergée
```

- `wt switch <branche>` (sans `--create`) rebascule sur un worktree existant ; `wt switch -` revient
  au précédent, `wt switch ^` à la branche par défaut.
- La config projet worktrunk est dans [`.config/wt.toml`](../../.config/wt.toml) : hook `pre-start`,
  alias `api`/`web`, colonne URL de `wt list`. worktrunk gère l'emplacement des worktrees, hors du
  checkout principal.

## À ne pas confondre

worktrunk (`wt`) est l'outil de dev. Il existe aussi le worktree **natif de Claude Code** sous
`.claude/worktrees/` (gitignoré) : mécanisme distinct, réservé à l'isolation d'un sous-agent. Pour
le travail courant, c'est worktrunk.
