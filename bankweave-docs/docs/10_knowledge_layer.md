# 10 — Knowledge Layer

## 10.1 GraphRAG-SDK typology knowledge base

**Purpose:** every `Claim` can cite *which named laundering typology* it matches, from public
regulatory guidance, with source citations. Also powers `kb_query` for agents and analysts.

**Sources (public, check licenses, store as Markdown in `data/kb/`):**
- FATF publications on money-laundering typologies and red-flag indicators
- FinCEN advisories / SAR guidance (US Treasury, public domain)
- FFIEC BSA/AML examination manual sections on suspicious activity
- Your own short summaries of the 8 IBM patterns (fan-in, fan-out, cycle, bipartite, stack,
  scatter-gather, gather-scatter, random) written in your own words

Copyright: prefer public-domain government documents; for others, write your own summaries and
link the source. Don't paste large copyrighted passages into the repo.

**Ingestion:**
```bash
pip install "graphrag-sdk[litellm,pdf]"
```
- Define an ontology: `Typology`, `Indicator`, `Behavior`, `Regulator`, `Document` with
  relations `HAS_INDICATOR`, `DESCRIBED_IN`, `RELATED_TO`.
- Build into graph `typology_kb`.
- GraphRAG-SDK keeps `MENTIONED_IN` provenance edges from entities to source chunks and supports
  grounded answers that abstain when evidence is insufficient — use abstention for the agents.
- API details (class names, methods) change — **read the current README** before coding
  (github.com/FalkorDB/GraphRAG-SDK). VERIFY.

**Linking to cases:** map detector outputs to `Typology` ids (e.g. `fan_out` → "Smurfing / fan-out
distribution"), create `(:Claim)-[:MATCHES_TYPOLOGY {score}]->(:Typology)` in the case graph
(mirror `Typology` nodes by id), and the SAR cites the typology's source chunk (`doc:<chunk_id>` origin).

## 10.2 QueryWeaver over KYC (Postgres)

QueryWeaver is **Text-to-SQL** for PostgreSQL/MySQL/Snowflake, using a FalkorDB graph of the
schema. It exposes REST and MCP tools (`list_databases`, `connect_database`, `database_schema`,
`query_database`).

**Why it's legitimate here:** banks keep customer identity (KYC) data in relational systems; the
transaction network lives in the graph. The Skeptic asks KYC questions in English:
- "When was customer C-1042 onboarded and what is their declared occupation?"
- "How many customers are registered at address A-77?"  (→ apartment-building innocent explanation)

Setup: run QueryWeaver (Docker per its README), point it at the `kyc` Postgres, expose via its
MCP server to the Skeptic. Show the generated SQL in the UI (transparency). VERIFY container
image/port from github.com/FalkorDB/QueryWeaver.

Fallback if setup costs too much time: a small fixed set of parameterized SQL tools. Don't let
QueryWeaver block the critical path.

## 10.3 Entity resolution (full-text + vector + graph)

1. **Phonetic names:** full-text index on `Person.name` with `phonetic: 'dm:en'` (Double Metaphone).
   `resolve_entity("Jon Smyth")` → candidates across banks.
2. **Behavior similarity:** vector index on `Account.behavior_vec` → accounts behaving alike.
3. **Graph corroboration:** shared device/address/IP, overlapping counterparties.
4. Create `SAME_AS {confidence, method}` only when ≥2 independent signals agree
   (uses the echo-proof logic — one shared address seen many ways counts once).

## 10.4 Natural-language Q&A for analysts

- Graph questions → curated MCP tools (preferred) or FalkorDB MCP server read-only Cypher.
- KYC questions → QueryWeaver.
- Typology/regulation questions → GraphRAG-SDK `kb_query` with citations.
The UI shows which source answered and the query/citation used.
