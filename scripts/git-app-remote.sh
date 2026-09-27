#!/usr/bin/env bash
# Run a git command that talks to origin, authenticated as the GitHub App.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${VENV_PY:-/workspace/.venv-ghapp/bin/python}"
TOKEN="$("$PY" "$ROOT/scripts/mint-installation-token.py")"
BASIC="$(T="$TOKEN" "$PY" -c 'import os,base64; print(base64.b64encode(("x-access-token:" + os.environ["T"]).encode()).decode())')"
git -C "$ROOT" -c "http.extraHeader=Authorization: Basic ${BASIC}" "$@"
