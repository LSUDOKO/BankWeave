# Changelog

All notable changes to BankWeave. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning](https://semver.org/).

## [3.0.0] - 2026-10-18

### Added
- Hosted MCP server at `https://bankweave-api.onrender.com/mcp`: 17 read-only FalkorDB tools, 3 prompts,
  2 resources; every result carries its graph, Cypher, parameters and timing (`docs/MCP.md`).
- Graph explorer (`/explorer`): read-only Cypher on any graph, an Obsidian-style force graph, 12 presets
  covering `algo.pageRank`, `algo.wcc`, `algo.labelPropagation`, `algo.SPpaths`, phonetic full-text,
  HNSW vector KNN and report provenance.
- 3D explainer (`/explainer`): eight scroll-driven scenes, each backed by one FalkorDB call.
- Console redesign: sidebar app shell listing every page, Ctrl K search, a shared card system,
  a new dashboard, and every page restyled.
- Landing page: animated hero, "what's new", the evaluation shown as highlighted screenshots of the
  live page, real-tool recordings (Wokwi, EMVLab, FalkorDB Browser, FalkorDB Cloud) and the demo video.
- Narrated demo video with captions (`docs/media/bankweave-demo.mp4`) and its build pipeline (`video/`).
- New B logo, favicon and app icons.
- Published API image: `ghcr.io/lsudoko/bankweave-api`.

### Changed
- README screenshots replaced with the current design; live data figures added.

## [2.0.0] - 2026-10-18

### Added
- Command Center, golden scenarios, mode badge, snapshot replay while the API wakes.
- FalkorDB Lab: graphs and memory, 17 one-click engine features, `GRAPH.PROFILE`/`EXPLAIN` inspector,
  MCP tool explorer, per-bank ACL, JavaScript UDFs (FLEX and `aml_temporal`).
- Case workspace: evidence independence, revoke-and-cascade, provenance DAG, replay, time machine,
  `GRAPH.COPY` freeze sandbox, sanctions screening, crypto off-ramp linking, agent trace waterfall.
- Signed exports: FinCEN-style SAR XML and an audit dossier sealed with an Ed25519 Merkle root.
- Hardware trust layer: POS/ATM twins emitting ISO 8583 and EMV TLV, a Wokwi ESP32 terminal,
  WebAuthn and VaultKey approvals over the Merkle root, an attested enclave, ECDH-PSI between banks.
- Deployment on FalkorDB Cloud, Render and Vercel, with a keep-alive workflow.

## [1.0.0] - 2026-10-17

### Added
- One FalkorDB graph per bank, a hashed consortium graph and a graph per case, loaded from IBM AMLworld.
- Agents: Orchestrator, Triage, Investigator, Skeptic, Reporter, Auditor and Archivist on a task
  blackboard in the graph.
- Trust layer: echo-proof confidence, validity cascade, provenance gate.
- Evaluation suite E1-E7 against IBM's labels (`eval/`).

[3.0.0]: https://github.com/LSUDOKO/BankWeave/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/LSUDOKO/BankWeave/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/LSUDOKO/BankWeave/releases/tag/v1.0.0
