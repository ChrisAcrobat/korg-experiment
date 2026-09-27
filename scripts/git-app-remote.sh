#!/usr/bin/env bash
# Run a git command that talks to origin, authenticated as the GitHub App.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="${VENV_PY:-/workspace/.venv-ghapp/bin/python}"
TOKEN="$("$PY" "$ROOT/scripts/mint-installation-token.py")"
BASIC="$("$PY" -c 'import os,base64,sys; print(base64.b64encode(f"x-access-token:{os.environ[\"T\"]}".encode()).decode())' )" 2>/dev/null || true
# Compute BASIC without putting token in process list via env
BASIC="$(T="$TOKEN" "$PY" -c 'import os,base64; print(base64.b64encode(("x-access-token:" + os.environ["T"]).encode()).decode())')"
git -C "$ROOT" -c "http.extraHeader=Authorization: Basic ${BASIC}" "$@"
