#!/usr/bin/env bash
# Run every experiment. GRAPH_PREFIX=ibm_ evaluates the IBM HI-Small load.
set -euo pipefail
cd "$(dirname "$0")"
PY="../backend/.venv/bin/python"
for e in e1_alert_triage e2_consortium e3_spnsa e4_passthrough e5_clue e6_trust e7_performance; do
  echo "== $e"; $PY "$e.py" "$@" || echo "!! $e failed"
done
