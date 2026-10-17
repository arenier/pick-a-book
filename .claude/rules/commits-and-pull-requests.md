# Commits et pull requests

- **Messages de commit en anglais**, au format Conventional Commits (`feat(web): …`,
  `fix(infra): …`, `build: …`).
- **Le titre d'une PR est un message de commit, donc en anglais.** Le merge est un squash, et ce
  titre devient le sujet du commit sur `main` : un titre français y laisse une trace définitive.
- **Le corps de la PR est de la doc, donc en français.**
- `main` est protégée : push direct refusé, force-push et suppression interdits, conversations à
  résoudre. L'auteur merge sa propre PR (`gh pr merge --squash --delete-branch`).
- Tout travail se fait dans un worktree dédié : voir
  [`always-work-in-a-worktree.md`](always-work-in-a-worktree.md).
- Une décision structurante passe par un ADR avant ou avec le code : voir [`adr.md`](adr.md).

Ces règles valent même quand le skill `create-pr` n'est pas chargé.
