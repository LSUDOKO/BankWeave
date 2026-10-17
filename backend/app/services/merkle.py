"""Case Merkle root: a single hash over everything an approval rests on.

Leaves are the case's claims, evidence (with the query that produced it and its validity
state) and report sentences, in canonical JSON, sorted by (type, id). Hashing follows
RFC 6962: leaf = SHA-256(0x00 || data), node = SHA-256(0x01 || left || right), an odd node is
carried up unchanged. If any piece of evidence is later superseded, the root changes, so an
approval signed over the old root shows "Merkle seal broken".
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from functools import lru_cache

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app import db
from app.cypher import cy

LEAVES = cy("merkle_case_leaves", "Records sealed by the case Merkle root", """
MATCH (c:Claim)
RETURN 'Claim' AS type, c.id AS id,
       {text:c.text, kind:c.kind, state:coalesce(c.state, 'active')} AS body
UNION ALL
MATCH (e:Evidence)
RETURN 'Evidence' AS type, e.id AS id,
       {kind:e.kind, origin:e.origin, summary:e.summary, cypher:e.cypher, payload:e.payload,
        state:coalesce(e.state, 'active')} AS body
UNION ALL
MATCH (s:Sentence)
OPTIONAL MATCH (s)-[:CITES]->(n)
WITH s, collect(n.id) AS cites
RETURN 'Sentence' AS type, s.id AS id,
       {text:s.text, supported:s.supported, cites:cites, state:coalesce(s.state, 'active')} AS body
""")


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str).encode()


def leaf_hash(data: bytes) -> bytes:
    return hashlib.sha256(b"\x00" + data).digest()


def node_hash(left: bytes, right: bytes) -> bytes:
    return hashlib.sha256(b"\x01" + left + right).digest()


def root_of(leaves: list[bytes]) -> bytes:
    if not leaves:
        return hashlib.sha256(b"").digest()
    level = leaves
    while len(level) > 1:
        nxt = [node_hash(level[i], level[i + 1]) for i in range(0, len(level) - 1, 2)]
        if len(level) % 2:
            nxt.append(level[-1])
        level = nxt
    return level[0]


def execution_hash(cypher: str | None, payload: str | None) -> str:
    """Hash of the query an agent ran and the rows it got back."""
    return hashlib.sha256(((cypher or "") + "\n" + (payload or "")).encode()).hexdigest()


def case_leaves(case_id: str) -> list[dict]:
    rows = db.ro(db.case_graph(case_id), LEAVES)
    out = []
    for r in sorted(rows, key=lambda r: (r["type"], r["id"])):
        rec = {"type": r["type"], "id": r["id"], **r["body"]}
        out.append({"type": r["type"], "id": r["id"], "state": r["body"].get("state"),
                    "hash": leaf_hash(canonical(rec)).hex()})
    return out


def case_root(case_id: str) -> dict:
    leaves = case_leaves(case_id)
    root = root_of([bytes.fromhex(x["hash"]) for x in leaves])
    return {"case_id": case_id, "root": root.hex(), "leaves": leaves, "count": len(leaves),
            "algorithm": "SHA-256, RFC 6962 leaf/node prefixes"}


@lru_cache
def _key() -> tuple[Ed25519PrivateKey, str]:
    seed = os.getenv("DOSSIER_SIGNING_KEY")
    if seed:
        return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(seed)), "configured key"
    return Ed25519PrivateKey.generate(), "ephemeral key (set DOSSIER_SIGNING_KEY to persist)"


def sign(message: bytes) -> dict:
    key, source = _key()
    pub = key.public_key().public_bytes_raw()
    return {"algorithm": "Ed25519", "signature": base64.b64encode(key.sign(message)).decode(),
            "public_key": base64.b64encode(pub).decode(), "key_source": source}
