#!/usr/bin/env bash

# Runs the read-only SQL inventory. Prefer standard libpq PG* variables so no
# database URL is placed on the psql command line. The report is encrypted as a
# stream, so no plaintext report is retained on disk. Exact row counts are an
# explicit opt-in because they scan.

set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
# shellcheck source=scripts/supabase/lib/secure-artifact.sh
source "${script_dir}/lib/secure-artifact.sh"

usage() {
  printf '%s\n' \
    'Usage: scripts/supabase/collect-db-inventory.sh [--exact-counts] /absolute/output/directory' \
    '' \
    'Required environment (load from a local secret store, not shell history):' \
    '  Preferred: standard libpq PGHOST/PGPORT/PGDATABASE/PGUSER plus PGPASSFILE' \
    '  Compatibility: SUPABASE_DB_URL (may be visible to same-host process observers)' \
    '  BACKUP_ENCRYPTION   age or gpg' \
    '  BACKUP_RECIPIENT    encryption recipient/public key identity' \
    '' \
    'Default row counts are catalog estimates. --exact-counts performs full scans.'
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

exact_counts='off'
if [[ "${1:-}" == '--exact-counts' ]]; then
  exact_counts='on'
  shift
fi

if [[ "$#" -ne 1 ]]; then
  usage >&2
  exit 2
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]] && \
  { [[ -z "${PGHOST:-}" ]] || [[ -z "${PGDATABASE:-}" ]] || [[ -z "${PGUSER:-}" ]]; }; then
  printf '%s\n' \
    'ERROR: set standard libpq PGHOST/PGDATABASE/PGUSER variables or SUPABASE_DB_URL.' >&2
  exit 2
fi

supabase_require_encryption
encryption_extension="$(supabase_encryption_extension)"
output_dir="$(supabase_secure_output_dir "$1")"

if ! command -v psql >/dev/null 2>&1; then
  printf '%s\n' 'ERROR: psql is required.' >&2
  exit 2
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
report_path="${output_dir}/supabase-db-inventory-${timestamp}.txt.${encryption_extension}"
temporary_error="$(mktemp "${output_dir}/.inventory-error.XXXXXX")"

cleanup() {
  rm -f -- "$temporary_error" "${report_path}.partial.$$"
}
trap cleanup EXIT

run_inventory_psql() {
  if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    # libpq does not interpret a URI supplied through PGDATABASE as conninfo.
    # This compatibility path therefore has to use --dbname. Production runs
    # should use the standard PG* variables and a mode-0600 PGPASSFILE instead.
    psql --dbname="$SUPABASE_DB_URL" \
      --no-psqlrc \
      --no-password \
      --set=ON_ERROR_STOP=1 \
      --set="exact_counts=${exact_counts}" \
      --file="${script_dir}/db-inventory.sql"
  else
    psql \
      --no-psqlrc \
      --no-password \
      --set=ON_ERROR_STOP=1 \
      --set="exact_counts=${exact_counts}" \
      --file="${script_dir}/db-inventory.sql"
  fi
}

export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
if ! run_inventory_psql 2>"$temporary_error" | supabase_encrypt_stream "$report_path"; then
  rm -f -- "$report_path"
  printf '%s\n' \
    'ERROR: read-only inventory failed. Connection details and raw database errors were suppressed.' \
    'Check network access, encryption recipient, the read-only role, TLS, and psql compatibility.' >&2
  exit 1
fi

checksum="$(supabase_sha256 "$report_path")"

printf 'Encrypted inventory written: %s\nSHA-256: %s\nExact counts: %s\n' \
  "$report_path" "$checksum" "$exact_counts"
