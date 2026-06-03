# DoD Legislative Tracker

A lightweight federal legislative tracker focused on Department of Defense policy research.

The app loads **`data/bills.json`**, which merges:

- **Curated watch profiles** (`data/bills.seed.json`) — NDAA, appropriations, CR, supplemental, MilCon, NNSA, DPA, FMS, and related lanes
- **Official bills** from the [Congress.gov API v3](https://www.loc.gov/apis/additional-apis/congress-dot-gov-api/) when you run the sync script with an API key

## Included tracker fields

Each tracker card displays:

- Status and legislative stage
- Sponsors and cosponsors
- Committee referral
- House and Senate vote counts (or pointers to Congress.gov)
- Plain-English summary
- Policy areas and tags
- Funding / contract impact signal
- Regulation / bonus watch notes
- Next research action
- Congress.gov link (for synced official bills)

## Run locally

No install step is required for the UI. You **must** use a local web server (not `file://`) so the app can fetch `data/bills.json`.

```bash
# 1. Build or refresh data (seeds only without an API key)
python3 scripts/sync_congress.py

# 2. Serve the site
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Congress.gov sync

1. Copy `.env.example` to `.env` and add your key from [api.data.gov signup](https://api.data.gov/signup/).
2. Run:

```bash
export $(grep -v '^#' .env | xargs)   # or: source .env if your shell supports it
python3 scripts/sync_congress.py
```

Options:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CONGRESS_API_KEY` | — | Required for live API pull |
| `CONGRESS_NUMBER` | `119` | Congress session |
| `SYNC_MAX_BILLS` | `35` | Max defense-related bills to enrich |
| `SYNC_MAX_PAGES` | `6` | Bill list pages to scan (250 bills/page) |

The sync script filters bills whose titles match defense funding and policy keywords, fetches summaries, sponsors, cosponsors, and committees, then writes **`data/bills.json`**. Curated seeds are always preserved.

A GitHub Actions workflow (`.github/workflows/sync-congress.yml`) can refresh this data daily. Add `CONGRESS_API_KEY` as a repository secret under **Settings → Secrets and variables → Actions** to enable it.

## Deploy to Vercel

Every push to `main` runs `.github/workflows/deploy-vercel.yml` and updates production.

**One-time setup**

1. Create a token at [vercel.com/account/tokens](https://vercel.com/account/tokens).
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `VERCEL_TOKEN`, value: your token.

**Publish now** (from your machine):

```bash
git push origin main
```

Or link the repo in the [Vercel dashboard](https://vercel.com/new) for automatic deploys without the Actions secret.

## Auto-sync to GitHub

This repo can push changes to GitHub automatically so Vercel (and Actions) stay up to date.

**Enable once** (in the project folder):

```bash
chmod +x scripts/setup-auto-sync.sh .cursor/hooks/sync-github.sh
./scripts/setup-auto-sync.sh
```

**What runs automatically**

| Trigger | Behavior |
|---------|----------|
| End of Cursor agent session | Commits workspace changes (except `.env`), pushes `main` to GitHub |
| `git commit` on `main` | Pushes to `origin/main` |
| Push to `main` | Vercel production deploy (`.github/workflows/deploy-vercel.yml`) |
| Daily schedule | Congress.gov data sync commits `data/bills.json` (needs `CONGRESS_API_KEY`) |

**Push pending commits now**

```bash
./scripts/push-to-github.sh
```

First-time auth (pick one): `gh auth login` then re-run the script, or add `GITHUB_TOKEN` to `.env` (see `.env.example`). The script tries GitHub CLI, token, SSH, then HTTPS.

You need GitHub authentication configured (`gh auth login`, SSH key, or HTTPS credential helper).

## Project structure

```text
index.html              # Page structure
styles.css              # UI styles
fuzzy-search.js         # Fuzzy search scoring
app.js                  # Loads data/bills.json, filters, export
data/
  bills.seed.json       # Curated DoD watch profiles (edit these)
  bills.json            # Generated merged dataset (commit after sync)
scripts/
  sync_congress.py      # Congress.gov merge job (stdlib only)
.env.example            # API key template (copy to .env)
```

## Data notes

- Validate live bill text, votes, and sponsor rosters on [Congress.gov](https://www.congress.gov) before publication.
- Auto-synced bills include analyst placeholder fields for `fundingContractSignal` and `regulationBonusWatch`; refine those in `bills.seed.json` or a future overrides file.
- Opening `index.html` directly in the browser will fail to load data; always use `python3 -m http.server` or another static host.
