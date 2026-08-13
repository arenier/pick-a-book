# Always work in a dedicated worktree

**Rule.** No change is ever made directly on `main` or in the primary checkout. Every task (feature,
fix, ADR, experiment) lives in its own worktree, created with worktrunk (`wt`).

## Why

- `main` is protected (direct push refused): work necessarily goes through a branch + PR.
- One worktree per task isolates the changes, the `node_modules` and the build state — several can
  run at once without stepping on each other.
- Dev servers run on ports **derived from the branch name** (`wt api`, `wt web`), so several
  worktrees serve in parallel without port collisions.

## How

```bash
wt switch --create feat/my-feature   # creates the branch + worktree; `pre-start` runs `yarn install`
# ... work inside the worktree ...
wt api          # NestJS API on a PORT derived from the branch
wt web          # Vite front on a WEB_PORT derived from the branch
wt list         # worktree status (URL dimmed until the port is listening)
gh pr create
gh pr merge --squash --delete-branch
wt remove       # removes the worktree; deletes the branch once it is merged
```

- `wt switch <branch>` (without `--create`) hops to an existing worktree; `wt switch -` goes back to
  the previous one, `wt switch ^` to the default branch.
- The worktrunk project config lives in [`.config/wt.toml`](../../.config/wt.toml): `pre-start` hook,
  `api`/`web` aliases, `wt list` URL column. worktrunk owns where worktrees live, outside the
  primary checkout.

## Don't confuse the two

worktrunk (`wt`) is the dev tool. There is also Claude Code's **native** worktree under
`.claude/worktrees/` (gitignored): a distinct mechanism, reserved for isolating a sub-agent. For
everyday work, use worktrunk.
