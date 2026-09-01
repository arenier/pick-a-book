#!/bin/bash
# Prepares a Claude Code on the web session so that `yarn lint`, `yarn test` and `yarn build`
# actually run.
#
# Why this is needed: the remote container ships Node 22 and Yarn Classic 1.22.22, while the
# repo pins Node 26.5.1 and Yarn 4.18.0 (the `volta` field of package.json, CLAUDE.md).
# Volta is not installed there, and Node 26 no longer ships Corepack — so `packageManager`
# alone does not hand us the right Yarn. This mirrors what .github/workflows/ci.yml does:
# an explicit Node, then `npm i -g @yarnpkg/cli-dist`.
#
# Local machines are left alone: Volta already does this job there.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Kept in sync by hand with the `volta` field of package.json and with ci.yml — the same
# arrangement as the Node pins of docker/ (CLAUDE.md).
NODE_VERSION=26.5.1
YARN_VERSION=4.18.0

NODE_DIR="$HOME/.local/node-$NODE_VERSION"

# Idempotent: a cached container already carries the toolchain, so re-running is a no-op.
if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "Installing Node $NODE_VERSION..."
  mkdir -p "$NODE_DIR"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
    | tar -xJ -C "$NODE_DIR" --strip-components=1
fi

export PATH="$NODE_DIR/bin:$PATH"

if [ "$(yarn --version 2>/dev/null || echo none)" != "$YARN_VERSION" ]; then
  echo "Installing Yarn $YARN_VERSION..."
  npm i -g "@yarnpkg/cli-dist@$YARN_VERSION"
fi

# Persist the toolchain for every command the session runs afterwards; without this, each
# Bash call falls back to the container's Node 22 and Yarn Classic.
echo "export PATH=\"$NODE_DIR/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"

cd "$CLAUDE_PROJECT_DIR"

# `yarn install`, not `--immutable`: the container state is cached after this hook, and a
# lockfile touched during the session should not fail the next startup.
yarn install

echo "Node $(node --version), Yarn $(yarn --version) — workspace ready."
