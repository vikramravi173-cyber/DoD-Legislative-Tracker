#!/usr/bin/env python3
"""
Merge curated DoD watch seeds with defense-related bills from Congress.gov API v3.

Usage:
  python3 scripts/sync_congress.py
  CONGRESS_API_KEY=... python3 scripts/sync_congress.py --congress 119 --max-bills 40

Requires an API key from https://api.data.gov/signup/ for live sync.
Without a key, only seeds are written to data/bills.json.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED_PATH = ROOT / "data" / "bills.seed.json"
OUTPUT_PATH = ROOT / "data" / "bills.json"
API_BASE = "https://api.congress.gov/v3"

DEFENSE_PHRASE_SCORES = (
    ("national defense authorization", 5),
    ("ndaa", 5),
    ("department of defense", 5),
    ("defense appropriations", 5),
    ("military construction", 4),
    ("milcon", 4),
    ("defense supplemental", 4),
    ("foreign military sales", 4),
    ("defense production act", 4),
    ("national nuclear security", 4),
    ("armed forces", 3),
    ("national defense", 3),
    ("security assistance", 3),
    ("warfighter", 3),
    ("munitions", 3),
    ("shipbuilding", 3),
    ("submarine", 3),
    ("space force", 3),
    ("homeland security", 2),
    ("ukraine", 2),
    ("pentagon", 3),
    ("missile defense", 3),
    ("coast guard", 2),
    ("intelligence authorization", 3),
    ("energy and water", 2),
)

DEFENSE_COMMITTEE_MARKERS = (
    "armed services",
    "defense",
    "homeland security",
    "intelligence",
    "energy and water",
    "foreign relations",
    "foreign affairs",
)

MIN_DEFENSE_SCORE = 3
LIST_PATHS = ("", "/hr", "/s", "/hjres", "/sjres")

CHAMBER_SLUGS = {
    "hr": "house-bill",
    "s": "senate-bill",
    "hjres": "house-joint-resolution",
    "sjres": "senate-joint-resolution",
    "hres": "house-resolution",
    "sres": "senate-resolution",
    "hconres": "house-concurrent-resolution",
    "sconres": "senate-concurrent-resolution",
}


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def load_env_file() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_get(path: str, api_key: str, params: dict | None = None, retries: int = 4) -> dict:
    query = {"api_key": api_key, "format": "json"}
    if params:
        query.update(params)
    url = f"{API_BASE}{path}?{urllib.parse.urlencode(query)}"
    request = urllib.request.Request(url, headers={"User-Agent": "DoD-Legislative-Tracker/1.0"})

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code in (403, 429) and attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    raise last_error  # type: ignore[misc]


def defense_relevance_score(title: str, committees: list[str] | None = None) -> int:
    lowered = (title or "").lower()
    score = 0

    for phrase, points in DEFENSE_PHRASE_SCORES:
        if phrase in lowered:
            score += points

    if re.search(r"\bdefense\b", lowered):
        score += 2
    if re.search(r"\bmilitary\b", lowered):
        score += 1
    if "appropriation" in lowered and re.search(
        r"defense|military|armed forces|homeland|national nuclear|energy and water|milcon|veteran",
        lowered,
    ):
        score += 3
    if "authoriz" in lowered and re.search(r"armed forces|defense|military|national defense", lowered):
        score += 3
    if "supplemental" in lowered and re.search(r"defense|military|ukraine|security", lowered):
        score += 3
    if "continuing resolution" in lowered or re.search(r"\bcr\b", lowered):
        score += 2

    if committees:
        committee_text = " ".join(committees).lower()
        if any(marker in committee_text for marker in DEFENSE_COMMITTEE_MARKERS):
            score += 2

    return score


def is_defense_related(title: str, committees: list[str] | None = None) -> bool:
    return defense_relevance_score(title, committees) >= MIN_DEFENSE_SCORE


def stage_index_from_action(action_text: str) -> int:
    text = (action_text or "").lower()
    if any(phrase in text for phrase in ("became public law", "signed by president", "signed by the president")):
        return 4
    if any(phrase in text for phrase in ("passed house", "passed senate", "agreed to", "on passage")):
        if "passed house" in text and "passed senate" in text:
            return 4
        if "conference" in text or "between the houses" in text:
            return 3
        return 2
    if any(phrase in text for phrase in ("committee", "referred", "reported", "markup", "ordered to be reported")):
        return 1
    return 0


def priority_from_title(title: str) -> str:
    lowered = (title or "").lower()
    if "national defense authorization" in lowered or "ndaa" in lowered:
        return "High"
    if "department of defense appropriations" in lowered or "defense appropriations" in lowered:
        return "High"
    if "supplemental" in lowered and "defense" in lowered:
        return "High"
    return "Medium"


def policy_areas_from_title(title: str) -> list[str]:
    lowered = (title or "").lower()
    areas: list[str] = []
    if "authorization" in lowered or "ndaa" in lowered:
        areas.append("Defense authorization")
    if "appropriation" in lowered:
        areas.append("Appropriations")
    if "military construction" in lowered or "milcon" in lowered:
        areas.append("Infrastructure")
    if "nuclear" in lowered or "nnsa" in lowered:
        areas.append("Nuclear enterprise")
    if "munitions" in lowered or "shipbuilding" in lowered:
        areas.append("Industrial base")
    if not areas:
        areas.append("Defense policy")
    return areas


def impact_lenses_from_title(title: str) -> list[str]:
    lowered = (title or "").lower()
    lenses = []
    if "appropriation" in lowered or "supplemental" in lowered or "funding" in lowered:
        lenses.append("funding")
    if any(word in lowered for word in ("procurement", "contract", "acquisition")):
        lenses.append("contracts")
    if not lenses:
        lenses.append("funding")
    return lenses


def congress_gov_url(congress: int, bill_type: str, bill_number: int) -> str:
    slug = CHAMBER_SLUGS.get(bill_type.lower(), "house-bill")
    return f"https://www.congress.gov/bill/{congress}th-congress/{slug}/{bill_number}"


def format_bill_number(congress: int, bill_type: str, bill_number: int) -> str:
    return f"{congress} {bill_type.upper()} {bill_number}"


def bill_id(congress: int, bill_type: str, bill_number: int) -> str:
    return f"{congress}-{bill_type.lower()}-{bill_number}"


def extract_list(payload: dict, key: str) -> list:
    container = payload.get(key, payload)
    if isinstance(container, list):
        return container
    if isinstance(container, dict):
        for child_key in (key, "items", "bills", "summaries", "cosponsors", "committees", "actions"):
            child = container.get(child_key)
            if isinstance(child, list):
                return child
    return []


def fetch_bill_list_path(
    congress: int,
    api_key: str,
    path_suffix: str,
    max_pages: int,
) -> list[dict]:
    collected: list[dict] = []
    offset = 0
    limit = 250
    base = f"/bill/{congress}{path_suffix}"

    for _ in range(max_pages):
        payload = api_get(
            base,
            api_key,
            {"limit": limit, "offset": offset, "sort": "updateDate+desc"},
        )
        batch = extract_list(payload, "bills")
        if not batch:
            break
        collected.extend(batch)
        pagination = payload.get("pagination") or {}
        if not pagination.get("next"):
            break
        offset += limit
        time.sleep(0.35)

    return collected


def fetch_all_bill_candidates(congress: int, api_key: str, max_pages: int) -> list[dict]:
    by_key: dict[str, dict] = {}

    for suffix in LIST_PATHS:
        label = suffix or "/all"
        print(f"Scanning {label} …")
        try:
            batch = fetch_bill_list_path(congress, api_key, suffix, max_pages)
        except urllib.error.HTTPError as exc:
            print(f"  Skipped {label}: HTTP {exc.code}")
            continue
        for item in batch:
            bill_type = (item.get("type") or "").lower()
            number = item.get("number")
            if not bill_type or number is None:
                continue
            key = f"{bill_type}-{number}"
            if key not in by_key:
                by_key[key] = item
        print(f"  {len(batch)} bills ({len(by_key)} unique total)")
        time.sleep(0.5)

    return list(by_key.values())


def select_defense_candidates(candidates: list[dict], max_bills: int) -> list[dict]:
    scored: list[tuple[int, dict]] = []
    for item in candidates:
        title = item.get("title", "")
        score = defense_relevance_score(title)
        if score >= MIN_DEFENSE_SCORE:
            scored.append((score, item))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in scored[:max_bills]]


def fetch_bill_details(congress: int, bill_type: str, number: int, api_key: str) -> dict:
    base_path = f"/bill/{congress}/{bill_type.lower()}/{number}"
    detail = api_get(base_path, api_key)
    bill = detail.get("bill", detail)

    summary_text = ""
    try:
        summaries_payload = api_get(f"{base_path}/summaries", api_key, {"limit": 5})
        summaries = extract_list(summaries_payload, "summaries")
        if summaries:
            summary_text = (
                summaries[0].get("text")
                or summaries[0].get("summary")
                or summaries[0].get("actionDesc")
                or ""
            )
            summary_text = re.sub(r"<[^>]+>", " ", summary_text)
            summary_text = re.sub(r"\s+", " ", summary_text).strip()
    except urllib.error.HTTPError:
        pass

    cosponsor_names: list[str] = []
    try:
        cosponsors_payload = api_get(f"{base_path}/cosponsors", api_key, {"limit": 250})
        cosponsors = extract_list(cosponsors_payload, "cosponsors")
        for entry in cosponsors[:12]:
            name = entry.get("fullName") or entry.get("name")
            if name:
                cosponsor_names.append(name)
    except urllib.error.HTTPError:
        pass

    committee_names: list[str] = []
    try:
        committees_payload = api_get(f"{base_path}/committees", api_key)
        committees = extract_list(committees_payload, "committees")
        for entry in committees:
            name = entry.get("name") or entry.get("committeeName")
            if name:
                committee_names.append(name)
    except urllib.error.HTTPError:
        pass

    time.sleep(0.2)
    return {
        "bill": bill,
        "summary": summary_text[:1200] if summary_text else "",
        "cosponsors": cosponsor_names,
        "committees": committee_names,
    }


def map_api_bill_from_list(congress: int, item: dict) -> dict:
    bill_type = (item.get("type") or "").lower()
    number = int(item.get("number"))
    title = item.get("title") or "Untitled legislation"
    latest = item.get("latestAction") or {}
    action_text = latest.get("text") or "No latest action recorded"
    origin = item.get("originChamber") or "Congress"

    return {
        "id": bill_id(congress, bill_type, number),
        "source": "congress.gov",
        "billNumber": format_bill_number(congress, bill_type, number),
        "title": title,
        "chamber": origin,
        "congress": f"{congress}th Congress",
        "status": action_text[:120],
        "stageIndex": stage_index_from_action(action_text),
        "priority": priority_from_title(title),
        "sponsor": "See Congress.gov",
        "cosponsors": "See Congress.gov",
        "committeeReferral": "See Congress.gov committee list",
        "voteCounts": {
            "house": "See Congress.gov actions for floor votes",
            "senate": "See Congress.gov actions for floor votes",
        },
        "plainSummary": f"Official bill: {title}. Latest action: {action_text}",
        "policyAreas": policy_areas_from_title(title),
        "tags": ["congress.gov", "auto-sync"],
        "impactLenses": impact_lenses_from_title(title),
        "fundingContractSignal": (
            "Review bill text and report language for appropriations tables, contract authorities, "
            "and contractor-facing conditions."
        ),
        "regulationBonusWatch": (
            "Scan amendments and report language for compliance, sourcing, and incentive restrictions."
        ),
        "nextAction": "Validate live text, votes, and sponsors on Congress.gov before publication.",
        "congressGovUrl": congress_gov_url(congress, bill_type, number),
        "officialBill": {"congress": congress, "type": bill_type, "number": number},
    }


def map_api_bill(congress: int, item: dict, details: dict) -> dict:
    bill = details["bill"]
    bill_type = (item.get("type") or bill.get("type") or "").lower()
    number = int(item.get("number") or bill.get("number"))
    title = item.get("title") or bill.get("title") or "Untitled legislation"
    latest = item.get("latestAction") or bill.get("latestAction") or {}
    action_text = latest.get("text") or "No latest action recorded"
    origin = item.get("originChamber") or bill.get("originChamber") or "Congress"

    sponsors = bill.get("sponsors") or []
    sponsor_label = "See Congress.gov"
    if sponsors:
        first = sponsors[0]
        sponsor_label = first.get("fullName") or first.get("name") or sponsor_label

    cosponsors = details["cosponsors"]
    cosponsor_label = (
        ", ".join(cosponsors) + (" …" if len(cosponsors) >= 12 else "")
        if cosponsors
        else "None listed or not yet available"
    )

    committees = details["committees"]
    committee_label = "; ".join(committees) if committees else "See Congress.gov committee list"

    summary = details["summary"] or f"Official bill: {title}. Latest action: {action_text}"

    return {
        "id": bill_id(congress, bill_type, number),
        "source": "congress.gov",
        "billNumber": format_bill_number(congress, bill_type, number),
        "title": title,
        "chamber": origin,
        "congress": f"{congress}th Congress",
        "status": action_text[:120],
        "stageIndex": stage_index_from_action(action_text),
        "priority": priority_from_title(title),
        "sponsor": sponsor_label,
        "cosponsors": cosponsor_label,
        "committeeReferral": committee_label,
        "voteCounts": {
            "house": "See Congress.gov actions for floor votes",
            "senate": "See Congress.gov actions for floor votes",
        },
        "plainSummary": summary,
        "policyAreas": policy_areas_from_title(title),
        "tags": ["congress.gov", "auto-sync"],
        "impactLenses": impact_lenses_from_title(title),
        "fundingContractSignal": (
            "Review bill text and report language for appropriations tables, contract authorities, "
            "and contractor-facing conditions."
        ),
        "regulationBonusWatch": (
            "Scan amendments and report language for compliance, sourcing, and incentive restrictions."
        ),
        "nextAction": "Validate live text, votes, and sponsors on Congress.gov before publication.",
        "congressGovUrl": congress_gov_url(congress, bill_type, number),
        "officialBill": {"congress": congress, "type": bill_type, "number": number},
    }


def merge_bills(seeds: list[dict], official: list[dict]) -> list[dict]:
    merged: dict[str, dict] = {}
    for bill in seeds:
        merged[bill["id"]] = bill

    official_ids = {
        bill_id(
            bill["officialBill"]["congress"],
            bill["officialBill"]["type"],
            bill["officialBill"]["number"],
        )
        for bill in official
        if bill.get("officialBill")
    }

    for bill in official:
        merged[bill["id"]] = bill

    # Drop seed placeholders when an official bill with same officialBill ref exists
    for seed in seeds:
        ref = seed.get("officialBill")
        if not ref:
            continue
        key = bill_id(ref["congress"], ref["type"], ref["number"])
        if key in official_ids and seed["id"] in merged and merged[seed["id"]].get("source") == "seed":
            del merged[seed["id"]]

    return sorted(merged.values(), key=lambda bill: (bill.get("priority") != "High", bill.get("title", "")))


def run_sync(congress: int, api_key: str | None, max_bills: int, max_pages: int) -> dict:
    seed_data = load_json(SEED_PATH)
    seeds = seed_data.get("bills", [])
    official: list[dict] = []
    synced = False
    errors: list[str] = []

    if api_key:
        try:
            candidates = fetch_all_bill_candidates(congress, api_key, max_pages=max_pages)
            matched = select_defense_candidates(candidates, max_bills)
            print(
                f"Found {len(matched)} defense-related bills "
                f"(from {len(candidates)} unique bills scanned)."
            )

            for index, item in enumerate(matched, start=1):
                bill_type = (item.get("type") or "").lower()
                number = int(item.get("number"))
                label = format_bill_number(congress, bill_type, number)
                print(f"  [{index}/{len(matched)}] {label}")
                try:
                    details = fetch_bill_details(congress, bill_type, number, api_key)
                    official.append(map_api_bill(congress, item, details))
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{bill_type}{number}: {exc}")
                    official.append(map_api_bill_from_list(congress, item))
            synced = bool(official)
        except urllib.error.HTTPError as exc:
            errors.append(f"Congress.gov API error: {exc}")
        except urllib.error.URLError as exc:
            errors.append(f"Network error: {exc}")
    else:
        print("No CONGRESS_API_KEY set — writing seeds only.")

    bills = merge_bills(seeds, official)
    payload = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "congress": congress,
            "seedCount": len(seeds),
            "officialCount": len(official),
            "totalCount": len(bills),
            "syncedFromCongressGov": synced,
            "errors": errors,
        },
        "bills": bills,
    }
    save_json(OUTPUT_PATH, payload)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync DoD tracker data from Congress.gov")
    parser.add_argument("--congress", type=int, default=int(os.environ.get("CONGRESS_NUMBER", "119")))
    parser.add_argument("--max-bills", type=int, default=int(os.environ.get("SYNC_MAX_BILLS", "150")))
    parser.add_argument("--max-pages", type=int, default=int(os.environ.get("SYNC_MAX_PAGES", "10")))
    args = parser.parse_args()

    load_env_file()
    api_key = os.environ.get("CONGRESS_API_KEY", "").strip() or None
    if not SEED_PATH.exists():
        print(f"Missing seed file: {SEED_PATH}", file=sys.stderr)
        return 1

    payload = run_sync(args.congress, api_key, args.max_bills, args.max_pages)
    meta = payload["meta"]
    print(f"Wrote {meta['totalCount']} items to {OUTPUT_PATH}")
    if meta.get("errors"):
        print("Warnings:", file=sys.stderr)
        for error in meta["errors"]:
            print(f"  - {error}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
