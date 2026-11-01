#!/usr/bin/env bash
# Ubuntu: one-time setup for the Nykaa Scraper.
# Makes .venv-linux (Windows keeps its own .venv in this folder) and installs requirements.txt.
set -euo pipefail
cd "$(dirname "$0")"
VENV=.venv-linux

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  echo "Python 3.10 or newer is needed. Install it with:"
  echo "  sudo apt update && sudo apt install -y python3 python3-venv python3-pip"
  exit 1
fi
if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating $VENV ..."
  if ! python3 -m venv "$VENV"; then
    rm -rf "$VENV"
    echo "Could not create the Python environment. Install venv support with:"
    echo "  sudo apt install -y python3-venv"
    exit 1
  fi
fi
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install -r requirements.txt
echo "Downloading the browsers Scrapling uses (one time) ..."
"$VENV/bin/scrapling" install || {
  echo "[warn] 'scrapling install' failed. If the browser later complains about missing libraries, run:"
  echo "  sudo \"$PWD/$VENV/bin/python\" -m playwright install-deps chromium"
}
echo "Setup finished. Start with ./start.sh"
