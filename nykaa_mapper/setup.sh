#!/usr/bin/env bash
# Ubuntu: one-time setup for Nykaa Studio (nykaa_mapper).
# Makes .venv-linux (Windows keeps its own .venv in this folder) and installs requirements.txt.
set -euo pipefail
cd "$(dirname "$0")"
VENV=.venv-linux

if ! command -v python3 >/dev/null 2>&1 || ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))'; then
  echo "Python 3.11 or newer is needed. Install it with:"
  echo "  Ubuntu: sudo apt update && sudo apt install -y python3 python3-venv python3-pip"
  echo "  macOS:  brew install python"
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
echo "Setup finished. Start with ./start.sh"
