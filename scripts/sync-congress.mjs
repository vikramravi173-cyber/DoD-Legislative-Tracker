#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const API_BASE = "https://api.congress.gov/v3";
const DEFAULT_INPUT = "data/bills.json";
const DEFAULT_OUTPUT = "data/bills.json";
const DEFAULT_AMENDMENT_LIMIT = 25;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const inputPath = args.input ?? DEFAULT_INPUT;
const outputPath = args.output ?? DEFAULT_OUTPUT;
const amendmentLimit = Number(args["amendment-limit"] ?? DEFAULT_AMENDMENT_LIMIT);
const validateOnly = Boolean(args["validate-only"]);
const dryRun = Boolean(args["dry-run"]);
const apiKey = process.env.CONGRESS_GOV_API_KEY;

const payload = await readJson(inputPath);
const records = normalizeRecords(payload.records ?? []);
const validation = validateRecords(records);

if (validation.errors.length) {
  for (const error of validation.errors) {
    console.error(`Validation error: ${error}`);
  }
  process.exit(1);
}

if (validateOnly) {
  console.log(`Validated ${records.length} normalized tracker records from ${inputPath}.`);
  process.exit(0);
}

if (!apiKey) {
  console.error("Missing CONGRESS_GOV_API_KEY. Add it to the environment before running the sync job.");
  printUsage();
  process.exit(1);
}

const syncedRecords = [];

for (const record of records) {
  if (!hasOfficialIdentifier(record)) {
    syncedRecords.push(markUnsynced(record, "needs-official-identifier"));
    console.warn(`Skipping ${record.id}: add official.congress, official.billType, and official.billNumber.`);
    continue;
  }

  try {
    syncedRecords.push(await syncRecord(record, { apiKey, amendmentLimit }));
    console.log(`Synced ${record.id} (${record.official.billType} ${record.official.billNumber}).`);
  } catch (error) {
    console.error(`Failed to sync ${record.id}: ${error.message}`);
    syncedRecords.push(markUnsynced(record, `sync-error: ${error.message}`));
  }
}

const output = {
  metadata: {
    ...payload.metadata,
    source: "congress.gov",
    generatedAt: new Date().toISOString(),
    syncStatus: "completed",
    recordsTotal: syncedRecords.length,
    recordsSynced: syncedRecords.filter((record) => record.official?.syncStatus === "synced").length,
    recordsSkipped: syncedRecords.filter((record) => record.official?.syncStatus !== "synced").length,
    endpoints: [
      "/bill/{congress}/{billType}/{billNumber}",
      "/bill/{congress}/{billType}/{billNumber}/cosponsors",
      "/bill/{congress}/{billType}/{billNumber}/committees",
      "/bill/{congress}/{billType}/{billNumber}/summaries",
      "/bill/{congress}/{billType}/{billNumber}/actions",
      "/bill/{congress}/{billType}/{billNumber}/amendments",
      "/amendment/{congress}/{amendmentType}/{amendmentNumber}",
    ],
  },
  records: syncedRecords,
};

if (dryRun) {
  console.log(JSON.stringify(output, null, 2));
} else {
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${syncedRecords.length} normalized records to ${outputPath}.`);
}

async function syncRecord(seed, { apiKey, amendmentLimit }) {
  const target = seed.official;
  const congress = String(target.congress);
  const billType = String(target.billType).toLowerCase();
  const billNumber = String(target.billNumber);

  const [billPayload, cosponsorsPayload, committeesPayload, summariesPayload, actionsPayload, amendmentsPayload] =
    await Promise.all([
      apiGet(`/bill/${congress}/${billType}/${billNumber}`, apiKey),
      apiGet(`/bill/${congress}/${billType}/${billNumber}/cosponsors`, apiKey, { limit: 250 }),
      apiGet(`/bill/${congress}/${billType}/${billNumber}/committees`, apiKey, { limit: 250 }),
      apiGet(`/bill/${congress}/${billType}/${billNumber}/summaries`, apiKey, { limit: 250 }),
      apiGet(`/bill/${congress}/${billType}/${billNumber}/actions`, apiKey, { limit: 250 }),
      apiGet(`/bill/${congress}/${billType}/${billNumber}/amendments`, apiKey, { limit: amendmentLimit }),
    ]);

  const bill = billPayload.bill ?? {};
  const officialSummary = pickOfficialSummary(summariesPayload.summaries);
  const actions = actionsPayload.actions ?? [];
  const committees = normalizeCommittees(committeesPayload.committees);
  const amendments = await syncAmendments(amendmentsPayload.amendments ?? [], apiKey, amendmentLimit);

  return {
    ...seed,
    billNumber: formatBillNumber(bill, target),
    title: bill.title ?? seed.title,
    chamber: formatChamber(bill.originChamber, seed.chamber),
    congress: bill.congress ? `${bill.congress}th Congress` : seed.congress,
    status: bill.latestAction?.text ?? seed.status,
    stageIndex: deriveStageIndex(bill, actions, seed.stageIndex),
    sponsors: normalizePeople(bill.sponsors ?? seed.sponsors),
    cosponsors: normalizePeople(cosponsorsPayload.cosponsors ?? []),
    cosponsorCount: Number.isFinite(cosponsorsPayload.pagination?.count)
      ? cosponsorsPayload.pagination.count
      : cosponsorsPayload.cosponsors?.length ?? seed.cosponsorCount ?? 0,
    committeeReferral: committees.length ? committees : seed.committeeReferral,
    voteCounts: extractVoteCounts(actions, seed.voteCounts),
    plainSummary: officialSummary || seed.plainSummary,
    policyAreas: seed.policyAreas,
    tags: seed.tags,
    impactLenses: seed.impactLenses,
    fundingContractSignal: seed.fundingContractSignal,
    regulationBonusWatch: seed.regulationBonusWatch,
    nextAction: seed.nextAction,
    official: {
      ...target,
      congress: Number(bill.congress ?? target.congress),
      billType: String(bill.type ?? target.billType).toLowerCase(),
      billNumber: String(bill.number ?? target.billNumber),
      sourceUrl: bill.url ?? target.sourceUrl ?? "",
      latestAction: bill.latestAction?.text ?? "",
      updatedAt: bill.updateDateIncludingText ?? bill.updateDate ?? new Date().toISOString(),
      syncStatus: "synced",
    },
    amendments,
  };
}

async function syncAmendments(amendments, apiKey, limit) {
  const selected = amendments.slice(0, limit);
  const detailed = [];

  for (const amendment of selected) {
    const congress = amendment.congress;
    const type = String(amendment.type ?? amendment.amendmentType ?? "").toLowerCase();
    const number = amendment.number;

    if (!congress || !type || !number) {
      detailed.push(normalizeAmendment(amendment));
      continue;
    }

    try {
      const payload = await apiGet(`/amendment/${congress}/${type}/${number}`, apiKey);
      detailed.push(normalizeAmendment(payload.amendment ?? amendment));
    } catch {
      detailed.push(normalizeAmendment(amendment));
    }
  }

  return detailed;
}

async function apiGet(path, apiKey, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${path}`);
  }

  return response.json();
}

function normalizeRecords(records) {
  return records.map((record) => ({
    ...record,
    sponsors: normalizePeople(record.sponsors ?? []),
    cosponsors: normalizePeople(record.cosponsors ?? []),
    committeeReferral: normalizeStringList(record.committeeReferral),
    policyAreas: normalizeStringList(record.policyAreas),
    tags: normalizeStringList(record.tags),
    impactLenses: normalizeStringList(record.impactLenses),
    amendments: (record.amendments ?? []).map(normalizeAmendment),
  }));
}

function validateRecords(records) {
  const errors = [];
  const requiredFields = [
    "id",
    "billNumber",
    "title",
    "status",
    "priority",
    "plainSummary",
    "policyAreas",
    "tags",
    "impactLenses",
    "fundingContractSignal",
    "regulationBonusWatch",
    "nextAction",
  ];

  records.forEach((record, index) => {
    for (const field of requiredFields) {
      if (record[field] === undefined || record[field] === null || record[field] === "") {
        errors.push(`records[${index}] ${record.id ?? "(missing id)"} is missing ${field}`);
      }
    }
  });

  return { errors };
}

function hasOfficialIdentifier(record) {
  return Boolean(record.official?.congress && record.official?.billType && record.official?.billNumber);
}

function markUnsynced(record, syncStatus) {
  return {
    ...record,
    official: {
      ...record.official,
      syncStatus,
      updatedAt: record.official?.updatedAt ?? "",
    },
  };
}

function normalizePeople(people) {
  return normalizeArray(people).map((person) => {
    if (typeof person === "string") {
      return { fullName: person, party: "", state: "" };
    }

    return {
      fullName: person.fullName ?? person.name ?? person.directOrderName ?? "",
      party: person.party ?? person.partyName ?? "",
      state: person.state ?? "",
    };
  });
}

function normalizeCommittees(committees = []) {
  return normalizeArray(committees)
    .flatMap((committee) => {
      if (typeof committee === "string") {
        return committee;
      }

      const name = committee.name ?? committee.systemCode ?? "";
      const subcommittees = normalizeArray(committee.subcommittees).map((subcommittee) =>
        [name, subcommittee.name].filter(Boolean).join(" - "),
      );

      return [name, ...subcommittees].filter(Boolean);
    })
    .filter(Boolean);
}

function normalizeAmendment(amendment) {
  return {
    number: formatAmendmentNumber(amendment),
    title: amendment.title ?? amendment.description ?? "",
    purpose: stripHtml(amendment.purpose ?? amendment.description ?? ""),
    status: amendment.latestAction?.text ?? amendment.status ?? "",
    latestActionDate: amendment.latestAction?.actionDate ?? amendment.updateDate ?? "",
    sponsor: normalizePeople(amendment.sponsors ?? []).at(0) ?? null,
    sourceUrl: amendment.url ?? "",
  };
}

function extractVoteCounts(actions, fallback = {}) {
  const votes = {
    house: normalizeVote(fallback.house, "Official House vote pending"),
    senate: normalizeVote(fallback.senate, "Official Senate vote pending"),
  };

  for (const action of actions) {
    const text = action.text ?? "";
    const chamber = detectVoteChamber(text, action);

    if (!chamber) {
      continue;
    }

    const parsed = parseVoteText(text);
    votes[chamber] = {
      label: parsed.label || text,
      yea: parsed.yea,
      nay: parsed.nay,
      result: parsed.result,
      date: action.actionDate ?? "",
      sourceUrl: action.sourceSystem?.url ?? action.recordedVotes?.[0]?.url ?? "",
    };
  }

  return votes;
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

function detectVoteChamber(text, action) {
  const haystack = `${text} ${action.sourceSystem?.name ?? ""}`.toLowerCase();

  if (!/(vote|passed|agreed|failed|rejected)/.test(haystack)) {
    return null;
  }

  if (haystack.includes("senate")) {
    return "senate";
  }

  if (haystack.includes("house")) {
    return "house";
  }

  return null;
}

function parseVoteText(text) {
  const counts = text.match(/(\d+)\s*-\s*(\d+)/);
  const result = text.match(/\b(Passed|Agreed to|Failed|Rejected)\b/i)?.[0] ?? "";

  return {
    label: text,
    yea: counts ? Number(counts[1]) : null,
    nay: counts ? Number(counts[2]) : null,
    result,
  };
}

function pickOfficialSummary(summaries = []) {
  return (
    normalizeArray(summaries)
      .sort((a, b) => String(b.updateDate ?? "").localeCompare(String(a.updateDate ?? "")))
      .map((summary) => stripHtml(summary.text))
      .find(Boolean) ?? ""
  );
}

function deriveStageIndex(bill, actions, fallback = 0) {
  const text = [bill.latestAction?.text, ...normalizeArray(actions).map((action) => action.text)]
    .join(" ")
    .toLowerCase();

  if (/became public law|signed by president/.test(text)) {
    return 4;
  }

  if (/passed senate|passed house|received in the senate|received in the house/.test(text)) {
    return 3;
  }

  if (/motion to proceed|passed\/agreed|floor|considered/.test(text)) {
    return 2;
  }

  if (/committee|referred|reported/.test(text)) {
    return 1;
  }

  return Number.isFinite(fallback) ? fallback : 0;
}

function formatBillNumber(bill, target) {
  const type = bill.type ?? target.billType;
  const number = bill.number ?? target.billNumber;
  return [String(type).toUpperCase(), number].filter(Boolean).join(" ");
}

function formatAmendmentNumber(amendment) {
  const type = amendment.type ?? amendment.amendmentType;
  return [String(type ?? "").toUpperCase(), amendment.number].filter(Boolean).join(" ");
}

function formatChamber(originChamber, fallback) {
  if (!originChamber) {
    return fallback;
  }

  return originChamber === "House" || originChamber === "Senate" ? originChamber : fallback;
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

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseArgs(rawArgs) {
  const parsed = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = rawArgs[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`
Usage:
  CONGRESS_GOV_API_KEY=... npm run sync:congress
  CONGRESS_GOV_API_KEY=... node scripts/sync-congress.mjs --input data/bills.json --output data/bills.json

Options:
  --input <path>              Normalized tracker input file. Defaults to ${DEFAULT_INPUT}.
  --output <path>             Output file. Defaults to ${DEFAULT_OUTPUT}.
  --amendment-limit <number>  Max amendments to hydrate per bill. Defaults to ${DEFAULT_AMENDMENT_LIMIT}.
  --dry-run                   Print normalized output instead of writing.
  --validate-only             Validate local data shape without calling Congress.gov.
  --help                      Show this help text.
`);
}
