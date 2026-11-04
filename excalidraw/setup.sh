#!/usr/bin/env bash
# One-time setup for Solist Draw (Linux / macOS). Needs Node.js 18 or newer.
set -euo pipefail
cd "$(dirname "$0")"
command -v npx >/dev/null || { echo "Node.js is needed: https://nodejs.org (version 18+)"; exit 1; }
npx --yes yarn@1.22.22 install --frozen-lockfile && npx --yes yarn@1.22.22 build:app:docker
echo "Setup finished. Start with ./start.sh"
