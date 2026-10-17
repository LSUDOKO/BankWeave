"""Private set intersection between two banks: ECDH-PSI over Curve25519.

Each bank hashes its items to 32-byte X25519 u-coordinates and multiplies them by a secret
scalar. Scalar multiplication commutes, so a·(b·H(x)) equals b·(a·H(y)) exactly when x == y,
and neither bank sees the other's raw items. Real X25519 arithmetic (via `cryptography`),
run in one process here so the transcript can be shown; in production each side runs at its
own bank and the secret scalars stay sealed in the enclave.
"""
from __future__ import annotations

import hashlib
import random
import time

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey

from app import db
from app.cypher import cy

ITEMS = cy("psi_bank_identity_items", "Identity attributes used by a bank's own customers", """
MATCH (a:Account)-[:USES_DEVICE|USES_IP|REGISTERED_AT]->(x)
RETURN DISTINCT x.id AS item
""")


def hash_to_point(item: str) -> bytes:
    return hashlib.sha256(b"bankweave-psi:" + item.encode()).digest()


def blind(points: list[bytes], k: X25519PrivateKey) -> list[bytes]:
    """k·P for each u-coordinate P (clamped scalars clear the cofactor)."""
    return [k.exchange(X25519PublicKey.from_public_bytes(p)) for p in points]


def handshake(bank_a: str, bank_b: str) -> dict:
    t0 = time.perf_counter()
    a_items = [r["item"] for r in db.ro(db.bank_graph(bank_a), ITEMS)]
    b_items = [r["item"] for r in db.ro(db.bank_graph(bank_b), ITEMS)]
    ka, kb = X25519PrivateKey.generate(), X25519PrivateKey.generate()
    # round 1: each bank sends its blinded set
    a1 = blind([hash_to_point(x) for x in a_items], ka)
    b1 = blind([hash_to_point(y) for y in b_items], kb)
    # round 2: B re-blinds A's values in order (so A can map back); A re-blinds B's, shuffled
    a2 = blind(a1, kb)
    b2 = blind(b1, ka)
    random.SystemRandom().shuffle(b2)
    b2set = set(b2)
    shared = [a_items[i] for i, v in enumerate(a2) if v in b2set]  # only bank A learns these
    ms = round((time.perf_counter() - t0) * 1000, 1)
    return {"protocol": "ECDH-PSI over Curve25519 (X25519 scalar multiplication), SHA-256 hash",
            "bank_a": bank_a, "bank_b": bank_b, "a_items": len(a_items), "b_items": len(b_items),
            "intersection": len(shared), "a_learns": shared[:25],
            "transcript": {"a_to_b_round1": [v.hex()[:24] + "…" for v in a1[:3]],
                           "b_to_a_round1": [v.hex()[:24] + "…" for v in b1[:3]],
                           "b_to_a_round2": [v.hex()[:24] + "…" for v in a2[:3]]},
            "scalar_mults": 2 * (len(a_items) + len(b_items)), "ms": ms,
            "note": "Bank B learns only the size of A's set; raw identifiers never cross."}
