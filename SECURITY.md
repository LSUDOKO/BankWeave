# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/LSUDOKO/BankWeave/security/advisories/new)
rather than a public issue. We aim to respond within 72 hours.

## Design notes

- Agent and MCP access to FalkorDB is read-only: every tool runs through `GRAPH.RO_QUERY`, and a guard
  rejects write clauses, `GRAPH.*` commands and multi-statement queries before they reach the engine.
- Each bank's graph can be restricted with per-graph ACLs (`/lab/acl-demo`); consortium ids are salted hashes.
- Approvals are signed (WebAuthn ES256 or Ed25519) over a Merkle root of the case graph, so later changes
  to evidence are detectable.
- Secrets live only in environment variables (`.env` is git-ignored; production uses Render and Vercel settings).
