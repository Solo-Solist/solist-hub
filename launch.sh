#!/usr/bin/env bash
# Linux / macOS: open Solist Hub at http://localhost:9000. Pass --no-window for a normal browser tab.
exec bash "$(cd "$(dirname "$0")" && pwd)/hub/launch.sh" "$@"
