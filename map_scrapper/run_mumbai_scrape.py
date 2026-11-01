"""
Sequential Google Maps scraper runner for Mumbai Metropolitan Region.
Place this file beside gmaps_scraper.py and run run_mumbai_scrape.bat.

It creates one output folder per run, resumes completed queries, continues after
individual failures, and merges/deduplicates CSV results at the end.
"""

import csv
import re
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
SCRAPER = BASE_DIR / "gmaps_scraper.py"
OUTPUT_DIR = BASE_DIR / "mumbai_scrape_output"
QUERY_LOG = OUTPUT_DIR / "query_status.csv"
FINAL_CSV = OUTPUT_DIR / "mumbai_mmr_sweets_bakery_namkeen_farsan.csv"

# Localities covering Mumbai, Thane, Navi Mumbai, and the wider MMR.
AREAS = [
    "Mumbai", "Colaba Mumbai", "Fort Mumbai", "Churchgate Mumbai",
    "Marine Lines Mumbai", "Girgaon Mumbai", "Dadar Mumbai",
    "Matunga Mumbai", "Sion Mumbai", "Chembur Mumbai", "Kurla Mumbai",
    "Ghatkopar Mumbai", "Vikhroli Mumbai", "Powai Mumbai",
    "Andheri Mumbai", "Jogeshwari Mumbai", "Goregaon Mumbai",
    "Malad Mumbai", "Kandivali Mumbai", "Borivali Mumbai",
    "Dahisar Mumbai", "Mulund Mumbai", "Bhandup Mumbai",
    "Mira Road", "Bhayandar", "Thane", "Ghodbunder Road Thane",
    "Kalwa Thane", "Mumbra Thane", "Diva Thane",
    "Dombivli", "Kalyan", "Ulhasnagar", "Ambernath", "Badlapur",
    "Bhiwandi", "Vasai", "Nalasopara", "Virar",
    "Vashi Navi Mumbai", "Sanpada Navi Mumbai", "Nerul Navi Mumbai",
    "Belapur Navi Mumbai", "Kharghar Navi Mumbai", "Kamothe Navi Mumbai",
    "Kalamboli Navi Mumbai", "Panvel", "Airoli Navi Mumbai",
    "Ghansoli Navi Mumbai", "Kopar Khairane Navi Mumbai",
    "Turbhe Navi Mumbai", "Juinagar Navi Mumbai", "Ulwe Navi Mumbai",
]

# Separate query types help surface businesses that use different labels.
CATEGORIES = [
    "sweet shops",
    "mithai shops",
    "cake shops",
    "pastry shops",
    "bakeries",
    "namkeen shops",
    "farsan shops",
    "Indian snack shops",
]

MAX_RESULTS_PER_QUERY = 500

# Set to False if you want Chromium hidden. True matches the user's current
# --no-headless workflow and lets them observe the browser.
SHOW_BROWSER = True

# Small pause between queries. This is not intended to bypass rate limits.
PAUSE_SECONDS = 3


def slug(text):
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    return text[:100] or "query"


def build_queries():
    return [f"{category} in {area}" for area in AREAS for category in CATEGORIES]


def read_csv(path):
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except (OSError, csv.Error):
        return []


def is_completed(csv_path):
    # Resume only when a previous output exists and has at least a header.
    return csv_path.exists() and csv_path.stat().st_size > 20


def run_queries():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not SCRAPER.exists():
        print(f"ERROR: Could not find {SCRAPER}")
        print("Put this runner beside gmaps_scraper.py, then run it again.")
        return False

    queries = build_queries()
    total = len(queries)
    status_rows = []

    print(f"Queries planned: {total}")
    print(f"Output folder: {OUTPUT_DIR}")
    print("Each query runs sequentially. Do not close this window until finished.\n")

    for index, query in enumerate(queries, start=1):
        output_base = OUTPUT_DIR / f"{index:03d}_{slug(query)}"
        csv_path = Path(str(output_base) + ".csv")
        json_path = Path(str(output_base) + ".json")

        if is_completed(csv_path):
            rows = read_csv(csv_path)
            print(f"[{index}/{total}] SKIP (already saved): {query} — {len(rows)} rows")
            status_rows.append({"query": query, "status": "skipped_existing", "csv": str(csv_path), "rows": len(rows)})
            continue

        command = [
            sys.executable,
            str(SCRAPER),
            query,
            "-n", str(MAX_RESULTS_PER_QUERY),
            "-o", str(output_base),
        ]
        if SHOW_BROWSER:
            command.append("--no-headless")

        print("\n" + "=" * 80)
        print(f"[{index}/{total}] {query}")
        print("Running:", subprocess.list2cmdline(command))
        print("=" * 80)

        started = time.time()
        try:
            # Inherit console output so progress from gmaps_scraper.py is visible.
            completed = subprocess.run(command, cwd=str(BASE_DIR), check=False)
            rows = read_csv(csv_path)
            elapsed = round(time.time() - started, 1)
            status = "success" if completed.returncode == 0 else f"failed_exit_{completed.returncode}"
            print(f"Finished: {status}; rows saved: {len(rows)}; elapsed: {elapsed}s")
            status_rows.append({
                "query": query,
                "status": status,
                "csv": str(csv_path) if csv_path.exists() else "",
                "rows": len(rows),
            })
        except KeyboardInterrupt:
            print("\nInterrupted by user. Existing outputs are preserved.")
            write_status(status_rows)
            merge_outputs()
            return False
        except Exception as exc:
            print(f"ERROR running query: {exc}")
            status_rows.append({"query": query, "status": f"error: {exc}", "csv": "", "rows": 0})

        write_status(status_rows)
        time.sleep(PAUSE_SECONDS)

    write_status(status_rows)
    merge_outputs()
    print("\nALL QUERIES FINISHED.")
    print(f"Final deduplicated CSV: {FINAL_CSV}")
    print(f"Query status log: {QUERY_LOG}")
    return True


def write_status(rows):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with QUERY_LOG.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["query", "status", "csv", "rows"])
        writer.writeheader()
        writer.writerows(rows)


def norm(value):
    return re.sub(r"\s+", " ", (value or "").strip().lower())


def merge_outputs():
    all_rows = []
    for csv_file in sorted(OUTPUT_DIR.glob("*.csv")):
        if csv_file.name in {FINAL_CSV.name, QUERY_LOG.name}:
            continue
        all_rows.extend(read_csv(csv_file))

    # Keep columns produced by the current scraper.
    preferred_fields = [
        "name", "category", "rating", "reviews_count", "address", "phone",
        "website", "lat", "lng", "plus_code", "place_id", "url",
    ]
    extra_fields = []
    for row in all_rows:
        for key in row:
            if key not in preferred_fields and key not in extra_fields:
                extra_fields.append(key)
    fields = preferred_fields + extra_fields

    unique = {}
    for row in all_rows:
        place_id = norm(row.get("place_id"))
        url = norm(row.get("url")).split("?")[0].rstrip("/")
        name = norm(row.get("name"))
        address = norm(row.get("address"))

        if place_id:
            key = "id:" + place_id
        elif url:
            key = "url:" + url
        elif name and address:
            key = "name_address:" + name + "|" + address
        elif name:
            key = "name_only:" + name
        else:
            continue

        # Prefer the row with more filled fields if duplicate records differ.
        existing = unique.get(key)
        filled = sum(1 for value in row.values() if value and value.strip())
        old_filled = sum(1 for value in existing.values() if value and value.strip()) if existing else -1
        if existing is None or filled > old_filled:
            unique[key] = row

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with FINAL_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(unique.values())

    print(f"\nMerge summary: {len(all_rows)} collected rows -> {len(unique)} unique rows")


if __name__ == "__main__":
    run_queries()
