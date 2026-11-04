#!/usr/bin/env bash
# Linux / macOS: set up every project (or only the ones named: ./setup.sh pdfcraft excalidraw).
cd "$(dirname "$0")"
PROJECTS=("${@:-map_scrapper nykaa-scraper nykaa_mapper pdfcraft excalidraw}")
failed=()
for p in ${PROJECTS[@]}; do
  echo; echo "=== Setting up $p ==="
  bash "$p/setup.sh" || failed+=("$p")
done
echo
if [ ${#failed[@]} -gt 0 ]; then echo "Setup failed for: ${failed[*]} (scroll up for the reason)"; exit 1; fi
echo "All set. Start everything with ./launch.sh"
