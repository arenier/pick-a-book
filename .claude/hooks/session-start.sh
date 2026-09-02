#!/bin/bash
# Prepares a Claude Code on the web session so that everything CI runs also runs here:
# `yarn check` on the Nx side, and `terraform fmt/validate/test`, `tflint` and `checkov` on
# the infra side.
#
# Why this is needed: the remote container ships Node 22 and Yarn Classic 1.22.22, while the
# repo pins Node 26.5.1 and Yarn 4.18.0 (the `volta` field of package.json, CLAUDE.md).
# Volta is not installed there, and Node 26 no longer ships Corepack — so `packageManager`
# alone does not hand us the right Yarn. Nor is there any Terraform. This mirrors what
# .github/workflows/ci.yml does, with the same exact pins.
#
# Local machines are left alone: Volta and mise already do this job there.
#
# Every version below is READ FROM THE FILE THAT OWNS IT, never retyped. CLAUDE.md already
# counts three hand-maintained copies of the Terraform pin, and ci.yml has a dedicated step
# to catch them drifting; this script refuses to become the fourth.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

TOOLS="$HOME/.local"
BIN="$TOOLS/bin"
mkdir -p "$BIN"

# Reads one pin, and fails loudly when it cannot: an empty version would silently install
# "latest", which is exactly the drift the exact pins exist to prevent.
pin() {
  local name="$1" value="$2"
  if [ -z "$value" ]; then
    echo "error: could not read the $name pin — it moved or changed shape, update this hook" >&2
    exit 1
  fi
  echo "$value"
}

NODE_VERSION=$(pin "Node" "$(python3 -c 'import json;print(json.load(open("package.json"))["volta"]["node"])')")
YARN_VERSION=$(pin "Yarn" "$(python3 -c 'import json;print(json.load(open("package.json"))["volta"]["yarn"])')")
TERRAFORM_VERSION=$(pin "Terraform" "$(sed -n 's/^terraform *= *"\([^"]*\)".*/\1/p' infra/mise.toml)")
TFLINT_VERSION=$(pin "tflint" "$(sed -n 's/^tflint *= *"\([^"]*\)".*/\1/p' infra/mise.toml)")
CHECKOV_VERSION=$(pin "checkov" "$(sed -n 's/.*pip install --quiet checkov==\([0-9][0-9.]*\).*/\1/p' .github/workflows/ci.yml)")

# --- Node and Yarn ------------------------------------------------------------
# Idempotent throughout: a cached container already carries the toolchain, so a re-run is a
# no-op and costs nothing.

NODE_DIR="$TOOLS/node-$NODE_VERSION"
if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "Installing Node $NODE_VERSION..."
  mkdir -p "$NODE_DIR"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
    | tar -xJ -C "$NODE_DIR" --strip-components=1
fi
export PATH="$NODE_DIR/bin:$BIN:$PATH"

if [ "$(yarn --version 2>/dev/null || echo none)" != "$YARN_VERSION" ]; then
  echo "Installing Yarn $YARN_VERSION..."
  npm i -g "@yarnpkg/cli-dist@$YARN_VERSION"
fi

# --- Infra toolchain ----------------------------------------------------------
# The infra half of CI (terraform fmt/validate/test, tflint, checkov) is unrunnable without
# these, and `terraform test` is not optional here: TDD covers the IaC too (CLAUDE.md).

if [ "$(terraform version -json 2>/dev/null | sed -n 's/.*"terraform_version": *"\([^"]*\)".*/\1/p')" != "$TERRAFORM_VERSION" ]; then
  echo "Installing Terraform $TERRAFORM_VERSION..."
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/tf.zip" \
    "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip"
  unzip -q -o "$tmp/tf.zip" -d "$BIN"
  rm -rf "$tmp"
fi

if [ "$(tflint --version 2>/dev/null | sed -n 's/^TFLint version \(.*\)/\1/p')" != "$TFLINT_VERSION" ]; then
  echo "Installing tflint $TFLINT_VERSION..."
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/tflint.zip" \
    "https://github.com/terraform-linters/tflint/releases/download/v${TFLINT_VERSION}/tflint_linux_amd64.zip"
  unzip -q -o "$tmp/tflint.zip" -d "$BIN"
  rm -rf "$tmp"
fi

# checkov is slow to install and only used by the infra job; --quiet keeps the session log
# readable. `pip install --user` puts it in ~/.local/bin, already on PATH above.
if [ "$(checkov --version 2>/dev/null || true)" != "$CHECKOV_VERSION" ]; then
  echo "Installing checkov $CHECKOV_VERSION..."
  python3 -m pip install --user --quiet --disable-pip-version-check "checkov==$CHECKOV_VERSION"
fi

# --- Session state ------------------------------------------------------------

# Persist the toolchain for every command the session runs afterwards; without this, each
# Bash call falls back to the container's Node 22 and Yarn Classic, and finds no Terraform.
echo "export PATH=\"$NODE_DIR/bin:$BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"

# `yarn install`, not `--immutable`: the container state is cached after this hook, and a
# lockfile touched during the session should not fail the next startup.
yarn install

# The API refuses to boot without its required variables, on purpose (CLAUDE.md). Copying
# the example is what makes `yarn api` work out of the box; a .env already present is left
# untouched, since it may carry real keys.
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example."
fi

echo "Node $(node --version), Yarn $(yarn --version), Terraform $TERRAFORM_VERSION, tflint $TFLINT_VERSION, checkov $CHECKOV_VERSION — workspace ready."
