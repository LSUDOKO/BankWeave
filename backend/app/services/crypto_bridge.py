"""Crypto off-ramp bridge: from accounts that move money in crypto formats to on-chain facts.

Off-ramp accounts come from the graph itself (IBM's data marks transfers paid in Bitcoin).
An analyst can attach a wallet address to an account; the bridge fetches public on-chain
facts for it (EVM through a public JSON-RPC endpoint, Solana through Helius when
HELIUS_API_KEY is set) and records the link as case evidence with origin chain:<net>:<addr>.
No key is needed for EVM; without network access the lookup reports the error instead.
"""
from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone

from app import db
from app.cypher import cy
from trust import store

EVM_RPC = os.getenv("EVM_RPC_URL", "https://ethereum.publicnode.com")
EVM_ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")
SOL_ADDR = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

OFFRAMPS = cy("crypto_offramp_accounts", "Accounts that send or receive money in crypto formats", """
MATCH (a:Account)-[t:TRANSFERS]-()
WHERE t.format = 'Bitcoin'
WITH a, count(t) AS n, sum(t.amount) AS total, min(t.ts) AS first, max(t.ts) AS last
RETURN a.id AS account, a.bank_id AS bank, n, total, first, last
ORDER BY n DESC LIMIT $limit
""")


def offramps(limit: int = 25) -> dict:
    return {"accounts": db.ro(db.CONSORTIUM, OFFRAMPS, {"limit": limit}), "cypher": OFFRAMPS}


def _rpc(url: str, method: str, params: list, headers: dict | None = None):
    import httpx
    r = httpx.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                   headers=headers, timeout=10)
    r.raise_for_status()
    body = r.json()
    if "error" in body:
        raise RuntimeError(body["error"].get("message", "rpc error"))
    return body["result"]


def lookup(chain: str, address: str) -> dict:
    t0 = time.perf_counter()
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        if chain == "evm":
            if not EVM_ADDR.match(address):
                raise ValueError("not an EVM address (0x + 40 hex)")
            bal = int(_rpc(EVM_RPC, "eth_getBalance", [address, "latest"]), 16)
            nonce = int(_rpc(EVM_RPC, "eth_getTransactionCount", [address, "latest"]), 16)
            code = _rpc(EVM_RPC, "eth_getCode", [address, "latest"])
            facts = {"balance_eth": round(bal / 1e18, 6), "sent_transactions": nonce,
                     "is_contract": code not in ("0x", "0x0")}
            source = EVM_RPC
        elif chain == "solana":
            key = os.getenv("HELIUS_API_KEY")
            if not key:
                raise RuntimeError("set HELIUS_API_KEY to look up Solana addresses")
            if not SOL_ADDR.match(address):
                raise ValueError("not a Solana address")
            url = f"https://mainnet.helius-rpc.com/?api-key={key}"
            bal = _rpc(url, "getBalance", [address])["value"]
            sigs = _rpc(url, "getSignaturesForAddress", [address, {"limit": 20}])
            facts = {"balance_sol": bal / 1e9, "recent_signatures": len(sigs)}
            source = "Helius mainnet RPC"
        else:
            raise ValueError("chain must be evm or solana")
        return {"chain": chain, "address": address, "facts": facts, "ok": True,
                "provenance": {"source": source, "fetched_at": now},
                "ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as exc:  # noqa: BLE001
        return {"chain": chain, "address": address, "ok": False, "error": str(exc)[:200],
                "provenance": {"fetched_at": now}}


def link(case_id: str, account: str, chain: str, address: str) -> dict:
    info = lookup(chain, address)
    summary = (f"analyst linked {account[:6]} to {chain} wallet {address[:10]}…"
               + (f": {info['facts']}" if info["ok"] else f" (lookup failed: {info['error']})"))
    eid = store.add_evidence(case_id, "chain_link", f"chain:{chain}:{address.lower()}", summary,
                             info, None, "analyst", [account])
    return {"evidence_id": eid, **info}
