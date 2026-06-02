const STAGES = ["Introduced", "Committee", "Floor vote", "Other chamber", "President"];
const WATCH_STORAGE_KEY = "dod-legislative-tracker-watched";
const BILLS_DATA_URL = "data/bills.json";

let bills = [];
let dataMeta = null;

const state = {
  search: "",
  status: "all",
  policy: "all",
  impact: "all",
  watched: new Set(loadWatched()),
};

const elements = {
  search: document.querySelector("#search"),
  statusFilter: document.querySelector("#status-filter"),
  policyFilter: document.querySelector("#policy-filter"),
  impactFilter: document.querySelector("#impact-filter"),
  resultCount: document.querySelector("#result-count"),
  sourceNote: document.querySelector("#source-note"),
  cards: document.querySelector("#bill-cards"),
  stats: {
    active: document.querySelector('[data-stat="active"]'),
    committees: document.querySelector('[data-stat="committees"]'),
    priority: document.querySelector('[data-stat="priority"]'),
  },
};

async function init() {
  showLoading();
  try {
    await loadBills();
    populateFilters();
    bindEvents();
    render();
  } catch (error) {
    showLoadError(error);
  }
}

async function loadBills() {
  const response = await fetch(BILLS_DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${BILLS_DATA_URL} (${response.status})`);
  }

  const payload = await response.json();
  if (Array.isArray(payload)) {
    bills = payload;
    dataMeta = null;
    return;
  }

  bills = payload.bills ?? [];
  dataMeta = payload.meta ?? null;

  if (!bills.length) {
    throw new Error("No bills found in data file.");
  }
}

function showLoading() {
  elements.cards.innerHTML = `<div class="empty">Loading tracker data…</div>`;
  if (elements.sourceNote) {
    elements.sourceNote.textContent = "Loading data/bills.json…";
  }
}

function showLoadError(error) {
  elements.cards.innerHTML = `
    <div class="empty">
      Could not load tracker data. Run <code>python3 scripts/sync_congress.py</code> and serve the site with a local web server.
      <br /><br />
      ${escapeHtml(error.message)}
    </div>
  `;
  if (elements.sourceNote) {
    elements.sourceNote.textContent = "Data load failed.";
  }
}

function populateFilters() {
  uniqueValues(bills.map((bill) => bill.status)).forEach((status) => {
    elements.statusFilter.appendChild(createOption(status, status));
  });

  uniqueValues(bills.flatMap((bill) => bill.policyAreas)).forEach((policy) => {
    elements.policyFilter.appendChild(createOption(policy, policy));
  });
}

function bindEvents() {
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    render();
  });

  elements.statusFilter.addEventListener("change", (event) => {
    state.status = event.target.value;
    render();
  });

  elements.policyFilter.addEventListener("change", (event) => {
    state.policy = event.target.value;
    render();
  });

  elements.impactFilter.addEventListener("change", (event) => {
    state.impact = event.target.value;
    render();
  });

  document.querySelector('[data-action="reset-filters"]').addEventListener("click", resetFilters);
  document.querySelector('[data-action="export-csv"]').addEventListener("click", exportCsv);
  document.querySelector('[data-action="copy-briefing"]').addEventListener("click", copyBriefing);
}

function render() {
  updateSourceNote();

  const filteredBills = bills.filter(matchesFilters);

  elements.resultCount.textContent = pluralize(filteredBills.length, "item");
  elements.cards.innerHTML = filteredBills.length
    ? filteredBills.map(renderBillCard).join("")
    : `<div class="empty">No tracker items match the selected filters.</div>`;

  document.querySelectorAll("[data-watch-id]").forEach((button) => {
    button.addEventListener("click", () => toggleWatched(button.dataset.watchId));
  });

  updateStats(filteredBills);
}

function updateSourceNote() {
  if (!elements.sourceNote) {
    return;
  }

  if (!dataMeta) {
    elements.sourceNote.textContent = `${bills.length} tracker items loaded from data/bills.json.`;
    return;
  }

  const parts = [
    `${dataMeta.totalCount ?? bills.length} items`,
    `${dataMeta.seedCount ?? 0} curated watches`,
  ];

  if (dataMeta.officialCount) {
    parts.push(`${dataMeta.officialCount} from Congress.gov`);
  }

  if (dataMeta.syncedFromCongressGov && dataMeta.generatedAt) {
    const synced = new Date(dataMeta.generatedAt);
    parts.push(`synced ${synced.toLocaleString()}`);
  } else {
    parts.push("run sync for live bills");
  }

  elements.sourceNote.textContent = parts.join(" · ");
}

function renderBillCard(bill) {
  const watched = state.watched.has(bill.id);
  const priorityClass = bill.priority.toLowerCase();
  const sourceLabel = bill.source === "congress.gov" ? "Congress.gov" : "Research watch";
  const officialLink = bill.congressGovUrl
    ? `<p class="official-link"><a href="${escapeHtml(bill.congressGovUrl)}" target="_blank" rel="noopener noreferrer">View on Congress.gov</a></p>`
    : "";

  return `
    <article class="bill-card">
      <div class="card-top">
        <div>
          <p class="bill-id">${escapeHtml(bill.billNumber)} · ${escapeHtml(bill.congress)} · ${escapeHtml(sourceLabel)}</p>
          <h3 class="bill-title">${escapeHtml(bill.title)}</h3>
          <p class="summary">${escapeHtml(bill.chamber)} · ${escapeHtml(bill.status)}</p>
          ${officialLink}
        </div>
        <button class="watch-button ${watched ? "active" : ""}" type="button" data-watch-id="${escapeHtml(
          bill.id,
        )}">
          ${watched ? "Watching" : "Watch"}
        </button>
      </div>

      <div class="card-body">
        <div class="status-row">
          <div>
            <h3>Status &amp; stage</h3>
            ${renderStageTrack(bill.stageIndex)}
          </div>
          <span class="pill ${priorityClass}">${escapeHtml(bill.priority)} priority</span>
        </div>

        <p class="summary">${escapeHtml(bill.plainSummary)}</p>

        <dl class="info-grid">
          ${renderInfoItem("Sponsor", bill.sponsor)}
          ${renderInfoItem("Cosponsors", bill.cosponsors)}
          ${renderInfoItem("Committee referral", bill.committeeReferral)}
          ${renderInfoItem("Funding / contract signal", bill.fundingContractSignal)}
          ${renderInfoItem("Regulation / bonus watch", bill.regulationBonusWatch)}
          ${renderInfoItem("Next research action", bill.nextAction)}
        </dl>

        <div>
          <h3>Vote counts</h3>
          <div class="vote-grid">
            <div class="vote-box">
              <span>House</span>
              <strong>${escapeHtml(bill.voteCounts.house)}</strong>
            </div>
            <div class="vote-box">
              <span>Senate</span>
              <strong>${escapeHtml(bill.voteCounts.senate)}</strong>
            </div>
          </div>
        </div>

        <div>
          <h3>Policy area / tags</h3>
          <div class="tags">
            ${[...bill.policyAreas, ...bill.tags].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderStageTrack(stageIndex) {
  return `
    <ol class="stage-track" aria-label="Legislative stage">
      ${STAGES.map((stage, index) => {
        const stateClass = index < stageIndex ? "complete" : index === stageIndex ? "current" : "";
        return `<li class="${stateClass}">${escapeHtml(stage)}</li>`;
      }).join("")}
    </ol>
  `;
}

function renderInfoItem(label, value) {
  return `
    <div class="info-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function matchesFilters(bill) {
  const searchableText = [
    bill.billNumber,
    bill.title,
    bill.chamber,
    bill.congress,
    bill.status,
    bill.priority,
    bill.sponsor,
    bill.cosponsors,
    bill.committeeReferral,
    bill.plainSummary,
    bill.fundingContractSignal,
    bill.regulationBonusWatch,
    bill.nextAction,
    bill.source,
    ...bill.policyAreas,
    ...bill.tags,
  ]
    .join(" ")
    .toLowerCase();

  return (
    (!state.search || searchableText.includes(state.search)) &&
    (state.status === "all" || bill.status === state.status) &&
    (state.policy === "all" || bill.policyAreas.includes(state.policy)) &&
    (state.impact === "all" || bill.impactLenses.includes(state.impact))
  );
}

function updateStats(filteredBills) {
  const committeeNames = new Set(
    bills.flatMap((bill) =>
      bill.committeeReferral
        .split(";")
        .map((committee) => committee.trim())
        .filter(Boolean),
    ),
  );

  elements.stats.active.textContent = bills.length;
  elements.stats.committees.textContent = committeeNames.size;
  elements.stats.priority.textContent = filteredBills.filter((bill) => bill.priority === "High").length;
}

function toggleWatched(id) {
  if (state.watched.has(id)) {
    state.watched.delete(id);
  } else {
    state.watched.add(id);
  }

  saveWatched();
  render();
}

function resetFilters() {
  state.search = "";
  state.status = "all";
  state.policy = "all";
  state.impact = "all";

  elements.search.value = "";
  elements.statusFilter.value = "all";
  elements.policyFilter.value = "all";
  elements.impactFilter.value = "all";

  render();
}

function exportCsv() {
  const rows = bills.filter(matchesFilters).map((bill) => ({
    bill_number: bill.billNumber,
    title: bill.title,
    source: bill.source ?? "",
    congress_gov_url: bill.congressGovUrl ?? "",
    status: bill.status,
    sponsor: bill.sponsor,
    cosponsors: bill.cosponsors,
    committee_referral: bill.committeeReferral,
    house_votes: bill.voteCounts.house,
    senate_votes: bill.voteCounts.senate,
    plain_english_summary: bill.plainSummary,
    policy_areas: bill.policyAreas.join("; "),
    tags: bill.tags.join("; "),
    impact_lenses: bill.impactLenses.join("; "),
    next_action: bill.nextAction,
  }));

  const headers = Object.keys(rows[0] ?? { message: "No matching rows" });
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "dod-legislative-tracker.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyBriefing() {
  const highPriority = bills
    .filter((bill) => bill.priority === "High")
    .map((bill) => `- ${bill.title}: ${bill.status}; next action: ${bill.nextAction}`)
    .join("\n");

  const syncLine = dataMeta?.syncedFromCongressGov
    ? `Congress.gov sync: ${dataMeta.officialCount} official bills (last run ${dataMeta.generatedAt}).`
    : "Congress.gov sync: not run yet — seeds only. Set CONGRESS_API_KEY and run scripts/sync_congress.py.";

  const briefing = `DoD legislative tracker briefing

Scope: Federal congressional policy research for Department of Defense funding, contracts, regulations, and contractor incentives.
${syncLine}
Current high-priority watches:
${highPriority}

Recommended next step: validate bill text, votes, and sponsor rosters on Congress.gov before publication.`;

  try {
    await navigator.clipboard.writeText(briefing);
    notify("Briefing copied to clipboard.");
  } catch {
    notify("Briefing ready to copy:\n\n" + briefing);
  }
}

function notify(message) {
  window.alert(message);
}

function loadWatched() {
  try {
    return JSON.parse(localStorage.getItem(WATCH_STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveWatched() {
  localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify([...state.watched]));
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function uniqueValues(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function pluralize(count, singular) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
