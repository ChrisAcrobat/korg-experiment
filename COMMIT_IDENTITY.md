# Commit identity

AI-assisted commits in this repository use the GitHub App bot identity:

- **Name:** `korg-experiment`
- **Email:** `{BOT_USER_ID}+korg-experiment[bot]@users.noreply.github.com`

`BOT_USER_ID` is the numeric id of the `korg-experiment[bot]` GitHub user
(not the GitHub App ID). That pairing is what makes the purple bot badge appear.
The display name is `korg-experiment` without a `[bot]` suffix.

Push with the App installation token (not a personal PAT):

```bash
./scripts/git-app-remote.sh push origin main
```

`scripts/mint-installation-token.py` mints a short-lived token from the App ID,
Installation ID, and private key stored in the box secrets store.
