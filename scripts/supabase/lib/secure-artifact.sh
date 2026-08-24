#!/usr/bin/env bash

# Shared safety primitives for migration artifacts. Callers must set repo_root,
# use `set -euo pipefail`, and keep `umask 077`. This module never accepts an
# output path inside the repository and never writes a plaintext final artifact.

supabase_secure_output_dir() {
  local requested="$1"
  local parent name parent_physical candidate resolved

  if [[ "$requested" != /* ]]; then
    printf '%s\n' 'ERROR: output directory must be an absolute path outside the repository.' >&2
    return 2
  fi

  if [[ -e "$requested" ]]; then
    if [[ ! -d "$requested" || -L "$requested" ]]; then
      printf '%s\n' 'ERROR: output directory must be a real directory, not a file or symlink.' >&2
      return 2
    fi
    resolved="$(cd "$requested" && pwd -P)"
  else
    parent="$(dirname "$requested")"
    name="$(basename "$requested")"
    if [[ "$name" == '.' || "$name" == '..' || ! -d "$parent" ]]; then
      printf '%s\n' 'ERROR: output parent must already exist.' >&2
      return 2
    fi
    parent_physical="$(cd "$parent" && pwd -P)"
    candidate="${parent_physical}/${name}"
    case "${candidate}/" in
      "${repo_root}/"*)
        printf '%s\n' 'ERROR: output inside the repository is forbidden.' >&2
        return 2
        ;;
    esac
    mkdir -- "$candidate"
    resolved="$(cd "$candidate" && pwd -P)"
  fi

  case "${resolved}/" in
    "${repo_root}/"*)
      printf '%s\n' 'ERROR: output inside the repository is forbidden.' >&2
      return 2
      ;;
  esac

  printf '%s\n' "$resolved"
}

supabase_encryption_extension() {
  case "${BACKUP_ENCRYPTION:-}" in
    age) printf '%s\n' 'age' ;;
    gpg) printf '%s\n' 'gpg' ;;
    *)
      printf '%s\n' 'ERROR: BACKUP_ENCRYPTION must be explicitly set to age or gpg.' >&2
      return 2
      ;;
  esac
}

supabase_require_encryption() {
  if [[ -z "${BACKUP_RECIPIENT:-}" ]]; then
    printf '%s\n' 'ERROR: BACKUP_RECIPIENT is required.' >&2
    return 2
  fi

  case "${BACKUP_ENCRYPTION:-}" in
    age)
      command -v age >/dev/null 2>&1 || {
        printf '%s\n' 'ERROR: age is required for BACKUP_ENCRYPTION=age.' >&2
        return 2
      }
      ;;
    gpg)
      command -v gpg >/dev/null 2>&1 || {
        printf '%s\n' 'ERROR: gpg is required for BACKUP_ENCRYPTION=gpg.' >&2
        return 2
      }
      ;;
    *)
      supabase_encryption_extension >/dev/null
      ;;
  esac
}

supabase_encrypt_stream() {
  local destination="$1"
  local partial="${destination}.partial.$$"

  if [[ -e "$destination" || -e "$partial" ]]; then
    printf 'ERROR: refusing to overwrite encrypted artifact: %s\n' "$destination" >&2
    return 2
  fi

  if [[ "${BACKUP_ENCRYPTION}" == 'age' ]]; then
    if ! age --recipient "$BACKUP_RECIPIENT" --output "$partial"; then
      rm -f -- "$partial"
      return 1
    fi
  else
    if ! gpg --batch --yes --trust-model always \
      --recipient "$BACKUP_RECIPIENT" --output "$partial" --encrypt; then
      rm -f -- "$partial"
      return 1
    fi
  fi

  chmod 600 "$partial"
  mv -- "$partial" "$destination"
}

supabase_sha256() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  else
    shasum -a 256 "$file" | awk '{print $1}'
  fi
}
