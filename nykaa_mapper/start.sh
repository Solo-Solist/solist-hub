#!/usr/bin/env bash
# Ubuntu: start Nykaa Studio at http://localhost:8766 (Ctrl+C to stop). Same as start.bat on Windows.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv-linux/bin/python ] || ! .venv-linux/bin/python -c 'import pandas' 2>/dev/null; then
  bash ./setup.sh
fi
echo "Nykaa Studio: http://localhost:8766  (Ctrl+C to stop)"
exec .venv-linux/bin/python studio.py
