import base64
import hashlib
import json

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from app import db
from app.services import attestation, capacity, merkle, pos_twin, psi
from app.services.hardware_enclave import Enclave
from trust import store


def test_enclave_quarantines_on_tamper_and_recovers():
    e = Enclave()
    assert e.attest()["verified"] and e.blind("x") == e.blind("x")
    out = e.tamper()
    assert out["status"] == "QUARANTINED" and not out["verified"]
    with pytest.raises(PermissionError):
        e.blind("x")
    assert e.reset()["status"] == "ATTESTED"


def test_ecdh_psi_finds_exactly_the_shared_items():
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
    ka, kb = X25519PrivateKey.generate(), X25519PrivateKey.generate()
    a, b = ["D1", "D2", "IP9"], ["D2", "IP9", "AD7"]
    a2 = psi.blind(psi.blind([psi.hash_to_point(x) for x in a], ka), kb)
    b2 = set(psi.blind(psi.blind([psi.hash_to_point(y) for y in b], kb), ka))
    assert [a[i] for i, v in enumerate(a2) if v in b2] == ["D2", "IP9"]


def test_emv_tlv_roundtrip_and_ifd_serial():
    hexs = pos_twin.tlv("9F1E", "D0006301".encode().hex()) + pos_twin.tlv("9F27", "80")
    assert hexs.startswith("9F1E084430303036333031")
    parsed = pos_twin.parse_tlv(hexs)
    assert [(t["tag"], t["value"]) for t in parsed] == [("9F1E", "4430303036333031"), ("9F27", "80")]
    assert pos_twin.bcd("123") == "123F"


def _vaultkey_sign(root: str):
    k = ec.generate_private_key(ec.SECP256R1())
    r, s = decode_dss_signature(k.sign(root.encode(), ec.ECDSA(hashes.SHA256())))
    spki = k.public_key().public_bytes(serialization.Encoding.DER,
                                       serialization.PublicFormat.SubjectPublicKeyInfo)
    return {"public_key": base64.b64encode(spki).decode(),
            "signature": base64.b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode()}


def _webauthn_sign(root: str):
    k = ec.generate_private_key(ec.SECP256R1())
    client = json.dumps({"type": "webauthn.get", "origin": "http://localhost:3000",
                         "challenge": attestation.b64url(bytes.fromhex(root))}).encode()
    auth = hashlib.sha256(b"localhost").digest() + bytes([0x05]) + (7).to_bytes(4, "big")
    sig = k.sign(auth + hashlib.sha256(client).digest(), ec.ECDSA(hashes.SHA256()))
    spki = k.public_key().public_bytes(serialization.Encoding.DER,
                                       serialization.PublicFormat.SubjectPublicKeyInfo)
    b = lambda x: base64.b64encode(x).decode()  # noqa: E731
    return {"public_key": b(spki), "signature": b(sig), "authenticator_data": b(auth),
            "client_data_json": b(client), "credential_id": "cred-1"}


def test_signatures_seal_the_root_and_break_on_revocation():
    cid = store.open_case("AL-hw", "hw-a", ["001"], "hardware test", case_id="HW-1")
    try:
        e = store.add_evidence(cid, "path", "flow:x", "x pays y", {}, "MATCH ...", "t")
        cl = store.add_claim(cid, "x is a mule", "mule", [e], "t", ["hw-a"])
        aid = store.propose_action(cid, "escalate", [cl], "test", "hw-a", "t")
        root = merkle.case_root(cid)["root"]
        v = attestation.attest(cid, aid, "vaultkey", root, _vaultkey_sign(root))
        w = attestation.attest(cid, aid, "webauthn", root, _webauthn_sign(root))
        assert v["verified"] and w["counter"] == 7 and w["user_verified"]
        with pytest.raises(ValueError):  # a signature over another message is rejected
            bad = _vaultkey_sign(root)
            bad["signature"] = _vaultkey_sign("00" * 32)["signature"]
            attestation.attest(cid, aid, "vaultkey", root, bad)
        assert attestation.seal(cid)["broken"] == []
        from trust import validity
        validity.invalidate_evidence(cid, e, "wrong")
        assert len(attestation.seal(cid)["broken"]) == 2
    finally:
        capacity.drop_case(cid)
