#!/usr/bin/env bash
# Rebuild every graph from scratch: transactions, identity layer, KYC table, detectors.
# Usage: scripts/seed_all.sh [path/to/X_Trans.csv] [extra loader args]
set -euo pipefail
cd "$(dirname "$0")/../backend"
DEFAULT=../data/demo/DEMO_Trans.csv
[[ -f ../data/slice/IBM_SLICE_Trans.csv ]] && DEFAULT=../data/slice/IBM_SLICE_Trans.csv
TRANS="${1:-$DEFAULT}"; shift || true
TOPN=()
[[ "$TRANS" == *IBM_SLICE* ]] && TOPN=(--top-n 6)
uv run python -m app.services.loader --trans "$TRANS" "${TOPN[@]}" "$@"
uv run python -m app.services.kyc_synth ${KYC_ARGS:-}
if uv run python -c "import detection.precompute" 2>/dev/null; then
  uv run python -m detection.precompute
fi
