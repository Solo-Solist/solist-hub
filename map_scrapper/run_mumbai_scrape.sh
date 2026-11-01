#!/usr/bin/env bash
# Ubuntu version of run_mumbai_scrape.bat: runs every Mumbai query in turn and merges the CSV results.
set -uo pipefail
cd "$(dirname "$0")"

echo "============================================================"
echo "Mumbai MMR sweets, cakes, pastries, namkeen and farsan scrape"
echo "============================================================"
echo
echo "This will run every query sequentially and merge CSV results."
echo "Keep this window open until it says ALL QUERIES FINISHED."
echo

if [ -x .venv-linux/bin/python ]; then
  .venv-linux/bin/python run_mumbai_scrape.py
else
  python3 run_mumbai_scrape.py
fi

echo
echo "Runner exited. Check the mumbai_scrape_output folder."
