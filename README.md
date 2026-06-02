# DoD Legislative Tracker

A lightweight federal legislative tracker focused on Department of Defense policy research.

The app is dependency-free at runtime and loads normalized records from `data/bills.json`. It
preloads DoD-focused policy lanes and bill-watch profiles around:

- Defense authorization and appropriations
- External company funding and contract flows
- Contractor cybersecurity and compliance rules
- Industrial-base investments
- Contractor bonus, award-fee, and incentive restrictions

## Included tracker fields

Each tracker card displays the fields requested for bill research:

- Status and legislative stage
- Sponsors and cosponsors
- Committee referral
- House and Senate vote counts
- Plain-English summary
- Policy areas and tags
- Funding / contract impact signal
- Regulation / bonus watch notes
- Next research action
- Official bill PDF link when Congress.gov text data is available

## UI features

- Congress-inspired dark theme using navy surfaces, maroon accents, and dark-gold action states
- Full-tracker search across bill numbers, titles, sponsors, committees, votes, amendments, tags, and
  DoD analyst notes
- Clear heading hierarchy for the main tracker, filters, legislation cards, and card subsections
- Whole-tracker CSV export from the sidebar
- Individual legislation CSV export from each bill card
- Bill PDF access from each bill card after official text URLs are synced

## Run locally

No install step is required for the web app.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

You can also host the files directly with any static web server.

## Sync official Congress.gov data

The tracker includes a small Node sync job for Congress.gov bill and amendment endpoints. It keeps
the local analyst policy-lens fields while replacing official fields such as title, latest action,
sponsors, cosponsors, committee referrals, summaries, votes, and amendments from API responses.

1. Add official identifiers to each record in `data/bills.json`:

   ```json
   "official": {
     "congress": 119,
     "billType": "hr",
     "billNumber": "1234"
   }
   ```

2. Run the sync with a Congress.gov API key:

   ```bash
   CONGRESS_GOV_API_KEY=your_key npm run sync:congress
   ```

3. Validate the local normalized data shape without calling the API:

   ```bash
   npm run validate
   ```

Useful sync options:

```bash
node scripts/sync-congress.mjs --help
node scripts/sync-congress.mjs --dry-run
node scripts/sync-congress.mjs --input data/bills.json --output data/bills.json
node scripts/sync-congress.mjs --amendment-limit 10
```

The sync job calls these Congress.gov endpoints for each configured bill:

- `/bill/{congress}/{billType}/{billNumber}`
- `/bill/{congress}/{billType}/{billNumber}/cosponsors`
- `/bill/{congress}/{billType}/{billNumber}/committees`
- `/bill/{congress}/{billType}/{billNumber}/summaries`
- `/bill/{congress}/{billType}/{billNumber}/actions`
- `/bill/{congress}/{billType}/{billNumber}/amendments`
- `/bill/{congress}/{billType}/{billNumber}/text`
- `/amendment/{congress}/{amendmentType}/{amendmentNumber}`

## Project structure

```text
index.html                 # Page structure and configured tracker fields
styles.css                 # Responsive dark UI styles
app.js                     # Data loading, filters, watched items, CSV export, briefing copy
data/bills.json            # Normalized tracker records and analyst policy-lens notes
scripts/sync-congress.mjs  # Congress.gov bill/amendment data sync
package.json               # Validation and sync commands
```

## Data notes

The current records are research seed profiles until official identifiers are added and the sync is
run. Before publishing analysis, verify synced bill text, sponsor rosters, vote counts, summaries,
and committee actions against official congressional sources.

The following policy-lens fields are intentionally preserved from analyst notes during sync:

- `policyAreas`
- `tags`
- `impactLenses`
- `fundingContractSignal`
- `regulationBonusWatch`
- `nextAction`
