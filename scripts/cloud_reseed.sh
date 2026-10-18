#!/usr/bin/env bash
# Rebuild the live FalkorDB Cloud graphs in compact form (the free tier has 100 MB and
# noeviction). Keeps the case graphs listed in PINNED_CASES and re-mirrors them.
# Usage: PINNED_CASES=C-44c08392 scripts/cloud_reseed.sh
set -euo pipefail
cd "$(dirname "$0")/../backend"
set -a; . ../.env; set +a
export FALKORDB_HOST="$CLOUD_FALKORDB_HOST" FALKORDB_PORT="$CLOUD_FALKORDB_PORT"
export FALKORDB_USERNAME="$CLOUD_FALKORDB_USERNAME" FALKORDB_PASSWORD="$CLOUD_FALKORDB_PASSWORD"
export GRAPH_PREFIX="" PINNED_CASES="${PINNED_CASES:-}"
SNAP=$(mktemp)

uv run python - "$SNAP" <<'PY'
import json, sys
from app import db
from app.services import capacity
pinned = [c for c in __import__("os").environ["PINNED_CASES"].split(",") if c]
keep = []
for cid in pinned:
    g = db.case_graph(cid)
    if g not in db.list_graphs():
        continue
    case = db.ro(g, "MATCH (c:Case) RETURN properties(c) AS p")[0]["p"]
    claims = db.ro(g, "MATCH (c:Claim) OPTIONAL MATCH (c)-[:ABOUT]->(a:Account) "
                      "RETURN c.id AS id, c.text AS text, c.kind AS kind, collect(a.id) AS about")
    keep.append({"case": case, "claims": claims})
json.dump(keep, open(sys.argv[1], "w"))
r = db.get_db().connection
for g in db.list_graphs():  # DEL works even when the instance is out of memory
    if (db.is_case_graph(g) and db.case_id_of(g) not in pinned) or g == db.CONSORTIUM \
            or g.startswith("bank_") or g == db.PROCEDURES:
        r.delete(g)
print("freed:", capacity.memory())
PY

uv run python -m app.services.loader --trans ../data/slice/IBM_SLICE_Trans.csv --top-n 6
uv run python -c "from app.services import kyc_synth; print(kyc_synth.run(with_postgres=False, compact=True))"
uv run python -m detection.precompute >/dev/null
uv run python -m app.services.baseline
uv run python -m agents.calibrate

uv run python - "$SNAP" <<'PY'
import json, sys
from app import db
from app.services import capacity
for k in json.load(open(sys.argv[1])):
    c = k["case"]
    db.q(db.CONSORTIUM, "MERGE (k:Case {id:$id}) SET k.status=$status, k.opened_at=$t, "
         "k.seed_account=$acct, k.title=$title WITH k OPTIONAL MATCH (al:Alert {id:$alert}) "
         "FOREACH (_ IN CASE WHEN al IS NULL THEN [] ELSE [1] END | "
         "MERGE (k)-[:OPENED_FROM]->(al) SET al.status='case', al.case_id=$id)",
         {"id": c["id"], "status": c.get("status", "open"), "t": c.get("opened_at", 0),
          "acct": c.get("seed_account"), "title": c.get("title", ""), "alert": c.get("seed_alert")})
    for cl in k["claims"]:
        db.q(db.CONSORTIUM, "MATCH (k:Case {id:$case}) MERGE (c:Claim {id:$id}) "
             "SET c.text=$text, c.kind=$kind, c.state='active', c.case_id=$case "
             "MERGE (k)-[:HAS_CLAIM]->(c) WITH c UNWIND $about AS aid "
             "MATCH (a:Account {id:aid}) MERGE (c)-[:ABOUT]->(a)",
             {"case": c["id"], **{x: cl[x] for x in ("id", "text", "kind", "about")}})
    print("re-mirrored", c["id"], len(k["claims"]), "claims")
print("memory:", capacity.memory())
PY
rm -f "$SNAP"
