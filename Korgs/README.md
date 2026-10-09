# Korgs

Each subfolder in this directory is a **basket** — a small project or experiment shown on the site homepage.

## Layout

```
Korgs/
  README.md          ← this file
  Pong/              ← one basket
    index.html       ← the basket’s entry page
    meta.json        ← optional metadata
```

## `meta.json` (optional)

Place an optional `meta.json` in each basket folder:

```json
{
  "title": "Pong",
  "description": "A simple paddle game",
  "icon": "🏀",
  "order": 1
}
```

| Field | Meaning |
| --- | --- |
| `title` | Display name on the homepage |
| `description` | Short blurb under the title |
| `icon` | Emoji or short icon shown in the basket row |
| `order` | Sort key ascending (lower first) |

If `meta.json` is missing or incomplete, the homepage falls back to the folder name as the title, a default basket icon, no description, and sorts that basket last.

The homepage discovers baskets by listing directories under `Korgs/` via the GitHub Contents API.

## Discovery fallback

The homepage lists folders via the GitHub Contents API. If that is rate-limited, it falls back to `baskets.json` (an array of folder names) and loads each basket’s `meta.json` over HTTPS from this site.
When you add a basket folder, also add its name to `baskets.json`.
