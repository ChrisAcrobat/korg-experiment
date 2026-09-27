# Commit identity

AI-assisted commits in this repository use the GitHub App bot identity:

- **Name:** `korg-experiment[bot]`
- **Email:** `{APP_ID}+korg-experiment[bot]@users.noreply.github.com`

Local clone setup (after a fresh clone):

```bash
git config user.name "korg-experiment[bot]"
git config user.email "{APP_ID}+korg-experiment[bot]@users.noreply.github.com"
```

Push with the App installation token (not a personal PAT):

```bash
./scripts/git-app-remote.sh push origin main
```

`scripts/mint-installation-token.py` mints a short-lived token from the App ID,
Installation ID, and private key stored in the box secrets store.
