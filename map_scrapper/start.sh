#!/usr/bin/env bash
# Ubuntu: start the Maps Scraper dashboard at http://localhost:5000 (Ctrl+C to stop).
set -euo pipefail
cd "$(dirname "$0")"
[ -x .venv-linux/bin/python ] || bash ./setup.sh
echo "Maps Scraper: http://localhost:5000  (Ctrl+C to stop)"
exec .venv-linux/bin/python gmaps_dashboard.py
