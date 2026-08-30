#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

if [[ "$#" -ne 1 ]]; then
  printf 'Exact rehearsal preparation FAILED: usage: %s %s/xtrud-exact-stack.<id>\n' \
    "$0" "$(cd /tmp && pwd -P)" >&2
  exit 1
fi

exec bash "$ROOT_DIR/scripts/supabase/prepare-exact-stack.sh" rehearsal "$1"
