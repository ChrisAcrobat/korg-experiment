#!/usr/bin/env python3
"""Mint a short-lived GitHub App installation token. Prints ONLY the token to stdout."""
import json, time, sys
from pathlib import Path

try:
    import jwt
except ImportError:
    sys.stderr.write("PyJWT required\n")
    sys.exit(1)

card = json.loads(Path("/home/box/agent-data/box-secrets.json").read_text())["card"]
app_id = str(card["GH_APP_ID"]).strip()
inst_id = str(card["GH_APP_INSTALLATION_ID"]).strip()
pem = str(card["GH_APP_PRIVATE_KEY"])
if "\\n" in pem and "-----BEGIN" in pem:
    pem = pem.replace("\\n", "\n")

now = int(time.time())
token_jwt = jwt.encode(
    {"iat": now - 60, "exp": now + 9 * 60, "iss": app_id},
    pem,
    algorithm="RS256",
)
if isinstance(token_jwt, bytes):
    token_jwt = token_jwt.decode()

import urllib.request
req = urllib.request.Request(
    f"https://api.github.com/app/installations/{inst_id}/access_tokens",
    data=b"{}",
    headers={
        "Authorization": f"Bearer {token_jwt}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "korg-experiment-bot",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
sys.stdout.write(data["token"])
