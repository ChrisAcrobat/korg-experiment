# Commit identity

AI-assisted commits in this repository should use the bot identity below
(not a personal GitHub account):

```
git config user.name "korg-experiment[bot]"
git config user.email "korg-experiment[bot]@users.noreply.github.com"
```

Notes:

- This sets the Git author/committer **name** shown on commits.
- A true GitHub **bot badge** requires a GitHub App; with a personal access
  token the push actor may still be the human who owns the token.
- Re-apply these settings after a fresh clone (`git config --local ...`).
