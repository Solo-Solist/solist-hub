#!/usr/bin/env bash
# Ubuntu: put Solist Hub online through ngrok, behind a username and password (see share.py).
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
command -v python3 >/dev/null 2>&1 || { echo "Python 3 is needed: sudo apt install -y python3"; exit 1; }
PYTHONDONTWRITEBYTECODE=1 exec python3 share.py "$@"
