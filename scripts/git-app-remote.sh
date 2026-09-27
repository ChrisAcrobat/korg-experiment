#!/usr/bin/env bash
# Run a git command that talks to origin, authenticated as the GitHub App.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${VENV_PY:-/workspace/.venv-ghapp/bin/python}"
export GIT_APP_TOKEN="$("$PY" "$ROOT/scripts/mint-installation-token.py")"
git -C "$ROOT" -c credential.helper='!f() { echo "username=x-access-token"; echo "password=$GIT_APP_TOKEN"; }; f' "$@"
unset GIT_APP_TOKEN
