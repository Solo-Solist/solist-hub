#!/usr/bin/env bash
# Ubuntu: start the Nykaa Scraper dashboard at http://localhost:8765 (Ctrl+C to stop).
set -euo pipefail
cd "$(dirname "$0")"
[ -x .venv-linux/bin/python ] || bash ./setup.sh
echo "Nykaa Scraper: http://localhost:8765  (Ctrl+C to stop)"
exec .venv-linux/bin/python dashboard.py
