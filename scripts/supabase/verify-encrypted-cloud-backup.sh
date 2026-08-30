#!/usr/bin/env bash

# Fail-closed structural and checksum verifier for xtrud Cloud logical bundles.
# It does not restore SQL and never leaves decrypted material after exit.

set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
# shellcheck source=scripts/supabase/lib/secure-artifact.sh
source "${script_dir}/lib/secure-artifact.sh"

usage() {
  printf '%s\n' \
    'Usage: scripts/supabase/verify-encrypted-cloud-backup.sh /absolute/archive.tar.age|gpg' \
    '' \
    'For age archives set BACKUP_IDENTITY to an absolute private identity file.' \
    'GPG archives use the private key already available to the local GPG agent.'
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi
if [[ "$#" -ne 1 || "$1" != /* || ! -f "$1" || -L "$1" ]]; then
  usage >&2
  exit 2
fi

archive="$1"
stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/xtrud-backup-verify.XXXXXX")"
cleanup() {
  rm -rf -- "$stage_dir"
}
trap cleanup EXIT

case "$archive" in
  *.tar.age)
    if [[ -z "${BACKUP_IDENTITY:-}" || "$BACKUP_IDENTITY" != /* || ! -f "$BACKUP_IDENTITY" ]]; then
      printf '%s\n' 'ERROR: BACKUP_IDENTITY must be an absolute age identity file.' >&2
      exit 2
    fi
    command -v age >/dev/null 2>&1 || {
      printf '%s\n' 'ERROR: age is required.' >&2
      exit 2
    }
    age --decrypt --identity "$BACKUP_IDENTITY" "$archive" >"${stage_dir}/bundle.tar"
    ;;
  *.tar.gpg)
    command -v gpg >/dev/null 2>&1 || {
      printf '%s\n' 'ERROR: gpg is required.' >&2
      exit 2
    }
    gpg --batch --decrypt "$archive" >"${stage_dir}/bundle.tar"
    ;;
  *)
    printf '%s\n' 'ERROR: unsupported encrypted archive extension.' >&2
    exit 2
    ;;
esac

expected_entries="$(printf '%s\n' \
  roles.sql system-schema.sql schema.sql data.sql migration-data.sql \
  provider-ledger-data.sql manifest.txt)"
actual_entries="$(tar -tf "${stage_dir}/bundle.tar")"
if [[ "$actual_entries" != "$expected_entries" ]]; then
  printf '%s\n' 'ERROR: archive entries are incomplete, reordered, or unsafe.' >&2
  exit 1
fi
if ! tar -tvf "${stage_dir}/bundle.tar" | awk '$1 !~ /^-/ { exit 1 }'; then
  printf '%s\n' 'ERROR: archive entry is not a regular file.' >&2
  exit 1
fi

tar -xf "${stage_dir}/bundle.tar" -C "$stage_dir"
manifest="${stage_dir}/manifest.txt"
for entry_name in \
  roles.sql system-schema.sql schema.sql data.sql migration-data.sql \
  provider-ledger-data.sql manifest.txt; do
  if [[ ! -f "${stage_dir}/${entry_name}" || -L "${stage_dir}/${entry_name}" ]]; then
    printf 'ERROR: archive entry is not a regular file: %s\n' "$entry_name" >&2
    exit 1
  fi
done
manifest_line_count="$(wc -l <"$manifest" | tr -d ' ')"
if [[ "$manifest_line_count" != '14' ]] \
  || ! grep -qx 'backup_format=xtrud-supabase-logical-v1' "$manifest" \
  || ! grep -qx 'complete=true' "$manifest" \
  || ! grep -qx 'archive_entries=roles.sql,system-schema.sql,schema.sql,data.sql,migration-data.sql,provider-ledger-data.sql,manifest.txt' "$manifest" \
  || ! grep -Eq '^captured_at=[0-9]{8}T[0-9]{6}Z$' "$manifest" \
  || ! grep -Eq '^upstream_snapshot=[A-Za-z0-9._/-]+$' "$manifest" \
  || ! grep -Eq '^supabase_cli_version=[0-9]+\.[0-9]+\.[0-9]+$' "$manifest" \
  || ! grep -Eq '^postgres_image=public\.ecr\.aws/supabase/postgres:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$' "$manifest" \
  || ! grep -qx 'provider_schema_policy=forensic-raw-clone-only' "$manifest"; then
  printf '%s\n' 'ERROR: manifest format, completeness, or tool pins are invalid.' >&2
  exit 1
fi

for dump_name in \
  roles.sql system-schema.sql schema.sql data.sql migration-data.sql \
  provider-ledger-data.sql; do
  if [[ ! -s "${stage_dir}/${dump_name}" ]]; then
    printf 'ERROR: required dump is empty: %s\n' "$dump_name" >&2
    exit 1
  fi
  expected_hash="$(awk -F= -v key="sha256.${dump_name}" '$1 == key { print $2 }' "$manifest")"
  actual_hash="$(supabase_sha256 "${stage_dir}/${dump_name}")"
  if [[ ! "$expected_hash" =~ ^[0-9a-f]{64}$ || "$actual_hash" != "$expected_hash" ]]; then
    printf 'ERROR: checksum mismatch: %s\n' "$dump_name" >&2
    exit 1
  fi
done

archive_hash="$(supabase_sha256 "$archive")"
if [[ ! "$archive_hash" =~ ^[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'ERROR: encrypted archive checksum failed.' >&2
  exit 1
fi
printf 'Verified logical backup: %s\nSHA-256: %s\n' "$archive" "$archive_hash"
