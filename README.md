# DoD Legislative Tracker

A lightweight federal legislative tracker focused on Department of Defense policy research.

The first version is a dependency-free static web app that preloads DoD-focused policy lanes and
bill-watch profiles around:

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

## Run locally

No install step is required.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

You can also host the files directly with any static web server.

## Project structure

```text
index.html   # Page structure and configured tracker fields
styles.css   # Responsive dark UI styles
app.js       # Seed data, filters, watched items, CSV export, briefing copy
```

## Data notes

The current records are research seed profiles, not a live official congressional feed. Before
publishing analysis, sync bill identifiers, sponsor rosters, vote counts, summaries, and committee
actions against official sources such as Congress.gov, committee pages, or House/Senate vote records.

Recommended next integration:

1. Add a small data sync job for Congress.gov bill and amendment endpoints.
2. Store normalized bill records with the fields already represented in `app.js`.
3. Replace placeholder vote and cosponsor values with official API responses.
4. Preserve the policy-lens fields for analyst notes on DoD funding, contractor exposure, and
   regulation or incentive impacts.
