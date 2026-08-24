#!/usr/bin/env bash

# Creates the three official Supabase logical dumps in a private transient
# directory, streams them into one encrypted archive, and removes plaintext via
# EXIT trap. Run only after the production backup window is explicitly approved.

set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
# shellcheck source=scripts/supabase/lib/secure-artifact.sh
source "${script_dir}/lib/secure-artifact.sh"

usage() {
  printf '%s\n' \
    'Usage: scripts/supabase/create-encrypted-cloud-backup.sh /absolute/output/directory' \
    '' \
    'Required environment (load from a local secret store, not shell history):' \
    '  SOURCE_DB_URL       sanctioned source database URL' \
    '  BACKUP_ENCRYPTION   age or gpg' \
    '  BACKUP_RECIPIENT    encryption recipient/public key identity' \
    '' \
    'Requires the pinned Supabase CLI and its Docker runtime.'
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi

if [[ "$#" -ne 1 ]]; then
  usage >&2
  exit 2
fi

if [[ -z "${SOURCE_DB_URL:-}" ]]; then
  printf '%s\n' 'ERROR: SOURCE_DB_URL is required and was not printed.' >&2
  exit 2
fi

command -v supabase >/dev/null 2>&1 || {
  printf '%s\n' 'ERROR: the pinned Supabase CLI is required.' >&2
  exit 2
}
command -v tar >/dev/null 2>&1 || {
  printf '%s\n' 'ERROR: tar is required.' >&2
  exit 2
}

supabase_require_encryption
encryption_extension="$(supabase_encryption_extension)"
output_dir="$(supabase_secure_output_dir "$1")"
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
artifact_path="${output_dir}/supabase-cloud-logical-${timestamp}.tar.${encryption_extension}"
stage_dir="$(mktemp -d "${output_dir}/.supabase-cloud-backup.XXXXXX")"

cleanup() {
  rm -rf -- "$stage_dir"
  rm -f -- "${artifact_path}.partial.$$"
}
trap cleanup EXIT

supabase db dump --db-url "$SOURCE_DB_URL" --file "${stage_dir}/roles.sql" --role-only
supabase db dump --db-url "$SOURCE_DB_URL" --file "${stage_dir}/schema.sql"
supabase db dump --db-url "$SOURCE_DB_URL" --file "${stage_dir}/data.sql" --use-copy --data-only

{
  printf 'captured_at=%s\n' "$timestamp"
  printf 'upstream_snapshot=%s\n' "$(tr -d '\r\n' <"${repo_root}/infra/supabase/.supabase-version")"
  for dump_name in roles.sql schema.sql data.sql; do
    printf 'sha256.%s=%s\n' "$dump_name" "$(supabase_sha256 "${stage_dir}/${dump_name}")"
  done
} >"${stage_dir}/manifest.txt"

if ! tar -C "$stage_dir" -cf - roles.sql schema.sql data.sql manifest.txt \
  | supabase_encrypt_stream "$artifact_path"; then
  rm -f -- "$artifact_path"
  printf '%s\n' 'ERROR: dump or encryption failed; partial ciphertext and plaintext staging were removed.' >&2
  exit 1
fi

checksum="$(supabase_sha256 "$artifact_path")"
printf 'Encrypted logical backup written: %s\nSHA-256: %s\n' "$artifact_path" "$checksum"
