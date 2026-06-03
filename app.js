const STAGES = ["Introduced", "Committee", "Floor vote", "Other chamber", "President"];
const BILLS_DATA_URLS = [
  new URL("data/bills.json", window.location.href).href,
  new URL("./data/bills.json", window.location.href).href,
  new URL("data/bills.seed.json", window.location.href).href,
];
const PAGE_SIZE_DEFAULT = 25;

const STATUS_FILTERS = [
  { value: "introduced", label: "Introduced", matches: ["Introduced"] },
  { value: "in-committee", label: "In committee", matches: ["In committee", "Committee development"] },
  { value: "reported", label: "Reported from committee", matches: ["Reported from committee"] },
  { value: "calendar", label: "On legislative calendar", matches: ["On legislative calendar"] },
  { value: "floor", label: "Floor / procedural", matches: ["Procedural — floor motion"] },
  { value: "enacted", label: "Enacted or agreed", matches: ["Agreed / enacted"] },
  {
    value: "research-watch",
    label: "Curated research watches",
    matches: [
      "Appropriations review",
      "Contingency watch",
      "Policy and funding watch",
      "Packaging watch",
      "Rulemaking and oversight",
      "Oversight concept watch",
      "Funding watch",
      "Funding proposal watch",
    ],
  },
];

const GENERIC_PLACEHOLDERS = new Set([
  "See Congress.gov",
  "See Congress.gov committee list",
  "See Congress.gov actions for floor votes",
  "Validate live text, votes, and sponsors on Congress.gov before publication.",
  "Review bill text and report language for funding, contract, and incentive signals.",
  "Scan amendments and report language for regulatory or bonus provisions affecting contractors.",
]);

let bills = [];
let dataMeta = null;
let expandedBillId = null;

const state = {
  search: "",
  searchScope: "all",
  status: "all",
  policy: "all",
  impact: "all",
  page: 1,
  pageSize: PAGE_SIZE_DEFAULT,
};

const elements = {
  search: document.querySelector("#search"),
  searchScope: document.querySelector("#search-scope"),
  statusFilter: document.querySelector("#status-filter"),
  policyFilter: document.querySelector("#policy-filter"),
  impactFilter: document.querySelector("#impact-filter"),
  pageSize: document.querySelector("#page-size"),
  pagination: document.querySelector("#pagination"),
  resultCount: document.querySelector("#result-count"),
  sourceNote: document.querySelector("#source-note"),
  cards: document.querySelector("#bill-cards"),
  datasetCount: document.querySelector("#dataset-count"),
};

async function init() {
  initScrollReveal();
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

function initScrollReveal() {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reducedMotion) {
    document.documentElement.classList.add("tracker-unlocked");
    document.documentElement.style.setProperty("--reveal-progress", "1");
    document.documentElement.style.setProperty("--scroll-cue-opacity", "1");
    return;
  }

  const revealDistance = () => Math.min(window.innerHeight * 0.58, 540);

  function updateScrollCueOpacity(progress) {
    const fadeEnd = 0.92;
    const t = Math.min(1, progress / fadeEnd);
    const opacity = Math.max(0, 1 - t ** 1.05);
    document.documentElement.style.setProperty("--scroll-cue-opacity", opacity.toFixed(3));

    const scrollCue = document.querySelector(".scroll-cue");
    if (scrollCue) {
      scrollCue.style.pointerEvents = opacity > 0.12 ? "auto" : "none";
    }
  }

  function updateRevealProgress() {
    const progress = Math.min(1, Math.max(0, window.scrollY / revealDistance()));
    document.documentElement.style.setProperty("--reveal-progress", String(progress));
    document.documentElement.classList.toggle("tracker-unlocked", progress >= 0.94);
    updateScrollCueOpacity(progress);
  }

  window.addEventListener("scroll", updateRevealProgress, { passive: true });
  window.addEventListener("resize", updateRevealProgress, { passive: true });
  updateRevealProgress();

  document.querySelectorAll('a[href="#tracker"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector("#tracker")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function loadBills() {
  let lastError = null;

  for (const url of BILLS_DATA_URLS) {
    try {
      const payload = await fetchJson(url);
      applyBillPayload(payload, url);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Could not load tracker data.");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(`Expected JSON but received HTML from ${url}`);
  }

  return response.json();
}

function applyBillPayload(payload, sourceUrl) {
  if (Array.isArray(payload)) {
    bills = payload.map(prepareBillRecord);
    dataMeta = null;
  } else {
    bills = (payload.bills ?? []).map(prepareBillRecord);
    dataMeta = payload.meta ?? null;
  }

  if (!bills.length) {
    throw new Error(`No bills found in ${sourceUrl}.`);
  }

  if (sourceUrl.includes("bills.seed.json") && elements.sourceNote) {
    elements.sourceNote.textContent = "Loaded curated seed data — run scripts/sync_congress.py for full Congress.gov sync.";
  }
}

function prepareBillRecord(bill) {
  const rawStatus = bill.statusDetail ?? bill.status ?? "";
  const normalized = normalizeStatus(rawStatus);

  return {
    ...bill,
    statusDetail: rawStatus,
    status: normalized,
    isCurated: bill.source === "seed",
  };
}

function normalizeStatus(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return "Unknown";
  }

  const lowered = text.toLowerCase();

  if (/^motion\b/i.test(text) || lowered.startsWith("motion to")) {
    return "Procedural — floor motion";
  }

  if (/^referred\b/i.test(text)) {
    return "In committee";
  }

  if (lowered.includes("read twice and referred")) {
    return "In committee";
  }

  if (lowered.includes("placed on") && lowered.includes("calendar")) {
    return "On legislative calendar";
  }

  if (lowered.includes("ordered to be reported")) {
    return "Reported from committee";
  }

  if (lowered.includes("agreed to") || lowered.includes("became public law") || lowered.includes("signed by")) {
    return "Agreed / enacted";
  }

  if (lowered.includes("point of order") || lowered.includes("motion to discharge fell")) {
    return "Procedural — floor motion";
  }

  if (lowered.includes("sponsor introductory")) {
    return "Introduced";
  }

  return text;
}

function getActiveStatusFilters() {
  const statuses = new Set(bills.map((bill) => bill.status));

  return STATUS_FILTERS.filter((filter) => filter.matches.some((status) => statuses.has(status)));
}

function billMatchesStatusFilter(bill) {
  if (state.status === "all") {
    return true;
  }

  const filter = STATUS_FILTERS.find((entry) => entry.value === state.status);
  return filter ? filter.matches.includes(bill.status) : bill.status === state.status;
}

function showLoading() {
  elements.cards.innerHTML = `
    <div class="loading-skeleton" aria-hidden="true">
      ${Array.from({ length: 6 }, () => `
        <article class="skeleton-card">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--meta"></div>
          <div class="skeleton-line skeleton-line--short"></div>
        </article>
      `).join("")}
    </div>
    <p class="loading-label">Loading tracker data…</p>
  `;

  if (elements.sourceNote) {
    elements.sourceNote.textContent = "Loading data/bills.json…";
  }

  updateDatasetStats(null);
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
  updateDatasetStats(null);
}

function populateFilters() {
  getActiveStatusFilters().forEach((filter) => {
    elements.statusFilter.appendChild(createOption(filter.value, filter.label));
  });

  uniqueValues(bills.flatMap((bill) => bill.policyAreas)).forEach((policy) => {
    elements.policyFilter.appendChild(createOption(policy, policy));
  });
}

function bindEvents() {
  let searchTimer;
  elements.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    state.page = 1;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 120);
  });

  elements.searchScope.addEventListener("change", (event) => {
    state.searchScope = event.target.value;
    state.page = 1;
    render();
  });

  elements.statusFilter.addEventListener("change", (event) => {
    state.status = event.target.value;
    state.page = 1;
    render();
  });

  elements.policyFilter.addEventListener("change", (event) => {
    state.policy = event.target.value;
    state.page = 1;
    render();
  });

  elements.impactFilter.addEventListener("change", (event) => {
    state.impact = event.target.value;
    state.page = 1;
    render();
  });

  elements.pageSize.addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value) || PAGE_SIZE_DEFAULT;
    state.page = 1;
    render();
  });

  document.querySelector('[data-action="reset-filters"]').addEventListener("click", resetFilters);
  document.querySelector('[data-action="export-csv"]').addEventListener("click", exportCsv);
}

function render() {
  updateSourceNote();

  const filteredBills = getFilteredBills();
  const totalPages = Math.max(1, Math.ceil(filteredBills.length / state.pageSize));

  if (state.page > totalPages) {
    state.page = totalPages;
  }

  const pageStart = (state.page - 1) * state.pageSize;
  const pageBills = filteredBills.slice(pageStart, pageStart + state.pageSize);

  elements.resultCount.textContent = formatMatchCount(filteredBills.length);
  elements.resultCount.hidden = !hasActiveFilters();
  elements.cards.innerHTML = pageBills.length
    ? pageBills.map(renderBillCard).join("")
    : `<div class="empty">No bills match your search and filters. Try broadening the search or resetting filters.</div>`;

  bindCardInteractions();
  renderPagination(filteredBills.length, totalPages);
  updateDatasetStats(bills);
}

function bindCardInteractions() {
  document.querySelectorAll("[data-toggle-bill]").forEach((button) => {
    button.addEventListener("click", () => {
      const billId = button.dataset.toggleBill;
      expandedBillId = expandedBillId === billId ? null : billId;
      render();
    });
  });

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      expandedBillId = null;
      render();
      document.querySelector("#tracker")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderPagination(totalMatches, totalPages) {
  if (!elements.pagination) {
    return;
  }

  if (totalMatches <= state.pageSize) {
    elements.pagination.innerHTML = "";
    return;
  }

  const pages = buildPageList(state.page, totalPages);
  elements.pagination.innerHTML = `
    <button type="button" class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>Prev</button>
    ${pages
      .map((page) =>
        page === "…"
          ? `<span class="page-ellipsis">…</span>`
          : `<button type="button" class="page-btn ${page === state.page ? "active" : ""}" data-page="${page}">${page}</button>`,
      )
      .join("")}
    <button type="button" class="page-btn" data-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}>Next</button>
  `;
}

function buildPageList(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const result = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index];
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) {
      result.push("…");
    }
    result.push(page);
  }

  return result;
}

function hasActiveFilters() {
  return (
    state.search.trim() !== "" ||
    state.status !== "all" ||
    state.policy !== "all" ||
    state.impact !== "all"
  );
}

function formatMatchCount(count) {
  return `${count} matching ${count === 1 ? "bill" : "bills"}`;
}

function updateSourceNote() {
  if (!elements.sourceNote) {
    return;
  }

  if (!dataMeta?.syncedFromCongressGov) {
    elements.sourceNote.textContent = "Congress.gov sync not run — showing seeds until you run scripts/sync_congress.py.";
    return;
  }

  if (dataMeta.generatedAt) {
    const synced = new Date(dataMeta.generatedAt);
    elements.sourceNote.textContent = `Congress.gov data last synced ${synced.toLocaleString()}.`;
    return;
  }

  elements.sourceNote.textContent = "Congress.gov data loaded.";
}

function renderBillCard(bill) {
  const expanded = expandedBillId === bill.id;
  const priorityClass = bill.priority.toLowerCase();
  const sourceLabel = bill.isCurated ? "Research watch" : "Congress.gov";
  const officialLink = bill.congressGovUrl
    ? `<a class="inline-link" href="${escapeHtml(bill.congressGovUrl)}" target="_blank" rel="noopener noreferrer">View on Congress.gov</a>`
    : "";

  return `
    <article class="bill-card ${expanded ? "expanded" : "compact"}">
      <button class="bill-row" type="button" data-toggle-bill="${escapeHtml(bill.id)}" aria-expanded="${expanded}">
        <span class="bill-row-main">
          ${renderBillRowHeading(bill)}
          <span class="bill-meta">${escapeHtml(bill.status)} · ${escapeHtml(bill.chamber)} · ${escapeHtml(sourceLabel)}</span>
        </span>
        <span class="bill-row-actions">
          <span class="pill ${priorityClass}">${escapeHtml(bill.priority)}</span>
          <span class="expand-hint">${expanded ? "Hide" : "Details"}</span>
        </span>
      </button>

      ${officialLink ? `<div class="card-toolbar">${officialLink}</div>` : ""}

      ${
        expanded
          ? `
        <div class="card-body">
          ${renderStatusDetail(bill)}
          <div class="status-row">
            <div>
              <h3>Legislative stage</h3>
              ${renderStageTrack(bill.stageIndex)}
            </div>
          </div>

          ${renderSummary(bill)}

          <dl class="info-grid">
            ${renderInfoItem("Sponsor", bill.sponsor)}
            ${renderInfoItem("Cosponsors", bill.cosponsors)}
            ${renderInfoItem("Committee referral", bill.committeeReferral)}
            ${renderInfoItem("Funding / contract signal", bill.fundingContractSignal)}
            ${renderInfoItem("Regulation / bonus watch", bill.regulationBonusWatch)}
            ${renderInfoItem("Next research action", bill.nextAction)}
          </dl>

          ${renderVoteSection(bill)}
          ${renderTags(bill)}
        </div>
      `
          : ""
      }
    </article>
  `;
}

function renderBillRowHeading(bill) {
  const title = cleanDisplayValue(bill.title);
  const billNumber = cleanDisplayValue(bill.billNumber);
  const showBillNumber = billNumber && billNumber !== title;

  if (!title && billNumber) {
    return `<span class="bill-title">${escapeHtml(billNumber)}</span>`;
  }

  if (!showBillNumber) {
    return `<span class="bill-title">${escapeHtml(title)}</span>`;
  }

  const billNumberClass = isCongressBillNumber(billNumber) ? "bill-id" : "bill-label";

  return `
    <span class="bill-title">${escapeHtml(title)}</span>
    <span class="${billNumberClass}">${escapeHtml(billNumber)}</span>
  `;
}

function isCongressBillNumber(value) {
  return /^\d+\s+[A-Z]+\s+\d+$/.test(String(value ?? "").trim());
}

function renderSummary(bill) {
  const summary = cleanDisplayValue(bill.plainSummary);
  if (!summary || isGenericPlainSummary(bill)) {
    return "";
  }

  return `<p class="summary">${escapeHtml(summary)}</p>`;
}

function isGenericPlainSummary(bill) {
  if (bill.isCurated) {
    return false;
  }
  const summary = String(bill.plainSummary ?? "");
  return summary.startsWith("Official bill:") && summary.includes(bill.title);
}

function renderVoteSection(bill) {
  const house = cleanDisplayValue(bill.voteCounts?.house);
  const senate = cleanDisplayValue(bill.voteCounts?.senate);

  if (!house && !senate) {
    return "";
  }

  return `
    <div>
      <h3>Vote counts</h3>
      <div class="vote-grid">
        ${house ? `<div class="vote-box"><span>House</span><strong>${escapeHtml(house)}</strong></div>` : ""}
        ${senate ? `<div class="vote-box"><span>Senate</span><strong>${escapeHtml(senate)}</strong></div>` : ""}
      </div>
    </div>
  `;
}

function renderTags(bill) {
  const tags = uniqueValues([
    ...bill.policyAreas.filter((tag) => tag !== "Defense policy" || bill.isCurated),
    ...bill.tags.filter((tag) => !["congress.gov", "auto-sync"].includes(tag)),
  ]);

  if (!tags.length) {
    return "";
  }

  return `
    <div>
      <h3>Policy area / tags</h3>
      <div class="tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
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

function renderStatusDetail(bill) {
  const detail = bill.statusDetail ?? "";
  if (!detail || detail === bill.status) {
    return "";
  }

  return `<p class="status-detail">Latest action: ${escapeHtml(truncateText(detail, 200))}</p>`;
}

function renderInfoItem(label, value) {
  const cleaned = cleanDisplayValue(value);
  if (!cleaned) {
    return "";
  }

  return `
    <div class="info-item">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(cleaned)}</dd>
    </div>
  `;
}

function cleanDisplayValue(value) {
  const text = String(value ?? "").trim();
  if (!text || GENERIC_PLACEHOLDERS.has(text)) {
    return "";
  }
  return text;
}

function getSearchableFieldList(bill, scope) {
  const fieldsByScope = {
    bill: [bill.billNumber, bill.congress],
    title: [bill.title, bill.plainSummary],
    sponsor: [bill.sponsor, bill.cosponsors, bill.committeeReferral],
    tags: [...bill.policyAreas, ...bill.tags, ...bill.impactLenses],
    all: [
      bill.billNumber,
      bill.title,
      bill.chamber,
      bill.congress,
      bill.status,
      bill.statusDetail,
      bill.priority,
      bill.sponsor,
      bill.cosponsors,
      bill.committeeReferral,
      bill.plainSummary,
      bill.fundingContractSignal,
      bill.regulationBonusWatch,
      bill.nextAction,
      ...bill.policyAreas,
      ...bill.tags,
    ],
  };

  return fieldsByScope[scope] ?? fieldsByScope.all;
}

function getBillSearchScore(bill) {
  if (!state.search.trim()) {
    return 1;
  }

  return FuzzySearch.scoreQueryInFields(state.search, getSearchableFieldList(bill, state.searchScope));
}

function passesBaseFilters(bill) {
  return (
    billMatchesStatusFilter(bill) &&
    (state.policy === "all" || bill.policyAreas.includes(state.policy)) &&
    (state.impact === "all" || bill.impactLenses.includes(state.impact))
  );
}

function getFilteredBills() {
  return bills
    .filter(passesBaseFilters)
    .map((bill) => ({ bill, score: getBillSearchScore(bill) }))
    .filter(({ score }) => !state.search.trim() || score >= FuzzySearch.DEFAULT_THRESHOLD)
    .sort((left, right) => {
      if (state.search.trim() && right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.bill.isCurated !== right.bill.isCurated) {
        return left.bill.isCurated ? -1 : 1;
      }

      return left.bill.title.localeCompare(right.bill.title);
    })
    .map(({ bill }) => bill);
}

function matchesFilters(bill) {
  return passesBaseFilters(bill) && (!state.search.trim() || getBillSearchScore(bill) >= FuzzySearch.DEFAULT_THRESHOLD);
}

function updateDatasetStats(dataset) {
  if (!elements.datasetCount) {
    return;
  }

  elements.datasetCount.textContent = dataset?.length ? dataset.length : "—";
}

function resetFilters() {
  state.search = "";
  state.searchScope = "all";
  state.status = "all";
  state.policy = "all";
  state.impact = "all";
  state.page = 1;
  expandedBillId = null;

  elements.search.value = "";
  elements.searchScope.value = "all";
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
    curated: bill.isCurated ? "yes" : "no",
    congress_gov_url: bill.congressGovUrl ?? "",
    status: bill.status,
    latest_action: bill.statusDetail ?? bill.status,
    priority: bill.priority,
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

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function pluralize(count, singular) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
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
