#!/usr/bin/env bash
# Start Solist Draw at http://localhost:8093 (Ctrl+C to stop).
set -euo pipefail
cd "$(dirname "$0")"
[ -f excalidraw-app/build/index.html ] || bash ./setup.sh
echo "Solist Draw: http://localhost:8093  (Ctrl+C to stop)"

exec python3 ../hub/static_server.py excalidraw-app/build 8093
