# Korgs

Each subfolder in this directory is a **hoop** — a small project or experiment shown on the site homepage.

## Layout

```
Korgs/
  README.md          ← this file
  Pong/              ← one hoop
    index.html       ← the hoop’s entry page
    meta.json        ← optional metadata
```

## `meta.json` (optional)

Place an optional `meta.json` in each hoop folder:

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
| `icon` | Emoji or short icon shown in the hoop row |
| `order` | Sort key ascending (lower first) |

If `meta.json` is missing or incomplete, the homepage falls back to the folder name as the title, a default hoop icon, no description, and sorts that hoop last.

The homepage discovers hoops by listing directories under `Korgs/` via the GitHub Contents API.
