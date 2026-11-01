#!/usr/bin/env bash
# Start Solist PDF at http://localhost:8090 (Ctrl+C to stop).
set -euo pipefail
cd "$(dirname "$0")"
[ -f out/index.html ] || bash ./setup.sh
echo "Solist PDF: http://localhost:8090  (Ctrl+C to stop)"

exec python3 ../hub/static_server.py out 8090
