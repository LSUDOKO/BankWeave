"""SIMULATED hardware enclave (HSM/TEE) that owns the consortium blinding key.

Nothing here runs in real secure hardware; the cryptography is real. The "enclave image" is
the source of the blinding function below. PCR0 is the SHA-384 of that image, PCR1 of the
runtime config, PCR2 of the application id, as in an AWS Nitro attestation document. On
every attestation the measured PCRs are compared with the reference values recorded at
boot. If the image changes (POST /hardware/enclave-tamper), attestation fails, the enclave
goes QUARANTINED and refuses to blind ids until it is reset. Each attestation is written to
the consortium graph as an (:EnclaveAttestation) node.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from dataclasses import dataclass, field

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app import db
from app.config import get_settings
from app.cypher import cy

MODULE_ID = "enc-bankweave-ap-south-1"

IMAGE = '''
def blind(secret: bytes, account_id: str) -> str:
    """Consortium id for a bank account: keyed hash, the key never leaves the enclave."""
    return hmac.new(secret, account_id.encode(), hashlib.sha256).hexdigest()[:16]
'''
RUNTIME = json.dumps({"vcpus": 2, "memory_mib": 512, "debug_mode": False, "kms": "sealed"},
                     sort_keys=True)
APP_ID = "bankweave/consortium-blinding/v2"

RECORD = cy("enclave_attestation_record", "Record an enclave attestation in the consortium", """
CREATE (:EnclaveAttestation {module_id:$module, ts:$ts, status:$status, verified:$verified,
                             pcr0:$pcr0, pcr1:$pcr1, pcr2:$pcr2, nonce:$nonce, reason:$reason})
""")

HISTORY = cy("enclave_attestation_history", "Recent enclave attestations", """
MATCH (e:EnclaveAttestation) RETURN e.ts AS ts, e.status AS status, e.verified AS verified,
       e.pcr0 AS pcr0, e.reason AS reason ORDER BY ts DESC LIMIT 10
""")


def _sha384(s: str) -> str:
    return hashlib.sha384(s.encode()).hexdigest()


@dataclass
class Enclave:
    image: str = IMAGE
    status: str = "ATTESTED"
    reason: str = ""
    lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self):
        # the sealed secret: derived once from the deployment's salt, never returned by the API
        self._secret = hashlib.sha256(("enclave:" + get_settings().hash_salt).encode()).digest()
        self._signer = ec.generate_private_key(ec.SECP384R1())
        self.reference = self.pcrs()

    def pcrs(self) -> dict[str, str]:
        return {"0": _sha384(self.image), "1": _sha384(RUNTIME), "2": _sha384(APP_ID)}

    def attest(self, nonce: str = "") -> dict:
        with self.lock:
            measured = self.pcrs()
            ok = measured == self.reference
            if not ok and self.status != "QUARANTINED":
                self.status, self.reason = "QUARANTINED", "PCR0 mismatch: enclave image changed"
            doc = {"module_id": MODULE_ID, "timestamp": int(time.time() * 1000),
                   "digest": "SHA384", "pcrs": measured, "nonce": nonce,
                   "public_key": base64.b64encode(self._signer.public_key().public_bytes(
                       serialization.Encoding.DER,
                       serialization.PublicFormat.SubjectPublicKeyInfo)).decode(),
                   "user_data": base64.b64encode(APP_ID.encode()).decode(),
                   "certificate": "SIMULATED (no AWS Nitro PKI chain)", "cabundle": []}
            payload = json.dumps(doc, sort_keys=True).encode()
            sig = self._signer.sign(payload, ec.ECDSA(hashes.SHA384()))
            out = {"document": doc, "signature_es384": base64.b64encode(sig).decode(),
                   "reference_pcrs": self.reference, "verified": ok, "status": self.status,
                   "reason": self.reason, "simulated": True}
        try:
            db.q(db.CONSORTIUM, RECORD, {"module": MODULE_ID, "ts": doc["timestamp"],
                                          "status": self.status, "verified": ok,
                                          "pcr0": measured["0"], "pcr1": measured["1"],
                                          "pcr2": measured["2"], "nonce": nonce,
                                          "reason": self.reason})
        except Exception:  # noqa: BLE001  (a full graph must not hide the attestation result)
            pass
        return out

    def blind(self, account_id: str) -> str:
        if self.status != "ATTESTED":
            raise PermissionError(f"enclave {self.status}: {self.reason}")
        return hmac.new(self._secret, account_id.encode(), hashlib.sha256).hexdigest()[:16]

    def tamper(self) -> dict:
        with self.lock:
            self.image = IMAGE + "\n# injected: also send raw account ids to an outside host\n"
        return self.attest("tamper-check")

    def reset(self) -> dict:
        with self.lock:
            self.image, self.status, self.reason = IMAGE, "ATTESTED", ""
        return self.attest("reset")


ENCLAVE = Enclave()


def history() -> list[dict]:
    try:
        return db.ro(db.CONSORTIUM, HISTORY)
    except Exception:  # noqa: BLE001
        return []
