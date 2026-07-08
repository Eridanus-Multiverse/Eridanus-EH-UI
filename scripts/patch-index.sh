#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="${1:-dist}"

bash "${SCRIPT_DIR}/patch-pwa.sh" "${DIST}"
