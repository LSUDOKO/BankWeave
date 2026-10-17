"""Hardware-backed approval signatures over a case's Merkle root.

Two signers, both verified here with real ECDSA P-256 (COSE alg -7, ES256):
  * WebAuthn: a platform/roaming authenticator (or Chrome's virtual authenticator) signs
    authenticatorData || SHA-256(clientDataJSON), where clientDataJSON.challenge is the
    Merkle root. We check type, challenge, signature and read the signature counter.
  * VaultKey (virtual, SIMULATED device): a WebCrypto P-256 key held in the browser signs
    the Merkle root hex string directly.
The result is stored as (:HardwareAttestation)-[:ATTESTS]->(:Action|:SAR) in the case graph.
If evidence later changes, the case root no longer equals the signed root: seal broken.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from app import db
from app.cypher import cy
from app.services import merkle

STORE = cy("hw_attestation_store", "Store a hardware attestation that seals an action", """
MATCH (t) WHERE (t:Action OR t:SAR) AND t.id = $target
CREATE (h:HardwareAttestation {id:$id, method:$method, merkle_root:$root, alg:-7,
        credential_id:$cred, aaguid:$aaguid, counter:$counter, public_key:$pk,
        signature:$sig, origin:$origin, ts:timestamp(), device:$device})
CREATE (h)-[:ATTESTS]->(t)
RETURN h.id AS id
""")

LIST = cy("hw_attestation_list", "Hardware attestations in a case", """
MATCH (h:HardwareAttestation)-[:ATTESTS]->(t)
RETURN h.id AS id, h.method AS method, h.merkle_root AS merkle_root, h.alg AS alg,
       h.credential_id AS credential_id, h.aaguid AS aaguid, h.counter AS counter,
       h.ts AS ts, h.device AS device, h.origin AS origin, t.id AS target, labels(t)[0] AS target_type
ORDER BY ts DESC
""")


def b64d(s: str) -> bytes:
    s = s.replace("-", "+").replace("_", "/")
    return base64.b64decode(s + "=" * (-len(s) % 4))


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _pub(spki_b64: str) -> ec.EllipticCurvePublicKey:
    key = serialization.load_der_public_key(b64d(spki_b64))
    if not isinstance(key, ec.EllipticCurvePublicKey) or key.curve.name != "secp256r1":
        raise ValueError("expected an ES256 (P-256) public key")
    return key


def parse_auth_data(ad: bytes) -> dict:
    flags = ad[32]
    out = {"rp_id_hash": ad[:32].hex(), "user_present": bool(flags & 1),
           "user_verified": bool(flags & 4), "counter": int.from_bytes(ad[33:37], "big")}
    if flags & 0x40 and len(ad) >= 55:  # attested credential data (registration)
        aaguid = ad[37:53].hex()
        out["aaguid"] = "-".join([aaguid[:8], aaguid[8:12], aaguid[12:16], aaguid[16:20], aaguid[20:]])
    return out


def verify_webauthn(root_hex: str, a: dict) -> dict:
    client = json.loads(b64d(a["client_data_json"]))
    if client.get("type") != "webauthn.get":
        raise ValueError("clientData.type must be webauthn.get")
    if client.get("challenge") != b64url(bytes.fromhex(root_hex)):
        raise ValueError("challenge is not this case's Merkle root")
    ad = b64d(a["authenticator_data"])
    signed = ad + hashlib.sha256(b64d(a["client_data_json"])).digest()
    try:
        _pub(a["public_key"]).verify(b64d(a["signature"]), signed, ec.ECDSA(hashes.SHA256()))
    except InvalidSignature as exc:
        raise ValueError("WebAuthn signature does not verify") from exc
    info = parse_auth_data(ad)
    if a.get("registration_authenticator_data"):
        info["aaguid"] = parse_auth_data(b64d(a["registration_authenticator_data"])).get("aaguid")
    return {**info, "origin": client.get("origin")}


def verify_vaultkey(root_hex: str, a: dict) -> dict:
    raw = b64d(a["signature"])  # WebCrypto returns r||s, 32 bytes each
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    try:
        _pub(a["public_key"]).verify(der, root_hex.encode(), ec.ECDSA(hashes.SHA256()))
    except InvalidSignature as exc:
        raise ValueError("VaultKey signature does not verify") from exc
    return {"counter": int(a.get("counter", 0)), "aaguid": "00000000-0000-0000-0000-000000000000",
            "origin": a.get("origin")}


def attest(case_id: str, target: str, method: str, root_hex: str, a: dict) -> dict:
    current = merkle.case_root(case_id)["root"]
    if root_hex != current:
        raise ValueError("the signed root is not the case's current Merkle root")
    info = verify_webauthn(root_hex, a) if method == "webauthn" else verify_vaultkey(root_hex, a)
    hid = "HW-" + secrets.token_hex(4)
    rows = db.q(db.case_graph(case_id), STORE, {
        "target": target, "id": hid, "method": method, "root": root_hex,
        "cred": a.get("credential_id", "vaultkey"), "aaguid": info.get("aaguid"),
        "counter": info.get("counter", 0), "pk": a["public_key"], "sig": a["signature"],
        "origin": info.get("origin"), "device": a.get("device", method)})
    if not rows:
        raise ValueError(f"no action or SAR {target} in case {case_id}")
    return {"id": hid, "case_id": case_id, "target": target, "method": method,
            "merkle_root": root_hex, "alg": "ES256 (-7)", **info, "verified": True,
            "ts": int(time.time() * 1000)}


def seal(case_id: str) -> dict:
    current = merkle.case_root(case_id)["root"]
    rows = db.ro(db.case_graph(case_id), LIST)
    for r in rows:
        r["intact"] = r["merkle_root"] == current
    return {"current_root": current, "attestations": rows,
            "broken": [r["id"] for r in rows if not r["intact"]]}
