const STAGES = ["Introduced", "Committee", "Floor vote", "Other chamber", "President"];
const WATCH_STORAGE_KEY = "dod-legislative-tracker-watched";

const bills = [
  {
    id: "fy26-ndaa",
    billNumber: "FY2026 NDAA watch",
    title: "National Defense Authorization Act oversight track",
    chamber: "House / Senate",
    congress: "119th Congress",
    status: "Committee development",
    stageIndex: 1,
    priority: "High",
    sponsor: "House and Senate Armed Services leadership",
    cosponsors: "To be synced from official bill records",
    committeeReferral: "House Armed Services; Senate Armed Services",
    voteCounts: {
      house: "No final floor vote logged",
      senate: "No final floor vote logged",
    },
    plainSummary:
      "Annual defense policy package that can authorize programs, procurement authorities, reporting requirements, and implementation rules affecting the Department of Defense and its contractors.",
    policyAreas: ["Defense authorization", "Procurement", "Industrial base"],
    tags: ["NDAA", "authorization", "contracting", "readiness"],
    impactLenses: ["contracts", "regulation", "incentives"],
    fundingContractSignal:
      "Watch for acquisition reform language, production scaling authorities, contractor reporting requirements, and incentive structures for delivery speed or cost control.",
    regulationBonusWatch:
      "Track amendments that condition awards, milestone payments, award fees, or executive bonuses on performance, cybersecurity, or domestic sourcing.",
    nextAction:
      "Monitor subcommittee markups, amendment text, manager packages, and committee reports for contractor-facing provisions.",
  },
  {
    id: "fy26-defense-appropriations",
    billNumber: "FY2026 Defense appropriations watch",
    title: "Department of Defense appropriations and spending directives",
    chamber: "House / Senate",
    congress: "119th Congress",
    status: "Appropriations review",
    stageIndex: 1,
    priority: "High",
    sponsor: "Defense Appropriations subcommittee leadership",
    cosponsors: "Not applicable for committee bill profile",
    committeeReferral: "House Appropriations - Defense; Senate Appropriations - Defense",
    voteCounts: {
      house: "Committee and floor votes pending",
      senate: "Committee and floor votes pending",
    },
    plainSummary:
      "Tracks actual spending levels, earmarks, program increases or cuts, and explanatory report language that directs how DoD funds flow to programs and vendors.",
    policyAreas: ["Appropriations", "Budget oversight", "Contract spending"],
    tags: ["funding", "contracts", "program increases", "report language"],
    impactLenses: ["funding", "contracts"],
    fundingContractSignal:
      "Flag plus-ups, rescissions, reprogramming limits, and report directives that affect prime contractors, subcontractors, and grant recipients.",
    regulationBonusWatch:
      "Watch for restrictions on using funds for certain vendors, foreign sourcing, consulting contracts, or incentive compensation.",
    nextAction:
      "Compare bill tables and explanatory statements against DoD budget justification books to identify winners, losers, and constraints.",
  },
  {
    id: "dod-contractor-cybersecurity",
    billNumber: "Contractor cybersecurity compliance watch",
    title: "Defense contractor cybersecurity and CMMC implementation",
    chamber: "Federal policy lane",
    congress: "119th Congress",
    status: "Rulemaking and oversight",
    stageIndex: 1,
    priority: "High",
    sponsor: "Armed Services and Homeland Security oversight members",
    cosponsors: "To be synced when bill text is introduced",
    committeeReferral:
      "House Armed Services; Senate Armed Services; House Homeland Security; Senate Homeland Security and Governmental Affairs",
    voteCounts: {
      house: "No bill vote logged",
      senate: "No bill vote logged",
    },
    plainSummary:
      "Focuses on cyber requirements for companies that receive DoD contracts, including certification timing, incident reporting, audit burden, and small-business compliance costs.",
    policyAreas: ["Cybersecurity", "Procurement", "Small business"],
    tags: ["CMMC", "DFARS", "incident reporting", "supply chain"],
    impactLenses: ["contracts", "regulation"],
    fundingContractSignal:
      "Track whether compliance costs are reimbursable, whether certification becomes a condition of award, and how primes must police subcontractors.",
    regulationBonusWatch:
      "Watch for penalty language, safe harbors, audit relief, or certification grace periods that change contractor incentives.",
    nextAction:
      "Monitor hearings, NDAA amendments, and acquisition-policy riders that reference CMMC, DFARS cyber clauses, or defense industrial base incidents.",
  },
  {
    id: "shipbuilding-industrial-base",
    billNumber: "Naval and shipbuilding industrial base watch",
    title: "Shipbuilding, submarine production, and supplier-base funding",
    chamber: "House / Senate",
    congress: "119th Congress",
    status: "Funding proposal watch",
    stageIndex: 1,
    priority: "Medium",
    sponsor: "Seapower and defense appropriations members",
    cosponsors: "Regional shipyard and supplier-state delegations",
    committeeReferral: "Armed Services seapower panels; Appropriations defense panels",
    voteCounts: {
      house: "No final vote logged",
      senate: "No final vote logged",
    },
    plainSummary:
      "Tracks congressional direction for Navy shipbuilding, submarine production capacity, supplier development, workforce support, and multi-year procurement authorities.",
    policyAreas: ["Industrial base", "Navy programs", "Workforce"],
    tags: ["shipbuilding", "submarines", "suppliers", "multi-year procurement"],
    impactLenses: ["funding", "contracts", "incentives"],
    fundingContractSignal:
      "Identify funds targeted to shipyards, component suppliers, workforce pipelines, and production bottlenecks across the maritime defense base.",
    regulationBonusWatch:
      "Watch for delivery incentives, penalty clauses, domestic-content requirements, and workforce grant conditions.",
    nextAction:
      "Track seapower markup language, appropriations tables, and committee report directions tied to production capacity or schedule slippage.",
  },
  {
    id: "munitions-production-scaling",
    billNumber: "Munitions production scaling watch",
    title: "Munitions procurement, surge capacity, and replenishment authorities",
    chamber: "House / Senate",
    congress: "119th Congress",
    status: "Policy and funding watch",
    stageIndex: 1,
    priority: "Medium",
    sponsor: "Readiness, tactical air, land forces, and appropriations members",
    cosponsors: "Members focused on defense industrial capacity",
    committeeReferral: "House Armed Services; Senate Armed Services; Defense Appropriations",
    voteCounts: {
      house: "No final vote logged",
      senate: "No final vote logged",
    },
    plainSummary:
      "Tracks legislation and report language that expands production lines, replenishes inventories, or creates flexible contracting tools for missiles, artillery, and other munitions.",
    policyAreas: ["Munitions", "Industrial base", "Readiness"],
    tags: ["surge capacity", "procurement", "replenishment", "production lines"],
    impactLenses: ["funding", "contracts"],
    fundingContractSignal:
      "Watch for advance procurement, multi-year buys, Defense Production Act usage, facility modernization grants, and supplier diversification.",
    regulationBonusWatch:
      "Monitor cost-sharing, milestone incentives, reporting requirements, and restrictions on sole-source production expansions.",
    nextAction:
      "Compare authorization and appropriations language for production-rate assumptions, funding gaps, and contractor deliverables.",
  },
  {
    id: "contractor-pay-incentives",
    billNumber: "Contractor compensation and bonus guardrails watch",
    title: "Defense contractor bonus, award-fee, and executive-compensation restrictions",
    chamber: "House / Senate",
    congress: "119th Congress",
    status: "Oversight concept watch",
    stageIndex: 0,
    priority: "Medium",
    sponsor: "Oversight, Armed Services, and appropriations members",
    cosponsors: "To be synced when bill text is introduced",
    committeeReferral: "House Oversight; Senate Homeland Security and Governmental Affairs; Armed Services committees",
    voteCounts: {
      house: "No bill vote logged",
      senate: "No bill vote logged",
    },
    plainSummary:
      "Focuses on proposals that would limit reimbursement, award fees, bonuses, or executive compensation for defense contractors tied to poor performance, overruns, or compliance failures.",
    policyAreas: ["Contract oversight", "Compensation", "Accountability"],
    tags: ["bonuses", "award fees", "overruns", "performance"],
    impactLenses: ["contracts", "regulation", "incentives"],
    fundingContractSignal:
      "Flag provisions that make compensation unallowable, claw back fees, or condition future awards on delivery and compliance metrics.",
    regulationBonusWatch:
      "Primary watch item: congressional efforts to reshape contractor bonuses, award fees, and executive-pay reimbursement rules.",
    nextAction:
      "Monitor watchdog reports, hearing transcripts, and amendments responding to cost overruns or contract-performance failures.",
  },
];

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
  stats: {
    active: document.querySelector('[data-stat="active"]'),
    committees: document.querySelector('[data-stat="committees"]'),
    watched: document.querySelector('[data-stat="watched"]'),
    priority: document.querySelector('[data-stat="priority"]'),
  },
};

function init() {
  populateFilters();
  bindEvents();
  render();
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
    title: bill.title,
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

  const briefing = `DoD legislative tracker briefing

Scope: Federal congressional policy research for Department of Defense funding, contracts, regulations, and contractor incentives.
Current high-priority watches:
${highPriority}

Recommended next step: sync bill identifiers, sponsor rosters, votes, and official summaries from Congress.gov or committee sources before publication.`;

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
