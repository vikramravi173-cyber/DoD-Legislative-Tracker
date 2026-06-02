const STAGES = ["Introduced", "Committee", "Floor vote", "Other chamber", "President"];
const WATCH_STORAGE_KEY = "dod-legislative-tracker-watched";
const DATA_URL = "data/bills.json";

let bills = [];
let dataMetadata = {};

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
  cards: document.querySelector("#bill-cards"),
  sourceNote: document.querySelector("[data-source-note]"),
  stats: {
    active: document.querySelector('[data-stat="active"]'),
    committees: document.querySelector('[data-stat="committees"]'),
    watched: document.querySelector('[data-stat="watched"]'),
    priority: document.querySelector('[data-stat="priority"]'),
  },
};

async function init() {
  bindEvents();
  await loadBillData();
  populateFilters();
  render();
}

async function loadBillData() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Unable to load ${DATA_URL}: ${response.status}`);
    }

    const payload = await response.json();
    dataMetadata = payload.metadata ?? {};
    bills = normalizeClientRecords(payload.records ?? []);
    updateSourceNote();
  } catch (error) {
    console.error(error);
    bills = [];
    dataMetadata = { source: "unavailable", syncStatus: "data-load-error" };
    updateSourceNote("Unable to load tracker data. Run this app from a local web server.");
  }
}

function populateFilters() {
  resetSelect(elements.statusFilter, "All statuses");
  resetSelect(elements.policyFilter, "All policy areas");

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

function renderBillCard(bill) {
  const watched = state.watched.has(bill.id);
  const priorityClass = bill.priority.toLowerCase();

  return `
    <article class="bill-card">
      <div class="card-top">
        <div>
          <p class="bill-id">${escapeHtml(bill.billNumber)} · ${escapeHtml(bill.congress)}</p>
          <h3 class="bill-title">${escapeHtml(bill.title)}</h3>
          <p class="summary">${escapeHtml(bill.chamber)} · ${escapeHtml(bill.status)}</p>
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

        ${renderOfficialMeta(bill)}

        <dl class="info-grid">
          ${renderInfoItem("Sponsor", formatPeople(bill.sponsors, "Official sponsor data pending"))}
          ${renderInfoItem("Cosponsors", formatCosponsors(bill))}
          ${renderInfoItem("Committee referral", formatList(bill.committeeReferral, "Official committee referral pending"))}
          ${renderInfoItem("Funding / contract signal", bill.fundingContractSignal)}
          ${renderInfoItem("Regulation / bonus watch", bill.regulationBonusWatch)}
          ${renderInfoItem("Next research action", bill.nextAction)}
        </dl>

        <div>
          <h3>Vote counts</h3>
          <div class="vote-grid">
            ${renderVoteBox("House", bill.voteCounts.house)}
            ${renderVoteBox("Senate", bill.voteCounts.senate)}
          </div>
        </div>

        ${renderAmendments(bill.amendments)}

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

function renderOfficialMeta(bill) {
  const status = bill.official?.syncStatus ?? "unknown";
  const label = status === "synced" ? "Congress.gov synced" : status.replaceAll("-", " ");
  const sourceUrl = bill.official?.sourceUrl;

  return `
    <div class="official-meta">
      <span>${escapeHtml(label)}</span>
      ${bill.official?.updatedAt ? `<span>Updated ${escapeHtml(formatDate(bill.official.updatedAt))}</span>` : ""}
      ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">Official record</a>` : ""}
    </div>
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

function renderVoteBox(label, vote) {
  const voteText = formatVote(vote);
  const details = [vote?.result, vote?.date ? formatDate(vote.date) : ""].filter(Boolean).join(" · ");

  return `
    <div class="vote-box">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(voteText)}</strong>
      ${details ? `<small>${escapeHtml(details)}</small>` : ""}
      ${vote?.sourceUrl ? `<a href="${escapeHtml(vote.sourceUrl)}" target="_blank" rel="noreferrer">Vote source</a>` : ""}
    </div>
  `;
}

function renderAmendments(amendments) {
  if (!amendments.length) {
    return "";
  }

  return `
    <div>
      <h3>Tracked amendments</h3>
      <div class="amendment-list">
        ${amendments
          .slice(0, 4)
          .map(
            (amendment) => `
              <article>
                <strong>${escapeHtml(amendment.number || "Amendment")}</strong>
                <p>${escapeHtml(amendment.purpose || amendment.title || amendment.status || "No official summary available")}</p>
                ${amendment.status ? `<small>${escapeHtml(amendment.status)}</small>` : ""}
              </article>
            `,
          )
          .join("")}
      </div>
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
    formatPeople(bill.sponsors),
    formatCosponsors(bill),
    formatList(bill.committeeReferral),
    bill.plainSummary,
    bill.fundingContractSignal,
    bill.regulationBonusWatch,
    bill.nextAction,
    bill.official?.latestAction,
    ...bill.policyAreas,
    ...bill.tags,
    ...bill.amendments.flatMap((amendment) => [amendment.number, amendment.title, amendment.purpose, amendment.status]),
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
  const committeeNames = new Set(bills.flatMap((bill) => bill.committeeReferral).filter(Boolean));

  elements.stats.active.textContent = bills.length;
  elements.stats.committees.textContent = committeeNames.size;
  elements.stats.watched.textContent = state.watched.size;
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
    official_congress: bill.official?.congress ?? "",
    official_bill_type: bill.official?.billType ?? "",
    official_bill_number: bill.official?.billNumber ?? "",
    title: bill.title,
    status: bill.status,
    sponsor: formatPeople(bill.sponsors),
    cosponsors: formatCosponsors(bill),
    committee_referral: formatList(bill.committeeReferral),
    house_votes: formatVote(bill.voteCounts.house),
    senate_votes: formatVote(bill.voteCounts.senate),
    plain_english_summary: bill.plainSummary,
    policy_areas: bill.policyAreas.join("; "),
    tags: bill.tags.join("; "),
    impact_lenses: bill.impactLenses.join("; "),
    amendments: bill.amendments.map((amendment) => amendment.number).join("; "),
    next_action: bill.nextAction,
    sync_status: bill.official?.syncStatus ?? "",
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

  const briefing = `DoD legislative tracker briefing

Scope: Federal congressional policy research for Department of Defense funding, contracts, regulations, and contractor incentives.
Data source: ${dataMetadata.source ?? "local"} (${dataMetadata.syncStatus ?? "unknown"})
Current high-priority watches:
${highPriority}

Recommended next step: add Congress.gov identifiers to data/bills.json and run npm run sync:congress with CONGRESS_GOV_API_KEY to refresh official cosponsors, votes, summaries, actions, and amendments.`;

  try {
    await navigator.clipboard.writeText(briefing);
    notify("Briefing copied to clipboard.");
  } catch {
    notify("Briefing ready to copy:\n\n" + briefing);
  }
}

function updateSourceNote(message) {
  if (!elements.sourceNote) {
    return;
  }

  if (message) {
    elements.sourceNote.textContent = message;
    return;
  }

  const source = dataMetadata.source === "congress.gov" ? "Congress.gov sync" : "Seed research data";
  const status = dataMetadata.syncStatus ? ` · ${dataMetadata.syncStatus}` : "";
  const generated = dataMetadata.generatedAt ? ` · Updated ${formatDate(dataMetadata.generatedAt)}` : "";

  elements.sourceNote.textContent = `${source}${status}${generated}. Policy-lens fields remain analyst notes.`;
}

function normalizeClientRecords(records) {
  return records.map((record) => ({
    ...record,
    sponsors: normalizePeople(record.sponsors),
    cosponsors: normalizePeople(record.cosponsors),
    committeeReferral: normalizeStringList(record.committeeReferral),
    policyAreas: normalizeStringList(record.policyAreas),
    tags: normalizeStringList(record.tags),
    impactLenses: normalizeStringList(record.impactLenses),
    amendments: (record.amendments ?? []).map((amendment) => ({
      number: amendment.number ?? "",
      title: amendment.title ?? "",
      purpose: amendment.purpose ?? "",
      status: amendment.status ?? "",
      latestActionDate: amendment.latestActionDate ?? "",
      sourceUrl: amendment.sourceUrl ?? "",
    })),
    voteCounts: {
      house: normalizeVote(record.voteCounts?.house, "Official House vote pending"),
      senate: normalizeVote(record.voteCounts?.senate, "Official Senate vote pending"),
    },
  }));
}

function normalizePeople(people) {
  return normalizeArray(people).map((person) => {
    if (typeof person === "string") {
      return { fullName: person, party: "", state: "" };
    }

    return {
      fullName: person.fullName ?? person.name ?? "",
      party: person.party ?? "",
      state: person.state ?? "",
    };
  });
}

function normalizeVote(vote, defaultLabel) {
  if (typeof vote === "string") {
    return {
      label: vote,
      yea: null,
      nay: null,
      result: "",
      date: "",
      sourceUrl: "",
    };
  }

  return {
    label: vote?.label ?? defaultLabel,
    yea: vote?.yea ?? null,
    nay: vote?.nay ?? null,
    result: vote?.result ?? "",
    date: vote?.date ?? "",
    sourceUrl: vote?.sourceUrl ?? "",
  };
}

function formatPeople(people, fallback = "Official data pending") {
  const names = normalizePeople(people)
    .map((person) => formatPerson(person))
    .filter(Boolean);

  return names.length ? names.join("; ") : fallback;
}

function formatPerson(person) {
  const meta = [person.party, person.state].filter(Boolean).join("-");
  return meta ? `${person.fullName} (${meta})` : person.fullName;
}

function formatCosponsors(bill) {
  if (bill.cosponsors.length) {
    const visible = bill.cosponsors.slice(0, 5).map(formatPerson).join("; ");
    const hiddenCount = Math.max(0, bill.cosponsors.length - 5);
    const officialCount =
      bill.cosponsorCount !== null && bill.cosponsorCount !== undefined ? `Official count: ${bill.cosponsorCount}` : "";

    return [visible, hiddenCount ? `+${hiddenCount} more` : "", officialCount].filter(Boolean).join("; ");
  }

  if (bill.cosponsorCount !== null && bill.cosponsorCount !== undefined) {
    return `Official count: ${bill.cosponsorCount}`;
  }

  return "Official cosponsor data pending";
}

function formatVote(vote) {
  if (vote?.yea !== null && vote?.nay !== null && vote?.yea !== undefined && vote?.nay !== undefined) {
    return `${vote.yea}-${vote.nay}`;
  }

  return vote?.label ?? "Official vote pending";
}

function formatList(items, fallback = "Official data pending") {
  const values = normalizeStringList(items);
  return values.length ? values.join("; ") : fallback;
}

function normalizeStringList(value) {
  return normalizeArray(value)
    .flatMap((item) => (typeof item === "string" ? item.split(";") : item))
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null || value === "") {
    return [];
  }

  return [value];
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

function resetSelect(select, defaultLabel) {
  select.innerHTML = "";
  select.appendChild(createOption("all", defaultLabel));
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

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
