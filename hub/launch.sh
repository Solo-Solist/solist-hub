#!/usr/bin/env bash
# Ubuntu: start Solist Hub as its own app window (Chrome / Chromium / Edge app mode), http://localhost:9000.
# Pass --no-window to open it in a normal browser tab instead. Standard-library Python only.
set -euo pipefail
cd "$(dirname "$0")"

if [ -x ".venv-linux/bin/python" ]; then
    PYTHON=".venv-linux/bin/python"
elif [ -x ".venv/bin/python" ]; then
    PYTHON=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 8))'; then
    PYTHON="python3"
else
    echo "Python 3.8 or newer is needed. Install it with: sudo apt install -y python3  (macOS: brew install python)"
    exit 1
fi

if [ "${1:-}" = "--no-window" ]; then
    exec "$PYTHON" hub.py
fi
exec "$PYTHON" hub.py --app
