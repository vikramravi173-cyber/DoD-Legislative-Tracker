# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

This repository is a **dependency-free static SPA** (DoD Legislative Tracker): `index.html`, `styles.css`, and `app.js` at the repo root. There is no `package.json`, Docker stack, database, or backend. Bill data is seeded in `app.js`; watch state persists in the browser via `localStorage` (`dod-legislative-tracker-watched`).

### Running the app

From the repository root:

```bash
python3 -m http.server 8000
```

Open http://127.0.0.1:8000 (or http://localhost:8000). Any static file server serving the repo root is equivalent.

Use a **tmux** session for long-running dev servers (see Cloud Agent shell rules). Example session name: `dod-tracker-server`.

### Lint / test / build

There are **no** configured linters, unit tests, or build steps in this repo. Validation is manual/browser-based: load the UI, exercise filters, watch toggle, **Copy briefing**, and **Export CSV**.

### Hello-world smoke check

1. Confirm six bill cards render under the tracker section.
2. Search for `NDAA` (expect fewer visible cards).
3. Toggle **Watch** on one card (hero “watched” count should increment).
4. **Copy briefing** should show a success alert.
5. **Export CSV** should download `dod-legislative-tracker.csv`.

### Services

| Service | Required? | Port | Notes |
|--------|-----------|------|-------|
| Static HTTP server (Python `http.server`) | Yes | 8000 (README default) | Only runtime dependency |
| Backend / DB / Node | No | — | Not in repo |

### Update script

No dependency install is required on VM startup. The registered update script is a no-op (`true`).
