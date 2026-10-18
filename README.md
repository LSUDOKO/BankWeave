# BankWeave

**Many banks, one ring, every claim proven.**

![BankWeave live: blue bubble hero with live counters](docs/img/v3/00-landing.png)

BankWeave is a team of AI agents that investigates money-laundering alerts across several
banks, with FalkorDB as its shared brain. It clears innocent alerts fast, exposes laundering
rings that no single bank can see, and backs every conclusion with a graph path you can click
through. It also knows how many *independent* reasons it has for each belief, notices when one
of them dies, and refuses to file a report it can't prove.

- **Tracks:** 01 Agents That Act on Connected Data (primary), 02 Agent Memory and Coordination, Best blog post
- **Live demo:** https://bankweave.vercel.app (UI on Vercel) · API https://bankweave-api.onrender.com/docs (Render) · graph: FalkorDB Cloud (ap-south-1)
- **Use it from Claude:** `claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp` (17 read-only FalkorDB tools, each returning the Cypher it ran; [docs/MCP.md](docs/MCP.md))
- **Proof in FalkorDB's own browser:** [screenshots and a recording](#proof-in-the-official-falkordb-browser) of the ring, PageRank, card taps, SAR provenance and vector search running on our Cloud instance
- **Understand it in five minutes:** the [3D explainer](https://bankweave.vercel.app/explainer) (eight scenes, each one FalkorDB call) and the [graph explorer](https://bankweave.vercel.app/explorer) (twelve presets, run live)
- **Demo video:** _link added after recording_
- **Blog post:** [`docs/BLOG.md`](docs/BLOG.md)

BankWeave is an independent hackathon project. It is not a FalkorDB product and is unrelated to
FalkorDB's QueryWeaver or Weights & Biases Weave.

---

## The problem

1. **Alert fatigue.** Rule-based transaction monitoring flags single signals without context;
   industry sources put 85-95% of alerts as false positives.
2. **Fragmented visibility.** A bank only sees transactions that touch it. Laundering schemes
   spread across institutions, so each bank's slice looks innocent.
3. **Unprovable reports.** A suspicious activity report (SAR) has to justify itself, and today
   that justification is assembled by hand.

## What BankWeave does

1. Loads IBM's public synthetic AML data into **one isolated FalkorDB graph per bank** plus a
   **consortium graph** that links them with salted, hashed account ids.
2. A team of agents (Orchestrator, Triage, Investigator, Skeptic, Reporter with a separate
   Auditor, Archivist) works the alert queue through a **task blackboard stored in the graph**,
   calling **native FalkorDB algorithms as tools** (also served over MCP).
3. Innocent alerts are cleared in milliseconds with a reason; suspicious ones become **cases**,
   each in its own `case_<id>` graph, where claims are linked to evidence and the query that
   produced it.
4. A **trust layer** built from three 2026 papers keeps the agents honest (below).
5. Humans approve every action. Everything is measured against IBM's labels on a scoreboard.

## What's new in 3.0

| Area | What you can do | Where |
|---|---|---|
| **Console** | A sidebar listing all fourteen pages with live counts, Ctrl K search over pages and cases, and one card system across every page: stat cards from live queries, status chips, rounded charts | every page |
| **Dashboard** | Open cases, alerts decided, independent claims, actions awaiting a human; claim support for the latest cases; the next approval; the agent team; an alert-triage gauge; FalkorDB Cloud latency, graphs and memory | `/command` |
| **Graph explorer** | A FalkorDB-browser-style page: pick a graph, write Cypher (`GRAPH.RO_QUERY`, writes rejected by the engine), see an Obsidian-style force graph with labels, hover neighbourhoods and a property panel. Twelve presets, each a FalkorDB feature on our data: cross-bank ring, `algo.pageRank`, `algo.labelPropagation`, `algo.wcc`, `algo.SPpaths`, Double Metaphone full-text, HNSW vector KNN, shared identity, the agents' alert-to-claim chain, a SAR's provenance, the typology KB, learned procedures | `/explorer` |
| **3D explainer** | Scroll through eight scenes on a three.js stage: six bank slices and per-graph ACL, hashed ids stitching the consortium, `algo.wcc` clearing an alert, the ring one bank sees 37.5% of, PageRank hub and `algo.SPpaths`, six paths collapsing to four origins, a KYC cascade, a Merkle root signed by a hardware key. Every number comes from the API; each scene shows the Cypher it ran | `/explainer` |
| **Hosted MCP** | `claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp`: 17 read-only tools (cases, echo-proof claims, money paths, rings, hubs, components, vector and phonetic search, triage, typologies, guarded Cypher), 3 prompts, 2 resources | `/mcp`, [docs/MCP.md](docs/MCP.md) |
| **Real tools, recorded** | The ESP32 sketch running in Wokwi posts a real card tap to the live API, and EMVLab decodes the field 55 it printed | Hardware Lab, below |

| Landing | Dashboard |
|---|---|
| ![](docs/img/v3/00-landing.png) | ![](docs/img/v3/01-dashboard.png) |

| Graph explorer: cross-bank ring on the consortium graph | 3D explainer: the ring as one bank sees it |
|---|---|
| ![](docs/img/v3/07-explorer-ring.png) | ![](docs/img/v3/13-explainer-ring.png) |

| Graph explorer: `algo.pageRank` hubs (hover focuses one community) | 3D explainer: six bank slices, each sees only its own graph |
|---|---|
| ![](docs/img/v3/15-explorer-pagerank.png) | ![](docs/img/v3/12-explainer-banks.png) |

| Alert queue | Case workspace |
|---|---|
| ![](docs/img/v3/02-alerts.png) | ![](docs/img/v3/04-case.png) |

| Approvals | Hardware Lab |
|---|---|
| ![](docs/img/v3/05-approvals.png) | ![](docs/img/v3/08-hardware-lab.png) |

## Proof in the official FalkorDB Browser

The same data the agents use, opened in FalkorDB's own browser (`browser.falkordb.com`, connected
to our FalkorDB Cloud instance: FalkorDB v4.22, 36 graphs, about 81 MB). Every query below is
read-only and was typed into the browser; the timings are the engine's own `RT` readout. The
connection bar with the instance hostname is cropped out.

![Running BankWeave's queries in the FalkorDB Browser](docs/media/falkordb-browser.gif)

| Query | What it proves |
|---|---|
| Cross-bank ring: the case spanning the most banks, its accounts, banks and transfers (12 nodes, 166 edges, **1.85 ms**) | one Cypher query sees the whole ring that no single bank graph contains |
| `CALL algo.pageRank('Account','TRANSFERS')` top 12 (**3.55 ms**) | the hub detection the Investigator calls is native GraphBLAS, not Python |
| `(:Account)-[:CARD_TXN]->(:Terminal)` (5 nodes, 29 edges, **0.41 ms**) | the POS/ATM taps, including the one sent from the Wokwi ESP32, are real edges in the consortium graph; the Terminal node carries `POS-MUM-…`, Mumbai, GPS 19.076, 72.8777 |
| `(:SAR)-[:CONTAINS]->(:Sentence)-[:CITES]->(:Claim)-[:SUPPORTED_BY]->(:Evidence)` in `case_C-70431130` (**0.61 ms**) | every report sentence cites a claim, and every claim rests on evidence: the provenance gate is a graph pattern |
| `db.idx.vector.queryNodes('Account','behavior_vec',10, …)` (**0.36 ms**) | HNSW vector search finds behaviour twins at five different banks |
| Accounts at different banks sharing a `Device` or `IP` (291 nodes, 220 edges, **2.79 ms**) | the identity links the consortium uses to join bank slices |

| Cross-bank ring | `algo.pageRank` |
|---|---|
| ![](docs/img/falkordb/01-browser-cross-bank-ring.png) | ![](docs/img/falkordb/02-browser-pagerank.png) |

| Card taps into terminals (the Wokwi tap included) | The Mumbai POS node and its properties |
|---|---|
| ![](docs/img/falkordb/03-browser-card-taps.png) | ![](docs/img/falkordb/04-browser-terminal-node.png) |

| SAR → sentence → claim → evidence | HNSW vector KNN |
|---|---|
| ![](docs/img/falkordb/05-browser-sar-provenance.png) | ![](docs/img/falkordb/06-browser-vector-knn.png) |

| Shared devices and IPs across banks | FalkorDB Cloud console: the instance (Free tier, ap-south-1, v4.22.0, healthy) |
|---|---|
| ![](docs/img/falkordb/07-browser-shared-identity.png) | ![](docs/media/falkordb-cloud-instance.gif) |

**Hosted MCP, called live** (no install, plain HTTP):

```
$ curl -s -X POST https://bankweave-api.onrender.com/mcp -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
17 tools: engine_overview, list_graphs, graph_schema, list_cases, get_case, explain_claim,
account_network, trace_money_path, find_rings, top_hubs, connected_components, similar_accounts,
search_customers, list_alerts, triage_alert, typology_guidance, run_readonly_cypher

$ ... "method":"tools/call","params":{"name":"top_hubs","arguments":{}}
{"graph": "consortium", "result": [{"account": "e8ccd1faa8d3a4ba", "bank": "001", "score": 0.0027...}, ...
```

The top account matches row 1 of the PageRank query in the FalkorDB Browser above.

## What's new in 2.0

| Area | What you can do | Where |
|---|---|---|
| **Command Center** | Live alerts, open cases, independently supported claims, evidence awaiting review, FalkorDB health (memory, graphs, engine) in one view | `/` |
| **Golden scenarios** | A: an innocent alert cleared by `algo.wcc`. B: a ring across 4 banks (best single bank holds 50% of it; E2: 43.8% on average, 0% of rings whole). C: a shared 200-unit building behind a claim, with the cascade a KYC update would trigger. Computed live; bundled snapshots load instantly when the free-tier API sleeps | `/scenarios` |
| **Mode badge** | Every page says whether it is live with LLM agents, live with deterministic agents, or a seeded replay | rail, page headers |
| **FalkorDB Lab** | Every graph with counts, indexes and `GRAPH.MEMORY USAGE`; 17 one-click runs (10 algorithms, phonetic and stemmed full-text, vector KNN, JS UDFs, FLEX, a tri-modal query); a read-only `GRAPH.PROFILE`/`GRAPH.EXPLAIN` inspector; the MCP tool explorer with schemas, live payloads, the Cypher each tool ran and an Engine X-Ray of it; per-bank ACLs; procedural memory as a graph | `/lab` |
| **Case workspace** | Evidence Independence Explorer ("15 paths → 12 origins"), revoke any evidence and watch the cascade, provenance DAG (React Flow), Replay Investigation, bi-temporal time machine, Simulate Freeze on a `GRAPH.COPY` sandbox, sanctions screening, crypto off-ramp linking, agent trace waterfall | `/cases/<id>` |
| **Signed exports** | FinCEN-style SAR XML and a printable audit dossier: every sentence, the evidence it cites, each query with an execution hash, and an Ed25519-signed Merkle root over the case | `/cases/<id>/dossier` |
| **3D consortium** | Bank slices walled in by external stubs, the consortium where they join (flow particles, PageRank hub), cases and claims on top; fly-through, echo collapse, invalidation shockwave, kill-and-resume with a heartbeat countdown | `/consortium-3d` |
| **Evaluation** | E2 hero, E1 table plus a threshold explorer, E6 scorecard, E3-E5 with misses labelled, E7 badged as a local benchmark | `/evaluation` |
| **Hardware Lab** (simulated devices, real cryptography) | POS/ATM digital twin emitting ISO 8583 with real EMV TLV into the graph; a Wokwi ESP32 terminal; approvals signed with WebAuthn or a virtual security key over the Merkle root ("Merkle seal broken" if evidence changes later); an enclave with PCR attestation that quarantines itself when tampered with; ECDH-PSI between banks | `/hardware-lab`, `hardware/wokwi/` |
| **Integrations** (optional, keyless fallback) | OpenSanctions screening (bundled synthetic slice without a key), on-chain wallet facts, OpenTelemetry-shaped spans with OTLP export | `/integrations/*`, case tabs |

Everything simulated says so on screen: the enclave, card terminals, VaultKey and Wokwi
circuit are simulations; the hashes, signatures, key exchange and graph writes are real.

### Screenshots from the live site

Every image below was captured on **https://bankweave.vercel.app** against the Render API and
FalkorDB Cloud (ap-south-1), with the agents running on Groq's free tier. Nothing is mocked; the
mode badge reads "Live · LLM + FalkorDB".

| Command Center (`/command`: live counters, FalkorDB v4.22 health, agent activity) | Golden scenarios |
|---|---|
| ![](docs/img/live/01-command-center.png) | ![](docs/img/live/02-golden-scenarios.png) |

| FalkorDB Lab: 17 runs on FalkorDB Cloud | `GRAPH.PROFILE` inspector |
|---|---|
| ![](docs/img/live/05-lab-algorithms.png) | ![](docs/img/live/06-lab-profile.png) |

| JS UDF + tri-modal query on FalkorDB Cloud (the managed tier refuses ACL commands, shown honestly) | ACL on Docker: own bank allowed, consortium/other banks/writes denied, `ACL LOG` |
|---|---|
| ![](docs/img/live/07-lab-engine-features.png) | ![](docs/img/v2/06-lab-engine-features.png) |

| MCP tool explorer with Engine X-Ray of the tool's query | Evidence Independence Explorer |
|---|---|
| ![](docs/img/live/15-lab-mcp-xray.png) | ![](docs/img/live/08-case-evidence.png) |

| Provenance DAG | Simulate Freeze on a `GRAPH.COPY` sandbox (49,475 → 0) |
|---|---|
| ![](docs/img/live/09-case-dag.png) | ![](docs/img/live/10-case-freeze.png) |

| Agent trace: 35 spans from the Render agents (rate-limited LLM calls in red) | Audit dossier with signed Merkle root |
|---|---|
| ![](docs/img/live/11-case-trace.png) | ![](docs/img/live/12-audit-dossier.png) |

| 3D consortium | Evaluation |
|---|---|
| ![](docs/img/live/13-consortium-3d.png) | ![](docs/img/live/14-evaluation.png) |

## Hardware trust layer (simulated devices, real cryptography, $0)

Banks don't let software act alone: terminals produce the device evidence, HSMs and enclaves
guard identity hashing, and a human signs off with a security key. BankWeave simulates all three
in software and wires each into FalkorDB.

**Recorded on the real tools.** The sketch in `hardware/wokwi/` running in the Wokwi ESP32
simulator: it joins `Wokwi-GUEST`, Card A is tapped on the Mumbai POS, the board posts it over
HTTPS to the live API, which answers `00 APPROVED`, writes the `CARD_TXN` edge into FalkorDB
Cloud and returns the ISO 8583 field 55 printed on the serial monitor. EMVLab.org then decodes
that exact TLV (amount, currency, IFD serial `D0006301`, ATC, cryptogram, PAN).

| Wokwi ESP32 → live API → FalkorDB | EMVLab decodes the tap's field 55 |
|---|---|
| ![](docs/media/wokwi-esp32.gif) | ![](docs/media/emvlab-decode.gif) |

Captured on the live site:

| Approve with a hardware key: VaultKey FIPS (virtual USB-C key, gold touch ring) | Real WebAuthn (Chrome virtual CTAP2 USB key): ES256 receipt, raw `authenticatorData` and `clientDataJSON` with origin `https://bankweave.vercel.app` |
|---|---|
| ![](docs/img/live/20-hw-signing-vaultkey.png) | ![](docs/img/live/21-hw-webauthn-receipt.png) |

| Signed: `(:HardwareAttestation)-[:ATTESTS]->(:Action)` in the case graph | Evidence revoked afterwards: the case Merkle root changes and the seal breaks |
|---|---|
| ![](docs/img/live/22-hw-case-sealed.png) | ![](docs/img/live/23-hw-merkle-seal-broken.png) |

| Mule ring: three cards on shared POS `D00063` within 30 s → `pos_shared_terminal` alerts into the agents' queue | Cloned card: Mumbai then Delhi 10 s later, ATC replayed → `impossible_travel`; NFC UID, GPS, IMEI, ISO 8583 fields, EMV TLV |
|---|---|
| ![](docs/img/live/24-hw-pos-mule-ring.png) | ![](docs/img/live/25-hw-cloned-card-emv.png) |

| EMVLab.org decodes the live terminal's field 55 (IFD serial `A0009101`, ATC, CID `80`) | Wokwi ESP32 circuit and serial monitor of device taps (`hardware/wokwi/`) |
|---|---|
| ![](docs/img/live/30-emvlab-decodes-tlv.png) | ![](docs/img/live/26-hw-wokwi-serial.png) |

| Enclave attested: PKCS#11 slot 0, signer fingerprint, six bank sync links open | PCR0 tampered: QUARANTINED, all links severed; the live API answers a card tap with **HTTP 423** |
|---|---|
| ![](docs/img/live/27-hw-enclave-attested.png) | ![](docs/img/live/28-hw-enclave-quarantined.png) |

| ECDH-PSI between two bank graphs (X25519) | Sanctions screening with OpenSanctions links |
|---|---|
| ![](docs/img/live/29-hw-psi.png) | ![](docs/img/live/16-case-sanctions.png) |

What is real and what is simulated:

| Piece | Real | Simulated |
|---|---|---|
| Card terminals | BER-TLV encoding (verified by EMVLab), ISO 8583 field layout, graph writes (`CARD_TXN`, `USES_DEVICE {emv_atc, terminal_id, gps, nfc_uid}`), alerts the agents triage, impossible-travel and ATC-replay detection | the terminals and cards; 9F26 is an HMAC, not a chip's 3DES/AES MAC |
| Wokwi ESP32 | the circuit runs in Wokwi and makes real HTTPS posts | the board is a simulator |
| Approval keys | WebAuthn ES256 verification, signature counter, Merkle root over claims/evidence/sentences, seal break on revocation | VaultKey is a WebCrypto key in the tab |
| Enclave / HSM | HMAC-SHA256 blinding, SHA-384 PCRs, ES384-signed Nitro-style document, `(:EnclaveAttestation)` nodes, ingestion refused with 423 while quarantined | no TEE hardware or AWS Nitro PKI chain |
| PSI | X25519 scalar multiplication, commutative blinding | both banks run in one process |

External verifiers: [EMVLab TLV decoder](https://emvlab.org/tlvutils/) ·
[EMVLab cryptogram tool](https://emvlab.org/cryptogram/) ·
[WebAuthn.me debugger](https://webauthn.me/debugger) ·
[Chrome virtual authenticator](https://developer.chrome.com/docs/devtools/webauthn) ·
[Wokwi ESP32](https://wokwi.com/projects/new/esp32) · [OpenSanctions](https://www.opensanctions.org/search/) ·
[FalkorDB Cloud](https://app.falkordb.cloud).

## Why FalkorDB is essential

Turn FalkorDB off and BankWeave can't do any of its core work:

| Without the graph… | because |
|---|---|
| no ring is visible | the ring only exists as a path *between* banks; the consortium graph is where it connects (see E2) |
| triage can't clear anything | components, motif scores, cross-bank links and shared identity are all graph queries |
| no claim has evidence | evidence is a path, an algorithm score or a shared attribute in the graph, stored with its query |
| confidence can't be computed | echo-proof confidence counts distinct `origin`s over `SUPPORTED_BY` edges |
| invalidation can't cascade | dependencies are typed edges (`SUPPORTED_BY`, `DERIVED_FROM`, `JUSTIFIED_BY`, `CITES`) |
| agents can't coordinate or resume | tasks, heartbeats and the case timeline live in the graph |

FalkorDB features in use: **multigraph** (per-bank, consortium, per-case, procedures, typology KB
graphs in one instance), **native algorithms** (`algo.wcc`, `algo.labelPropagation`,
`algo.pageRank`, `algo.betweenness`, `algo.HarmonicCentrality`, `algo.SPpaths`, `algo.SSpaths`,
`algo.maxFlow`, `algo.bfs`, `algo.MSF`), **full-text indexes** with Double Metaphone phonetic
matching and English stemming, a **vector index** (HNSW) on behaviour profiles, **JavaScript
UDFs** (FalkorDB's FLEX library and our own `aml_temporal`), **`GRAPH.COPY`** sandboxes,
**`GRAPH.PROFILE`/`GRAPH.EXPLAIN`**, **`GRAPH.MEMORY USAGE`**, **ACLs** scoped to one graph, and
the Redis protocol for live pub/sub.

## Proof: every FalkorDB feature BankWeave uses

| Feature | Where in the code | Evidence it runs |
|---|---|---|
| **Multigraph** (isolated graphs in one instance) | `consortium`, `bank_<id>`, `case_<id>`, `procedures`, `typology_kb` (`backend/app/db.py`) | Browser shows 43-188 graphs during a run; FalkorDB Cloud holds `consortium` + 6 bank graphs + `typology_kb` |
| `algo.wcc` | precompute component sizes; triage islands (`detection/precompute.py`, `detection/algorithms.py`) | E7 timing; triage reasons "isolated cluster" in the alert queue |
| `algo.labelPropagation` | communities (`detection/precompute.py`) | `Account.community` on every account |
| `algo.pageRank` | hub finding in case graphs; SPNSA intermediaries | ![hub](docs/img/app-case-workspace.png) hub claim; E7 timing |
| `algo.betweenness` (seeded) | mule bridges; SPNSA | ![betweenness](docs/img/falkordb-browser-betweenness.png) |
| `algo.HarmonicCentrality` | orchestrator candidates | `find_orchestrator` tool, rebuttal rounds |
| `algo.SPpaths` | money paths: the primary evidence of a claim | `path` evidence in every case, with its query |
| `algo.SSpaths`, `algo.bfs` | `reach`, `bfs_reach` tools (case graph) | available to the Investigator and over MCP |
| `algo.maxFlow` | money at risk over collapsed `FLOWS` edges | hub claims cite max-flow evidence |
| `algo.MSF` | `backbone` tool: a ring's spanning backbone | available to the Investigator, Reporter and over MCP |
| Full-text index + **Double Metaphone** | `Person.name`, `Company.name` (`detection/identity.py`) | `test_identity.py`: a spelling variant finds its original identity |
| Full-text index + **English stemming** | typology knowledge graph (`knowledge/typology_kb.py`) | cited answers; abstains on unrelated questions |
| **Vector index (HNSW, cosine)** | 16-dim behaviour profiles (`app/services/loader.py`) | `behavior_neighbors`, triage features, clue expansion |
| Range indexes incl. **relationship property index** | `TRANSFERS.ts` (the `txn_id` edge index was dropped in 2.0: nothing looks it up, and it cost ~8 MB) | `CALL db.indexes()` |
| **JavaScript UDFs** (`GRAPH.UDF LOAD`) | `aml_temporal.timeRespectingReach` walks `TRANSFERS` with `getNeighbors`, following only later transfers (`backend/udf/aml_temporal.js`) | `test_lab.py::test_udf_libraries_load_and_run`; Lab → Engine features |
| **FLEX** (FalkorDB's UDF library, vendored 1.0.1) | `flex.text.jaroWinkler`, `flex.text.levenshtein` for names, `flex.sim.jaccard` for shared identity attributes | Lab runs `flex_names`, `flex_jaccard` |
| **`GRAPH.COPY`** | Simulate Freeze copies the case graph, deletes the account in the copy, reruns `algo.maxFlow` + `algo.wcc` (`app/routers/workspace.py`) | `test_workspace.py`: flow 80 → 0, sandbox deleted |
| **`GRAPH.PROFILE` / `GRAPH.EXPLAIN`** | read-only inspector and Engine X-Ray per tool call; a query must pass `GRAPH.RO_QUERY` first (`app/services/engine.py`) | `test_lab.py::test_inspect_refuses_writes` |
| **`GRAPH.MEMORY USAGE`** | per-graph memory in the Lab and Command Center; capacity guard for the 100 MB cloud tier (`app/services/capacity.py`) | `/lab/graphs` |
| **ACL** (`~graph` key patterns, `ACL LOG`) | a bank user that can only `GRAPH.RO_QUERY` its own graph (`/lab/acl-demo`) | consortium, other banks and writes denied, logged (screenshot above). The FalkorDB Cloud user cannot manage ACLs, so this runs on Docker |
| Several `CALL`s in one query | tri-modal query: phonetic full-text → HNSW vector twins → `algo.SPpaths` over `FLOWS` | Lab `trimodal` (about 10 ms) |
| Parameterised Cypher, `ro_query` for reads | every query (`docs/QUERIES.md`: 204 registered + 67 inline) | read-only MCP tool `cypher_readonly` |
| Concurrent writers on one graph | task blackboard (`agents/blackboard.py`) | `test_blackboard.py`: 6 threads, 20 tasks, each claimed once |
| FalkorDB Browser | visual inspection of every graph | screenshots below |
| FalkorDB Cloud | live instance (ap-south-1) seeded with the IBM slice | `scripts/make_slice.py` + seed log |

### Proof from the live FalkorDB Cloud instance

Screenshots from FalkorDB Browser connected to the production instance the live demo uses
(`docs/img/cloud/`):

| What | Screenshot |
|---|---|
| Multigraph: consortium, six bank graphs and case graphs in one instance | ![](docs/img/cloud/01-multigraph.jpg) |
| Index types in use: 1 vector (HNSW), 2 full-text (phonetic), 14 range | ![](docs/img/cloud/03-index-types.jpg) |
| Every index, by label and property | ![](docs/img/cloud/02-indexes-list.jpg) |
| `algo.pageRank` on the consortium (4.3 ms) | ![](docs/img/cloud/04-pagerank.jpg) |
| Vector similarity over behaviour profiles (0.5 ms) | ![](docs/img/cloud/05-vector-similarity.jpg) |
| Double Metaphone full-text: "Hana Sharma" finds "Hannah Sharma" | ![](docs/img/cloud/06-phonetic-names.jpg) |
| A ring the live agents opened: one hub paying accounts at four banks (consortium graph, 0.98 ms) | ![](docs/img/cloud/07-consortium-ring.jpg) |
| That case's own graph: claims, `SUPPORTED_BY` and Skeptic `CHALLENGED_BY` evidence; SAR, Sentence, Event and Action live here too | ![](docs/img/cloud/08-case-claims-evidence.jpg) |

### Proof from local runs on the IBM data

| The consortium ring in FalkorDB Browser | A case graph: claims and their evidence |
|---|---|
| ![ring](docs/img/falkordb-browser-consortium-ring.png) | ![claims](docs/img/falkordb-browser-case-claims.png) |

| One bank's view (fragments) | Consortium view (one ring across 4 banks) |
|---|---|
| ![single](docs/img/app-network-single-bank.png) | ![consortium](docs/img/app-network-consortium.png) |

| Alert queue on real IBM data | Case workspace |
|---|---|
| ![queue](docs/img/app-alert-queue.png) | ![case](docs/img/app-case-workspace.png) |

## Architecture

```mermaid
flowchart TB
  UI[Next.js UI: queue, network weave, case workspace, SAR, trust, approvals, scoreboard] -- REST / WebSocket --> API
  API[FastAPI + WebSocket bridge] --> W
  subgraph W[Agent worker: LangGraph flow]
    O[Orchestrator] --> T[Triage] --> I[Investigator] <--> S[Skeptic] --> R[Reporter] --> A[Auditor]
    H[Human approval] --> AR[Archivist]
  end
  W -- tools --> TOOLS[Tool registry]
  MCP[MCP server: 34 tools] --> TOOLS
  TOOLS -- Cypher / algo.* --> F[(FalkorDB: consortium, bank_*, case_*, procedures, typology_kb)]
  TOOLS -- SQL --> PG[(Postgres KYC)]
  W -- events --> RD[(Redis pub/sub)] --> API
  W -- LiteLLM --> LLM[Groq free tier: writer qwen3.8-27b + different, larger auditor gpt-oss-120b]
```

The LLMs plan, choose tools and write prose. Cypher and `algo.*` do the computation. With no
API key the agents run a deterministic policy (labelled as such in the UI), so the system is
always runnable.

## Graph model

Full schema: [`docs/GRAPH_MODEL.md`](docs/GRAPH_MODEL.md). In short:

- `consortium`: `Account` (hashed id, bank, degrees, PageRank, component, community, motif
  score, pass-through stats, 16-dim behaviour vector) `-[:TRANSFERS]->` `Account`, a collapsed
  `-[:FLOWS]->` edge per account pair, the identity layer (`Person`/`Company` `-[:OWNS]->`;
  `USES_DEVICE`, `USES_IP`, `REGISTERED_AT`), `Alert`, `Decision`, blackboard `Task`, case mirrors.
- `bank_<id>`: the bank's own `Account`s plus `ExternalAccount` stubs; only transfers touching
  the bank.
- `case_<id>`: `Claim -[:SUPPORTED_BY|CHALLENGED_BY]-> Evidence {origin, cypher}`,
  `Claim -[:DERIVED_FROM]-> Claim`, `Action -[:JUSTIFIED_BY]-> Claim`,
  `SAR -[:CONTAINS]-> Sentence -[:CITES]-> Evidence|Claim`, `Evidence -[:SUPERSEDES]-> Evidence`,
  `Case -[:HAD_EVENT]-> Event -[:NEXT]-> Event`.

## Cypher queries and algorithms

Every query the product runs is listed in [`docs/QUERIES.md`](docs/QUERIES.md), generated from
the code. A few that carry the product:

```cypher
// echo-proof confidence: count independent origins, not paths
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active', 'needs_verification']
RETURN count(e) AS paths, count(DISTINCT e.origin) AS independent_sources

// money path between two accounts: the primary evidence for a claim
MATCH (s:Account {id:$src}), (d:Account {id:$dst})
CALL algo.SPpaths({sourceNode:s, targetNode:d, relTypes:['TRANSFERS'],
                   maxLen:$max_len, pathCount:$path_count, relDirection:$direction})
YIELD path, pathWeight
RETURN [n IN nodes(path) | n.id] AS accounts, [t IN relationships(path) | t.txn_id] AS txn_ids

// money at risk: max flow from flagged accounts to the hub (collapsed FLOWS edges)
CALL algo.maxFlow({sourceNodes:srcs, targetNodes:tgts, relationshipTypes:['FLOWS'],
                   capacityProperty:'capacity', nodeLabels:['Account']})
YIELD maxFlow, edges, edgeFlows

// premise check: does this action rest on overturned evidence?
MATCH (a:Action {id:$id})-[:JUSTIFIED_BY]->(c:Claim)
OPTIONAL MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
RETURN c.id, collect(e.id) AS stale
```

Things FalkorDB doesn't ship natively, done in plain Cypher (and said so): degree
(precomputed), time-ordered cycles (iterative time-respecting expansion, one query per hop),
3-cycles (motif score), eigenvector centrality (PageRank used instead in SPNSA).

## Agents and MCP tools

| Agent | Does |
|---|---|
| Orchestrator | turns open alerts into blackboard tasks, resets stale claims |
| Triage | clears an alert with a reason, or opens a case graph |
| Investigator | chooses graph tools (LLM) or follows a learned procedure; writes evidence-linked claims; cites named typologies |
| Skeptic | argues the innocent explanation with KYC facts and attribute-sharing context; at most 2 rounds |
| Reporter + Auditor | SAR through the provenance gate; a different, stronger model audits |
| Archivist | saves the tool sequence that worked (procedural memory), closes the case |

**Hosted MCP (read-only, no install):** `claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp`.
It serves 17 read-only tools over Streamable HTTP from the same Render API; every tool runs through
`GRAPH.RO_QUERY` and returns the graph, Cypher, parameters and time. Install lines for Claude
Desktop and Cursor, the tool table and a real transcript are in [docs/MCP.md](docs/MCP.md).

The full local MCP server (`python -m mcp_server.server`, stdio or `--http PORT`) exposes all 34 tools (32 agent tools plus `cypher_readonly` and `list_graphs`),
including `trace_flow`, `find_hub`, `find_bridges`, `money_at_risk`, `typology_patterns`,
`passthrough_check`, `clue_expand`, `hunt_regions`, `resolve_entity`, `behavior_neighbors`,
`kyc_lookup`, `kb_query`, `echo_check`, `invalidate_evidence`, `premise_check`, plus
`cypher_readonly` and `list_graphs`. Every result includes the Cypher it ran.

Claude Desktop config:

```json
{ "mcpServers": { "bankweave": {
  "command": "/path/to/BankWeave/backend/.venv/bin/python",
  "args": ["-m", "mcp_server.server"], "cwd": "/path/to/BankWeave/backend" } } }
```

## The trust layer

| Feature | Failure it prevents | Source |
|---|---|---|
| Echo-proof confidence | counting one fact many times because many paths lead to it | GraphEcho, arXiv 2609.17695 |
| Cascading invalidation + premise check | acting on beliefs whose evidence was overturned | PACMI, arXiv 2610.05732 |
| Provenance gate + divergence report | a fluent report inventing agreement the evidence doesn't support | Active Provenance Gate, arXiv 2609.31422 |

- Every `Evidence` carries an `origin` (e.g. `attr:D00063`, `flow:a->b`, `typ:cycle:a`).
  Confidence is computed over distinct origins; a 200-unit building address is down-weighted.
  The UI shows "N paths, K independent sources" and the naive figure beside it.
- Superseding evidence never deletes it. Dependents move along a validity lattice
  (`active < needs_verification < historical_only < superseded`); actions resting on stale
  evidence need an explicit override note to approve.
- The SAR is drafted from a closed bundle. Code checks run first (cited ids exist, are active,
  belong to the case); a different model then judges entailment per sentence. It publishes
  only at provenance fidelity >= 0.95, after at most 3 repairs; otherwise it writes a
  divergence report with the Investigator's and Skeptic's positions side by side. A
  recommendation can't rest on a claim below 0.5 echo-proof confidence.

## Memory and coordination (Track 02)

- **Shared state:** the blackboard is `Task` nodes; claiming is one atomic query (verified with
  6 concurrent workers, each task done exactly once).
- **Kill and resume:** workers heartbeat; stale claims are reset and any worker continues from
  the graph. Demo control has a Kill button; the case page has "Resume from graph".
- **Episodic:** each case's `Event` timeline (`HAD_EVENT`, `NEXT`), replayable in the UI.
- **Semantic:** claims and evidence with validity states and history (`beliefs_as_of`).
- **Procedural:** the `procedures` graph stores tool sequences that led to approved outcomes.
- **Cross-case recall:** claim summaries mirrored into the consortium (`Account <-[:ABOUT]- Claim`).
- **Isolation:** per-bank and per-case graphs in one FalkorDB instance.

## Evaluation

<!-- results:start (generated by scripts/gen_results_md.py; do not edit by hand) -->

### E1: alert triage (IBM HI-Small, 20-bank consortium)

4,000 alerted accounts from the later half of the period (129 illicit, base rate 3.2%); weights and thresholds from the earlier half only.

| Method | Precision | Recall | F1 | Accounts escalated | Alerts not escalated |
|---|---|---|---|---|---|
| Rule-based: escalate everything | 3.2% | 100.0% | 0.062 | 4,000 | 0.0% |
| Rules without the graph (≥3 rules) | 33.3% | 7.8% | 0.126 | 30 | 99.2% |
| BankWeave graph score, hand weights (no labels) | 18.9% | 14.0% | 0.161 | 95 | 97.6% |
| BankWeave graph score, calibrated on dev split | 17.8% | 24.0% | 0.205 | 174 | 95.7% |

<sub>`eval/results/E1_alert_triage.json`, commit `49f9388`, HI-Small_Trans.csv (20 banks, graph prefix 'ibm_')</sub>

### E2: no bank can see the ring alone

Across 36 laundering groups that span banks (on average 3.5 banks each), the best-placed single bank holds **43.8%** of the ring's accounts and holds a whole ring in **0.0%** of cases. It does observe 95.7% of the laundering transfers, but most counterparties are other banks' customers it can't investigate. The consortium graph holds 100% of every ring.

<sub>`eval/results/E2_consortium_vs_single_bank.json`, commit `49f9388`, HI-Small_Trans.csv (20 banks, graph prefix 'ibm_')</sub>

### E3: hunt mode (SPNSA reproduction, k=200, r=1)

| Seed feed | Subgraph accounts | Illicit ratio | Paper (HI-Small) |
|---|---|---|---|
| Random (mean of 10) | 250 | 3.4% | 2.4% |
| Degree imbalance | 336 | 17.0% | 13.7% |
| Motif-coherent (paper parameters) | 280 | 7.5% | 22.6% |
| Motif, no degree penalty (post-hoc ablation) | 378 | 11.6% | — |

Base rate in this graph: 2.5%. We did **not** reproduce the paper's ranking: with its parameters the degree penalty inverts the motif score on our 20-bank slice (account-level AUC 0.3743, vs 0.638 without the penalty), so degree imbalance wins here. All feeds beat random.

<sub>`eval/results/E3_spnsa_hunt.json`, commit `cc7037a`, HI-Small_Trans.csv (20 banks, graph prefix 'ibm_')</sub>

### E4: pass-through matching

708 accounts flagged; 4.8% of them illicit vs a 2.5% base rate. Chain-deduplicated value: 74,961,854,871 (IBM amounts are in many currencies, so this is a raw sum, not a USD figure).

<sub>`eval/results/E4_passthrough.json`, commit `154672b`, HI-Small_Trans.csv (20 banks, graph prefix 'ibm_')</sub>

### E5: clue-guided recovery

From 2 clue members of 12 laundering groups: best round 2 reaches precision 33.3%, recall 3.4%. This is weak; the graph-signal version (no GNN) mostly finds the clue's immediate partners.

<sub>`eval/results/E5_clue_expansion.json`, commit `706ae01`, HI-Small_Trans.csv (20 banks, graph prefix 'ibm_')</sub>

### E6: trust layer on the agents' real cases

Over 28 cases the agents built from the live IBM slice:

- **Echo:** 27.8% of 510 evidence items repeated an origin already seen; 37 of 101 claims had more supporting paths than independent sources. Mean confidence 41.7% echo-proof vs 48.8% counting paths.
- **Provenance gate:** 25 of 28 SARs published, 3 ended as divergence reports; mean provenance fidelity 0.988; 26 needed at least one repair round.
- **Cascading invalidation:** affected-node recall 100.0% and precision 100.0% over 50 scripted dependency graphs.
- **Stale approvals:** 0 actions approved on overturned evidence without an override.

<sub>`eval/results/E6_trust_layer.json`, commit `f3cff38`, IBM_SLICE_Trans.csv (6 banks, graph prefix '')</sub>

### E7: speed (one local machine)

Consortium graph: 28,307 accounts, 1,315,597 transfers.

| Operation | Median | 95th percentile |
|---|---|---|
| expand neighborhood | 3.1 ms | 6.1 ms |
| typology patterns | 12.5 ms | 674.0 ms |
| cross bank links | 0.6 ms | 0.9 ms |
| shared identity | 0.7 ms | 0.9 ms |
| behavior neighbors | 0.4 ms | 1.0 ms |
| passthrough check | 2.8 ms | 10.5 ms |
| triage signals hub accounts | 1.1 ms | 2.3 ms |
| triage signals regular accounts | 15.4 ms | 58.0 ms |
| pagerank consortium | 57.5 ms |  |
| wcc consortium | 39.5 ms |  |

<sub>`eval/results/E7_performance.json`, commit `b8a1292`, ibm_</sub>

<!-- results:end -->

## Deployment (live)

| Piece | Where | How |
|---|---|---|
| Graph database | FalkorDB Cloud, AWS ap-south-1 | seeded with `scripts/make_slice.py` + `scripts/seed_all.sh` (real IBM slice: 24,990 transactions, 6 banks) |
| API + agent worker | Render web service `bankweave-api` (Singapore) | root `Dockerfile`; created with the Render CLI; agents run in the API process |
| Live events | in-process event bus (no Redis needed on a single service) | `backend/app/events.py` |
| KYC Postgres | Neon (`aws-ap-southeast-1`) | `python -m app.services.kyc_synth --postgres-only` |
| UI | Vercel `bankweave.vercel.app` | `vercel deploy --prod` from `frontend/` |
| LLMs | Groq free tier (writer `qwen/qwen3.8-27b`, auditor `openai/gpt-oss-120b`), OpenRouter free models as fallback | `backend/agents/llm.py` |

Render's free plan sleeps after 15 minutes idle; the first request wakes it (about a minute) and
the agents resume from the graph blackboard. While it wakes, the Command Center, Golden scenarios,
Lab and Evaluation pages render from snapshots of real API responses (`scripts/capture_snapshots.py`)
and say so with the "Seeded replay" badge.

FalkorDB Cloud's free tier has 100 MB and `noeviction`. Since 2.0 the graphs load in compact form
(`KYC_ARGS=--compact`, no unused `txn_id` edge index, no id indexes on ~100-node case graphs),
`/health` reports used memory, and `scripts/cloud_reseed.sh` rebuilds the cloud graphs while keeping
pinned cases. Old case graphs are pruned automatically only when `CAPACITY_PRUNE=true`.

Optional environment variables: `OPENSANCTIONS_API_KEY` (live sanctions screening),
`HELIUS_API_KEY` (Solana wallet lookups), `EVM_RPC_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT` and
`OTEL_EXPORTER_OTLP_HEADERS` (export agent spans to Langfuse, Jaeger or any OTLP collector),
`DOSSIER_SIGNING_KEY` (hex Ed25519 seed for dossier signatures), `PINNED_CASES`, `CAPACITY_PRUNE`.

## Run it locally

```bash
docker compose up -d                       # FalkorDB (6390, Browser 3030), Redis (6391), Postgres (5440)
cp .env.example .env                       # add GROQ_API_KEY (free) for LLM agents (optional)
cd backend && uv sync && cd ..
scripts/seed_all.sh                        # synthetic demo dataset -> graphs, identity, precompute
cd backend && uv run python -m app.services.baseline && uv run uvicorn app.main:app --port 8000
cd frontend && pnpm install && pnpm dev -p 3001
```

Open http://localhost:3001, go to Demo control and press Start agents.

IBM data for evaluation: `scripts/download_ibm.sh` (Kaggle token) or the public mirror
`hf.co/datasets/eexzzm/IBM-Transactions-for-Anti-Money-Laundering-HI-Small-Trans`, then
`GRAPH_PREFIX=ibm_ scripts/seed_all.sh data/raw/HI-Small_Trans.csv --top-n 20` and
`GRAPH_PREFIX=ibm_ eval/run_all.sh`.

Tests: `cd backend && uv run pytest` (55 tests, against the local FalkorDB).

Hardware: the ESP32 terminal in `hardware/wokwi/` runs in the free Wokwi simulator and posts
taps to `POST /hardware/pos-tap` (see its README).

## Data

- **IBM Transactions for Anti-Money Laundering** (AMLworld, fully synthetic), HI-Small:
  5,078,345 transactions, 5,177 labelled laundering. Labels are used only in `eval/`.
- **Our own synthetic identity layer** (`backend/app/services/kyc_synth.py`, seed 42): people,
  name variants, devices, IPs, addresses and a Postgres KYC table. Generation rule, reported so
  leakage can be audited: attempt members share a device with P=0.40, innocent accounts with
  P=0.03; 6% of innocent accounts share a family address/IP; one 200-unit building (A-77) houses
  about 15 accounts including some attempt members.
- **Demo dataset** (`data/demo`, seed 42): IBM-format synthetic transactions with innocent
  background and 16 cross-bank attempts in the 8 IBM shapes.
- No real personal data anywhere.

## AI tools disclosure

Built with help from **Claude Code** (Anthropic), which wrote much of the code under the
team's direction; every module was reviewed and is understood by the team. At runtime the
agents use free-tier LLMs through Groq (writer `qwen/qwen3.8-27b`, auditor `openai/gpt-oss-120b`,
a different and larger model from a different vendor), with OpenRouter free models as fallback.

## Limitations

- Synthetic data only; the identity layer is generated and documented.
- Without IBM's Patterns file, laundering attempts are approximated as connected groups of
  laundering transfers (stated in each result file).
- Clue-guided recovery uses graph signals, not the paper's GNN.
- Consortium sharing is modelled with salted hashes. The ECDH-PSI handshake is real X25519
  arithmetic, but both banks' sides run in one process for the demo.
- The enclave, card terminals, VaultKey and Wokwi circuit are simulations. Their cryptography is
  real (HMAC, SHA-384 PCRs, ECDSA P-384/P-256, Ed25519, X25519); their hardware is not. The EMV
  application cryptogram (9F26) is an HMAC, not a card's 3DES/AES MAC.
- The SAR export is FinCEN-*style* XML for review, not a BSA E-Filing submission.
- The bundled sanctions slice is synthetic; name-only screening produces common-name matches
  that need date of birth or country to confirm.
- The threshold explorer on the Evaluation page runs on the live slice, which overlaps the
  model's training data, so its numbers are optimistic; the held-out result is E1's table.

## License

MIT, see [LICENSE](LICENSE).
