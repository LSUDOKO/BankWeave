"""Capture real API responses into the frontend bundle so pages render when the API sleeps.

Usage: python scripts/capture_snapshots.py [API_URL]   (default http://localhost:8000)
Writes frontend/src/snapshots/index.json keyed by API path.
"""
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
PATHS = ["/overview", "/scenarios", "/lab/graphs", "/lab/algorithms", "/lab/tools", "/lab/udf",
         "/eval", "/eval/curve", "/health"]
OUT = Path(__file__).resolve().parents[1] / "frontend" / "src" / "snapshots" / "index.json"

snap = {"_meta": {"captured_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                  "source": API}}
for p in PATHS:
    try:
        with urllib.request.urlopen(API + p, timeout=60) as r:
            snap[p] = json.loads(r.read())
        print(f"ok   {p} ({len(json.dumps(snap[p])) // 1024} KB)")
    except Exception as exc:  # noqa: BLE001
        print(f"skip {p}: {exc}")
OUT.write_text(json.dumps(snap, separators=(",", ":"), default=str))
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
