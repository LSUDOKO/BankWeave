"""Hardware trust layer (SIMULATED devices, real cryptography): enclave attestation and
tamper, DH-PSI between banks, approval signatures over the case Merkle root, and the
POS/ATM digital twin (also reachable from a Wokwi ESP32 circuit)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.services import attestation, merkle, psi
from app.services.hardware_enclave import ENCLAVE, history
from app.services.pos_twin import TERMINALS, TWIN, preset

router = APIRouter(prefix="/hardware", tags=["hardware"])


@router.get("/enclave")
def enclave(nonce: str = ""):
    return {**ENCLAVE.attest(nonce or "status"), "history": history()}


@router.post("/enclave-tamper")
def enclave_tamper():
    return ENCLAVE.tamper()


@router.post("/enclave-reset")
def enclave_reset():
    return ENCLAVE.reset()


@router.get("/enclave/blind/{account_id}")
def enclave_blind(account_id: str):
    try:
        return {"account": account_id, "consortium_id": ENCLAVE.blind(account_id)}
    except PermissionError as exc:
        raise HTTPException(423, str(exc)) from exc


class Psi(BaseModel):
    bank_a: str
    bank_b: str


@router.post("/psi")
def psi_handshake(body: Psi):
    for b in (body.bank_a, body.bank_b):
        if db.bank_graph(b) not in db.list_graphs():
            raise HTTPException(404, f"no graph for bank {b}")
    if ENCLAVE.status != "ATTESTED":
        raise HTTPException(423, f"enclave {ENCLAVE.status}: PSI keys are sealed")
    return psi.handshake(body.bank_a, body.bank_b)


@router.get("/challenge/{case_id}")
def challenge(case_id: str):
    """What an approver signs: the case Merkle root, also as a WebAuthn challenge."""
    if db.case_graph(case_id) not in db.list_graphs():
        raise HTTPException(404, "case not found")
    root = merkle.case_root(case_id)
    targets = db.ro(db.case_graph(case_id), "MATCH (t) WHERE t:Action OR t:SAR "
                                             "RETURN t.id AS id, labels(t)[0] AS type, "
                                             "coalesce(t.kind, t.status) AS kind")
    return {"case_id": case_id, "merkle_root": root["root"], "leaves": root["count"],
            "challenge_b64url": attestation.b64url(bytes.fromhex(root["root"])),
            "targets": targets}


class Attest(BaseModel):
    case_id: str
    target: str
    method: str  # webauthn | vaultkey
    merkle_root: str
    assertion: dict


@router.post("/attest")
def attest(body: Attest):
    if body.method not in ("webauthn", "vaultkey"):
        raise HTTPException(400, "method must be webauthn or vaultkey")
    try:
        return attestation.attest(body.case_id, body.target, body.method, body.merkle_root,
                                  body.assertion)
    except (ValueError, KeyError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/seal/{case_id}")
def seal(case_id: str):
    if db.case_graph(case_id) not in db.list_graphs():
        raise HTTPException(404, "case not found")
    return attestation.seal(case_id)


@router.get("/twin")
def twin():
    return {"terminals": TERMINALS, "cards": TWIN.cards(), "log": TWIN.log[:20],
            "simulated": True}


class Tap(BaseModel):
    terminal_id: str
    card_id: str
    amount: float
    clone: bool = False
    source: str = "ui"


@router.post("/pos-tap")
def pos_tap(body: Tap):
    """One card tap. The Wokwi ESP32 sketch posts here too (source='wokwi')."""
    if body.terminal_id not in TERMINALS:
        raise HTTPException(404, "unknown terminal")
    if body.card_id not in {c["card"] for c in TWIN.cards()}:
        raise HTTPException(404, "unknown card")
    if not 0 < body.amount <= 1_000_000:
        raise HTTPException(400, "amount out of range")
    out = TWIN.tap(body.terminal_id, body.card_id, body.amount, clone=body.clone)
    return {**out, "source": body.source}


@router.post("/preset/{name}")
def run_preset(name: str):
    try:
        return preset(name)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
