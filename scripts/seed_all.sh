#!/usr/bin/env bash
# Rebuild every graph from scratch: transactions, identity layer, KYC table, detectors.
# Usage: scripts/seed_all.sh [path/to/X_Trans.csv] [extra loader args]
set -euo pipefail
cd "$(dirname "$0")/../backend"
TRANS="${1:-../data/demo/DEMO_Trans.csv}"; shift || true
uv run python -m app.services.loader --trans "$TRANS" "$@"
uv run python -m app.services.kyc_synth
if uv run python -c "import detection.precompute" 2>/dev/null; then
  uv run python -m detection.precompute
fi
