#!/usr/bin/env bash

# Validation-only gate for a future exact-stack restore. It intentionally never
# decrypts an archive, starts/inspects Docker, invokes psql, mutates a target, or
# emits a restore receipt. Full restore remains NO-GO until the tracked contract
# has ownership, outbound-isolation, cleanup, Storage and two-run evidence.

set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
# shellcheck source=scripts/supabase/lib/secure-artifact.sh
source "${script_dir}/lib/secure-artifact.sh"

usage() {
  printf '%s\n' \
    'Usage: scripts/supabase/restore-exact-stack.sh' \
    '  --archive ABS.age --storage-archive ABS.age --approved-manifest ABS --snapshot ABS' \
    '  --runtime-env ABS --rendered-config ABS --arch amd64|arm64' \
    '  --migration-data skip'
}

fail() {
  printf 'Exact-stack restore preflight FAILED: %s\n' "$1" >&2
  exit 1
}

mode_of() {
  local value
  if value="$(stat -f '%Lp' "$1" 2>/dev/null)"; then
    printf '%s\n' "$value"
  else
    stat -c '%a' "$1"
  fi
}

size_of() {
  local value
  if value="$(stat -f '%z' "$1" 2>/dev/null)"; then
    printf '%s\n' "$value"
  else
    stat -c '%s' "$1"
  fi
}

physical_path() {
  local requested="$1"
  local parent base
  parent="$(dirname -- "$requested")"
  base="$(basename -- "$requested")"
  printf '%s/%s\n' "$(cd "$parent" && pwd -P)" "$base"
}

require_plain_absolute_path() {
  local requested="$1"
  [[ "$requested" == /* ]] || fail 'a required path is not absolute'
  case "$requested" in
    *'//'*) fail 'a required path is not normalized' ;;
    *'/./'*|*'/../'*|*/.|*/..) fail 'a required path contains a dot component' ;;
  esac
  [[ "$(physical_path "$requested")" == "$requested" ]] || \
    fail 'a required path contains a symlinked parent or is not physical'
  case "${requested}/" in
    "${repo_root}/"*) fail 'private restore inputs and outputs must be outside Git' ;;
  esac
}

require_private_file() {
  local requested="$1"
  require_plain_absolute_path "$requested"
  [[ -f "$requested" && ! -L "$requested" ]] || fail 'a private input is not a regular file'
  [[ "$(mode_of "$requested")" == '600' ]] || fail 'a private input must have exact mode 0600'
}

require_private_directory() {
  local requested="$1"
  require_plain_absolute_path "$requested"
  [[ -d "$requested" && ! -L "$requested" ]] || fail 'a private directory is invalid'
  [[ "$(mode_of "$requested")" == '700' ]] || fail 'a private directory must have exact mode 0700'
}

manifest_value() {
  local key="$1"
  local manifest="$2"
  awk -F= -v expected="$key" '
    $1 == expected { count += 1; value = substr($0, length(expected) + 2) }
    END { if (count == 1) print value; else exit 1 }
  ' "$manifest"
}

archive=''
storage_archive=''
approved_manifest=''
snapshot=''
runtime_env=''
rendered_config=''
arch=''
migration_data=''

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi
[[ "$#" -eq 16 ]] || { usage >&2; exit 2; }
while [[ "$#" -gt 0 ]]; do
  [[ "$#" -ge 2 ]] || fail 'an option value is missing'
  case "$1" in
    --archive) [[ -z "$archive" ]] || fail 'an option was repeated'; archive="$2" ;;
    --storage-archive) [[ -z "$storage_archive" ]] || fail 'an option was repeated'; storage_archive="$2" ;;
    --approved-manifest) [[ -z "$approved_manifest" ]] || fail 'an option was repeated'; approved_manifest="$2" ;;
    --snapshot) [[ -z "$snapshot" ]] || fail 'an option was repeated'; snapshot="$2" ;;
    --runtime-env) [[ -z "$runtime_env" ]] || fail 'an option was repeated'; runtime_env="$2" ;;
    --rendered-config) [[ -z "$rendered_config" ]] || fail 'an option was repeated'; rendered_config="$2" ;;
    --arch) [[ -z "$arch" ]] || fail 'an option was repeated'; arch="$2" ;;
    --migration-data) [[ -z "$migration_data" ]] || fail 'an option was repeated'; migration_data="$2" ;;
    *) fail 'an unknown option was provided' ;;
  esac
  shift 2
done

[[ "$archive" == *.tar.age ]] || fail 'archive must use the .tar.age format'
[[ "$storage_archive" == *.tar.age ]] || fail 'Storage archive must use the .tar.age format'
[[ "$arch" == 'amd64' || "$arch" == 'arm64' ]] || fail 'arch must be amd64 or arm64'
[[ "$migration_data" == 'skip' ]] || fail 'migration-data must be explicit skip'

require_private_file "$archive"
require_private_file "$storage_archive"
require_private_file "$approved_manifest"
require_private_file "$runtime_env"
require_private_file "$rendered_config"
require_private_directory "$snapshot"
require_private_file "${snapshot}/manifest.json"

for required_command in awk df node; do
  command -v "$required_command" >/dev/null 2>&1 || fail 'a required preflight tool is unavailable'
done

expected_entries='roles.sql,system-schema.sql,schema.sql,data.sql,migration-data.sql,provider-ledger-data.sql,manifest.txt'
expected_keys="$(printf '%s\n' \
  approval_format backup_set_id archive_entries db_archive_sha256 db_archive_bytes \
  db_plaintext_total_bytes storage_archive_sha256 storage_archive_bytes \
  upstream_snapshot supabase_cli_version postgres_image migration_data_policy \
  sha256.roles.sql bytes.roles.sql sha256.system-schema.sql bytes.system-schema.sql \
  sha256.schema.sql bytes.schema.sql sha256.data.sql bytes.data.sql \
  sha256.migration-data.sql bytes.migration-data.sql \
  sha256.provider-ledger-data.sql bytes.provider-ledger-data.sql \
  sha256.manifest.txt bytes.manifest.txt)"
actual_keys="$(awk -F= '{ print $1 }' "$approved_manifest")"
[[ "$actual_keys" == "$expected_keys" ]] || fail 'approved backup-set manifest keys or order are invalid'
[[ "$(wc -l <"$approved_manifest" | tr -d ' ')" == '26' ]] || \
  fail 'approved backup-set manifest line count is invalid'

[[ "$(manifest_value approval_format "$approved_manifest")" == 'xtrud-approved-backup-set-v1' ]] || \
  fail 'approved backup-set manifest format is invalid'
backup_set_id="$(manifest_value backup_set_id "$approved_manifest")" || \
  fail 'approved backup-set identity is missing'
[[ "$backup_set_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || \
  fail 'approved backup-set identity is invalid'
[[ "$(manifest_value archive_entries "$approved_manifest")" == "$expected_entries" ]] || \
  fail 'approved archive entry allowlist is invalid'
[[ "$(manifest_value migration_data_policy "$approved_manifest")" == 'skip' ]] || \
  fail 'approved migration-data policy is invalid'

tag="$(tr -d '[:space:]' <"${repo_root}/infra/supabase/.supabase-version")"
postgres_image="$(tr -d '[:space:]' <"${repo_root}/infra/supabase/.postgres-image")"
cli_version="$(tr -d '[:space:]' <"${repo_root}/infra/supabase/.cli-version")"
[[ "$(manifest_value upstream_snapshot "$approved_manifest")" == "$tag" ]] || \
  fail 'approved upstream pin is invalid'
[[ "$(manifest_value supabase_cli_version "$approved_manifest")" == "$cli_version" ]] || \
  fail 'approved CLI pin is invalid'
[[ "$(manifest_value postgres_image "$approved_manifest")" == "$postgres_image" ]] || \
  fail 'approved PostgreSQL pin is invalid'

approved_archive_hash="$(manifest_value db_archive_sha256 "$approved_manifest")" || \
  fail 'approved archive hash is missing'
approved_archive_bytes="$(manifest_value db_archive_bytes "$approved_manifest")" || \
  fail 'approved archive size is missing'
storage_archive_hash="$(manifest_value storage_archive_sha256 "$approved_manifest")" || \
  fail 'approved Storage hash is missing'
storage_archive_bytes="$(manifest_value storage_archive_bytes "$approved_manifest")" || \
  fail 'approved Storage size is missing'
[[ "$approved_archive_hash" =~ ^[0-9a-f]{64}$ ]] || fail 'approved archive hash is invalid'
[[ "$storage_archive_hash" =~ ^[0-9a-f]{64}$ ]] || fail 'approved Storage hash is invalid'
[[ "$approved_archive_bytes" =~ ^[0-9]+$ && "$approved_archive_bytes" -gt 0 ]] || \
  fail 'approved archive size is invalid'
[[ "$storage_archive_bytes" =~ ^[0-9]+$ && "$storage_archive_bytes" -gt 0 && \
  "$storage_archive_bytes" -le 1099511627776 ]] || \
  fail 'approved Storage size is invalid'

actual_archive_hash="$(supabase_sha256 "$archive")"
actual_archive_bytes="$(size_of "$archive")"
actual_storage_hash="$(supabase_sha256 "$storage_archive")"
actual_storage_bytes="$(size_of "$storage_archive")"
[[ "$actual_archive_hash" == "$approved_archive_hash" ]] || \
  fail 'ciphertext does not match the preapproved archive hash'
[[ "$actual_archive_bytes" == "$approved_archive_bytes" ]] || \
  fail 'ciphertext does not match the preapproved archive size'
[[ "$actual_storage_hash" == "$storage_archive_hash" ]] || \
  fail 'Storage ciphertext does not match the preapproved archive hash'
[[ "$actual_storage_bytes" == "$storage_archive_bytes" ]] || \
  fail 'Storage ciphertext does not match the preapproved archive size'

approved_plaintext_total="$(manifest_value db_plaintext_total_bytes "$approved_manifest")" || \
  fail 'approved DB plaintext total is missing'
[[ "$approved_plaintext_total" =~ ^[0-9]+$ && "$approved_plaintext_total" -gt 0 && \
  "$approved_plaintext_total" -le 17179869184 ]] || \
  fail 'approved DB plaintext total violates the reviewed boundary'
calculated_plaintext_total=0
for entry in roles.sql system-schema.sql schema.sql data.sql migration-data.sql \
  provider-ledger-data.sql manifest.txt; do
  entry_hash="$(manifest_value "sha256.${entry}" "$approved_manifest")" || \
    fail 'approved entry hash set is incomplete'
  entry_bytes="$(manifest_value "bytes.${entry}" "$approved_manifest")" || \
    fail 'approved entry size set is incomplete'
  [[ "$entry_hash" =~ ^[0-9a-f]{64}$ ]] || fail 'an approved entry hash is invalid'
  [[ "$entry_bytes" =~ ^[0-9]+$ && "$entry_bytes" -gt 0 && "$entry_bytes" -le 8589934592 ]] || \
    fail 'an approved entry size violates the decompression boundary'
  calculated_plaintext_total=$((calculated_plaintext_total + entry_bytes))
done
[[ "$calculated_plaintext_total" == "$approved_plaintext_total" ]] || \
  fail 'approved entry sizes do not equal the approved DB plaintext total'

archive_parent="$(dirname -- "$archive")"
free_kib="$(df -Pk "$archive_parent" | awk 'NR == 2 { print $4 }')"
[[ "$free_kib" =~ ^[0-9]+$ ]] || fail 'staging free-space check failed'
free_bytes=$((free_kib * 1024))
required_bytes=$((approved_archive_bytes + storage_archive_bytes + approved_plaintext_total * 3 + 1073741824))
if [[ "$required_bytes" -lt 32212254720 ]]; then
  required_bytes=32212254720
fi
[[ "$free_bytes" -ge "$required_bytes" ]] || \
  fail 'staging free space is below the approved restore boundary'

if ! node "${script_dir}/check-upstream-snapshot.mjs" \
  --snapshot "$snapshot" --profile rehearsal >/dev/null 2>&1; then
  fail 'snapshot validation did not pass'
fi
if ! node "${script_dir}/check-runtime-env.mjs" \
  --env "$runtime_env" --mode rehearsal --arch "$arch" >/dev/null 2>&1; then
  fail 'runtime env validation did not pass'
fi
if ! node "${script_dir}/check-rendered-compose.mjs" \
  --config "$rendered_config" --snapshot "$snapshot" --profile rehearsal --arch "$arch" \
  >/dev/null 2>&1; then
  fail 'rendered config validation did not pass'
fi

printf '%s\n' \
  'Exact-stack restore preflight PASS (validation-only).' \
  'Restore remains NO-GO: no archive was decrypted, no target was touched, and no receipt was issued.'
