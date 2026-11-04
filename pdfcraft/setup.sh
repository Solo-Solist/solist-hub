#!/usr/bin/env bash
# One-time setup for Solist PDF (Linux / macOS). Needs Node.js 20 or newer.
set -euo pipefail
cd "$(dirname "$0")"
command -v npm >/dev/null || { echo "Node.js is needed: https://nodejs.org (version 20+)"; exit 1; }
npm ci && NEXT_PUBLIC_LOCALES=en npm run build
rm -rf node_modules  # only the built site is needed to run; setup installs these again
echo "Setup finished. Start with ./start.sh"
