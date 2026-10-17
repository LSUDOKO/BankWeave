#!/usr/bin/env bash
# Rebuild the demo to a known state: demo graphs, identity layer, precompute, fresh alerts,
# no cases, no tasks. Run before recording or presenting.
set -euo pipefail
cd "$(dirname "$0")/../backend"
uv run python - <<'PY'
from app import db
for g in db.case_graphs():
    db.drop_graph(g)
db.drop_graph(db.PROCEDURES)
PY
../scripts/seed_all.sh
uv run python -m knowledge.typology_kb >/dev/null
uv run python -m app.services.baseline
echo "Demo reset. Start the agents from Demo control (or: uv run python -m agents.worker)."
