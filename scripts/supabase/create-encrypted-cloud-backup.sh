#!/usr/bin/env bash

# Creates an encrypted logical clone bundle in a private transient directory.
# The bundle contains the three official dumps plus provider schemas and
# migration ledgers for forensic/raw-clone rehearsals. Plaintext is removed by
# the EXIT trap. Run only in an explicitly approved production backup window.

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
command -v docker >/dev/null 2>&1 || {
  printf '%s\n' 'ERROR: Docker is required for provider migration ledgers.' >&2
  exit 2
}

supabase_require_encryption
encryption_extension="$(supabase_encryption_extension)"
output_dir="$(supabase_secure_output_dir "$1")"
required_cli_version="$(tr -d '\r\n' <"${repo_root}/infra/supabase/.cli-version")"
actual_cli_version="$(supabase --version | tr -d '\r\n')"
if [[ "${actual_cli_version}" != "${required_cli_version}" ]]; then
  printf 'ERROR: Supabase CLI %s is required; found %s.\n' \
    "${required_cli_version}" "${actual_cli_version}" >&2
  exit 2
fi
postgres_image="$(tr -d '\r\n' <"${repo_root}/infra/supabase/.postgres-image")"
if [[ ! "$postgres_image" =~ ^public\.ecr\.aws/supabase/postgres:[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'ERROR: invalid pinned Supabase PostgreSQL image.' >&2
  exit 2
fi
upstream_snapshot="$(tr -d '\r\n' <"${repo_root}/infra/supabase/.supabase-version")"
if [[ ! "$upstream_snapshot" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  printf '%s\n' 'ERROR: invalid pinned Supabase upstream snapshot.' >&2
  exit 2
fi
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
artifact_path="${output_dir}/supabase-cloud-logical-${timestamp}.tar.${encryption_extension}"
candidate_path="${artifact_path}.candidate.$$"
if [[ -e "$artifact_path" ]]; then
  printf 'ERROR: refusing to overwrite encrypted artifact: %s\n' "$artifact_path" >&2
  exit 2
fi
stage_dir="$(mktemp -d "${output_dir}/.supabase-cloud-backup.XXXXXX")"

cleanup() {
  rm -rf -- "$stage_dir"
  rm -f -- "$candidate_path" "${candidate_path}.partial.$$"
}
trap cleanup EXIT

supabase db dump --db-url "$SOURCE_DB_URL" --file "${stage_dir}/roles.sql" --role-only
# The default platform dump intentionally omits provider-managed Auth/Storage
# DDL and the migration ledger. Their data is either present in data.sql or
# needed to prevent old migrations from running twice. Keep the exact source
# DDL and ledger data encrypted alongside the official three-file dump; these
# files are forensic/raw-clone inputs only and must not be applied over the
# provider-owned schemas of a ready self-hosted stack.
supabase db dump --db-url "$SOURCE_DB_URL" \
  --schema auth,storage,supabase_migrations \
  --file "${stage_dir}/system-schema.sql"
supabase db dump --db-url "$SOURCE_DB_URL" --file "${stage_dir}/schema.sql"
supabase db dump --db-url "$SOURCE_DB_URL" --file "${stage_dir}/data.sql" \
  --use-copy --data-only \
  --exclude "storage.buckets_vectors" \
  --exclude "storage.vector_indexes"
supabase db dump --db-url "$SOURCE_DB_URL" \
  --schema supabase_migrations \
  --file "${stage_dir}/migration-data.sql" \
  --use-copy --data-only
# Supabase CLI excludes the GoTrue and Storage internal ledgers even when their
# schemas are selected explicitly. Preserve only those two tables with the
# exact PostgreSQL image. Docker inherits SOURCE_DB_URL by name, so its value is
# not placed in the host Docker CLI argv. It remains a break-glass credential
# visible to the Docker daemon/container and must be rotated after the window.
docker run --rm \
  --entrypoint sh \
  --env SOURCE_DB_URL \
  "$postgres_image" \
  -c 'exec pg_dump --dbname="$SOURCE_DB_URL" --data-only --no-owner --no-privileges --table auth.schema_migrations --table storage.migrations' \
  >"${stage_dir}/provider-ledger-data.sql"

{
  printf 'backup_format=xtrud-supabase-logical-v1\n'
  printf 'complete=true\n'
  printf '%s\n' 'archive_entries=roles.sql,system-schema.sql,schema.sql,data.sql,migration-data.sql,provider-ledger-data.sql,manifest.txt'
  printf 'captured_at=%s\n' "$timestamp"
  printf 'upstream_snapshot=%s\n' "$upstream_snapshot"
  printf 'supabase_cli_version=%s\n' "$actual_cli_version"
  printf 'postgres_image=%s\n' "$postgres_image"
  printf 'provider_schema_policy=forensic-raw-clone-only\n'
  for dump_name in \
    roles.sql system-schema.sql schema.sql data.sql migration-data.sql \
    provider-ledger-data.sql; do
    dump_hash="$(supabase_sha256 "${stage_dir}/${dump_name}")"
    if [[ ! "$dump_hash" =~ ^[0-9a-f]{64}$ ]]; then
      printf 'ERROR: invalid SHA-256 for %s.\n' "$dump_name" >&2
      exit 1
    fi
    printf 'sha256.%s=%s\n' "$dump_name" "$dump_hash"
  done
} >"${stage_dir}/manifest.txt"

if ! tar -C "$stage_dir" -cf - \
  roles.sql system-schema.sql schema.sql data.sql migration-data.sql \
  provider-ledger-data.sql manifest.txt \
  | supabase_encrypt_stream "$candidate_path"; then
  printf '%s\n' 'ERROR: dump or encryption failed; partial ciphertext and plaintext staging were removed.' >&2
  exit 1
fi

checksum="$(supabase_sha256 "$candidate_path")"
if [[ ! "$checksum" =~ ^[0-9a-f]{64}$ ]]; then
  printf '%s\n' 'ERROR: encrypted artifact checksum failed; unpublished ciphertext was removed.' >&2
  exit 1
fi
if ! ln -- "$candidate_path" "$artifact_path"; then
  printf '%s\n' 'ERROR: encrypted artifact publication collided or failed; existing artifacts were preserved.' >&2
  exit 1
fi
rm -f -- "$candidate_path"
printf 'Encrypted logical backup written: %s\nSHA-256: %s\n' "$artifact_path" "$checksum"
