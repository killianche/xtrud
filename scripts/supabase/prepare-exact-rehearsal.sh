#!/usr/bin/env bash

set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
TAG="$(tr -d '[:space:]' < "$ROOT_DIR/infra/supabase/.supabase-version")"
COMMIT="$(tr -d '[:space:]' < "$ROOT_DIR/infra/supabase/.supabase-commit")"
DOCKER_TREE="$(tr -d '[:space:]' < "$ROOT_DIR/infra/supabase/.supabase-docker-tree")"
DESTINATION="${1:-}"

fail() {
  printf 'Exact rehearsal preparation FAILED: %s\n' "$1" >&2
  exit 1
}

[[ -n "$DESTINATION" ]] || fail "usage: $0 /private/tmp/xtrud-exact-stack.<id>"
[[ "$DESTINATION" = /* ]] || fail "destination must be absolute"
DESTINATION_PARENT="$(dirname -- "$DESTINATION")"
DESTINATION_BASENAME="$(basename -- "$DESTINATION")"
[[ "$DESTINATION_BASENAME" =~ ^xtrud-exact-stack\.[A-Za-z0-9_-]+$ ]] || \
  fail "destination basename must match xtrud-exact-stack.<safe-id>"
[[ -d "$DESTINATION_PARENT" ]] || fail "destination parent must already exist"
DESTINATION_PARENT="$(cd "$DESTINATION_PARENT" && pwd -P)"
[[ "$DESTINATION_PARENT" = "/private/tmp" ]] || \
  fail "destination parent must resolve exactly to /private/tmp"
DESTINATION="$DESTINATION_PARENT/$DESTINATION_BASENAME"
[[ ! -e "$DESTINATION" && ! -L "$DESTINATION" ]] || fail "destination already exists"

for command_name in git node; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

STAGING="${DESTINATION}.partial"
[[ ! -e "$STAGING" && ! -L "$STAGING" ]] || fail "staging path already exists"
cleanup() {
  if [[ -d "$STAGING" && ! -L "$STAGING" ]]; then
    rm -rf -- "$STAGING"
  fi
}
trap cleanup EXIT INT TERM

mkdir -m 700 "$STAGING"
git clone --filter=blob:none --no-checkout --depth=1 --branch "$TAG" \
  https://github.com/supabase/supabase.git "$STAGING/upstream"
git -C "$STAGING/upstream" sparse-checkout init --cone
git -C "$STAGING/upstream" sparse-checkout set docker
git -C "$STAGING/upstream" checkout --quiet "$TAG"

[[ "$(git -C "$STAGING/upstream" rev-parse HEAD)" = "$COMMIT" ]] || fail "upstream commit mismatch"
[[ "$(git -C "$STAGING/upstream" rev-parse HEAD:docker)" = "$DOCKER_TREE" ]] || fail "upstream docker tree mismatch"
node "$ROOT_DIR/scripts/supabase/check-upstream-snapshot.mjs" \
  --compose "$STAGING/upstream/docker/docker-compose.yml"

mkdir -m 700 "$STAGING/stack"
cp -R "$STAGING/upstream/docker/." "$STAGING/stack/"
cp "$ROOT_DIR/infra/supabase/docker-compose.rehearsal.yml" "$STAGING/stack/"
cp "$ROOT_DIR/infra/supabase/rehearsal.env.example" "$STAGING/stack/.env.rehearsal.example"
cp "$ROOT_DIR/infra/supabase/image-digests.json" "$STAGING/stack/xtrud-image-digests.json"
chmod 600 "$STAGING/stack/.env.rehearsal.example" "$STAGING/stack/xtrud-image-digests.json"

node -e '
  const fs = require("node:fs");
  const [path, tag, commit, dockerTree] = process.argv.slice(1);
  fs.writeFileSync(path, `${JSON.stringify({
    format: "xtrud-exact-rehearsal-v1",
    upstream: { tag, commit, dockerTree },
    runnable: false,
    nextGate: "generate and validate a private mode-0600 runtime env before compose config",
  }, null, 2)}\n`, { mode: 0o600 });
' "$STAGING/manifest.json" "$TAG" "$COMMIT" "$DOCKER_TREE"

node "$ROOT_DIR/scripts/supabase/check-upstream-snapshot.mjs" --snapshot "$STAGING"

mv "$STAGING" "$DESTINATION"
trap - EXIT INT TERM
printf 'Exact rehearsal snapshot prepared: %s\n' "$DESTINATION"
printf 'No containers started and no secrets generated.\n'
