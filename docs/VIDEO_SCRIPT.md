# BankWeave 3.0: demo video master script (5:00)

**Title:** BankWeave: Many banks, one ring, every claim proven
**Format:** 1920×1080, 60 fps, voice-over, captions on, under 5 minutes
**Story:** the problem (animated) → the idea (3D explainer) → the live product → the hardware
edge → MCP, any AI agent can investigate → proof in FalkorDB's own browser → measured results.

Numbers are taken from the product: `eval/results/*.json`, the README's FalkorDB Browser
section, and the real MCP transcript in `docs/MCP.md`. Industry figures (85–95% false positives)
are said as estimates.

**Production (rendered cut).** `video/` holds the build: the narration for every segment is in
`video/vo/lines.json`, synthesised to `video/vo/<segment>.mp3` (neural voice, Andrew, +4%); the
screen clips are recorded headlessly against the live site into `video/clips/<segment>.mp4`
(1920×1080); the problem film is spliced in front; `video/build.sh` assembles everything with
burned-in captions and a music bed into `video/bankweave-demo.mp4`. Every interaction in the
recorded clips is read-only (tabs, hovers, presets, scrolling), so recording never changes the
live graph.

---

## Master timeline

| Time | Segment | Source | Length |
|---|---|---|---|
| 0:00 | **The problem** (animated film, B-logo ending) | `docs/media/problem-film.mp4` | 0:40 |
| 0:40 | Landing page | live screen | 0:08 |
| 0:48 | **The idea:** 3D explainer | live screen | 0:20 |
| 1:08 | Dashboard, start the agents | live screen | 0:14 |
| 1:22 | Alert queue + innocent alert | live screen | 0:14 |
| 1:36 | **The ring reveal:** bank vs consortium + Graph explorer | live screen | 0:22 |
| 1:58 | **Inside a case:** echo, revoke cascade, freeze | live screen | 0:35 |
| 2:33 | Approval + signed dossier | live screen | 0:15 |
| 2:48 | **Hardware:** Wokwi → live API → FalkorDB → EMVLab, key, enclave | GIFs + live | 0:35 |
| 3:23 | **MCP:** Claude investigates the live graph | terminal + Claude | 0:40 |
| 4:03 | **Proof in the official FalkorDB Browser** | GIF + screenshots | 0:30 |
| 4:33 | FalkorDB Lab, 17 features in one click | live screen | 0:10 |
| 4:43 | Measured results | live screen | 0:10 |
| 4:53 | End card | film / live | 0:07 |
| **5:00** | end | | |

**Pace rule:** speed up waiting, scrolling and typing (1.5×–3×) with speed ramps; never speed up
the moment a result appears, and never the voice.

---

## Assets already in the repo

| Use in | File |
|---|---|
| Problem film | `docs/media/problem-film.mp4` (source: `video/problem-film/`) |
| FalkorDB Browser recording | `docs/media/falkordb-browser.gif` |
| FalkorDB Cloud console | `docs/media/falkordb-cloud-instance.gif` |
| FalkorDB Browser stills | `docs/img/falkordb/01…07-*.png` (ring, PageRank, card taps, terminal node, SAR provenance, vector KNN, shared identity) |
| Wokwi ESP32 → live API | `docs/media/wokwi-esp32.gif` |
| EMVLab decodes field 55 | `docs/media/emvlab-decode.gif` |
| 3.0 console stills (backup) | `docs/img/v4/*.png` |
| Highlighted evaluation captures | `docs/img/eval/eval-e1/e2/e6/e7.png` |
| Narration (rendered) | `video/vo/<segment>.mp3`, text in `video/vo/lines.json` |
| Logo | `docs/img/logo.png`, `frontend/public/logo-white.png` |

---

## Pre-production checklist

- [ ] Wake Render 15 min early: open `https://bankweave-api.onrender.com/docs`. The `/command`
      badge must read **"Live · LLM + FalkorDB"**.
- [ ] Demo control → **Start agents**; wait for 5+ cases; approve one SAR.
- [ ] Pick a case with a cross-bank ring and an action awaiting approval (e.g. `C-44c08392`).
- [ ] Terminal ready with a large font (20 pt), Claude Code installed, then:
      `claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp`
      (record this line being run; then run one throwaway call so the server is warm).
- [ ] Browser tabs in order: `/` · `/explainer` · `/command` · `/demo` · `/alerts` · `/scenarios`
      · `/network` · `/explorer` · `/cases/<id>` · `/approvals` · `/cases/<id>/dossier` ·
      `/hardware-lab` · `/lab` · `/evaluation`.
- [ ] 1080p capture, zoom 110%, bookmarks hidden, notifications off, cursor highlight on.

---

## The script

### 0:00 – 0:40 · The problem (animated film)
Play the rendered film as is. The voice-over follows its scenes:

> "A criminal moves money through five banks. Each bank sees only its own piece. Each piece looks
> normal, so each alert is cleared.
> Problem one: alert fatigue. 85 to 95 percent of AML alerts are false positives.
> Problem two: blind spots. We measured it on IBM's public laundering data: the best-placed bank
> holds 43.8 percent of a ring's accounts, and sees the whole ring in none of 36 rings.
> Problem three: proof. Reports are put together by hand, from screenshots and notes.
> Seen together, the ring is obvious. This is BankWeave."

### 0:40 – 0:48 · Landing page
**Screen:** `/`: the blue bubble hero with live counters, slow scroll to "The console", click
**Open the console**.

> "BankWeave is a team of AI agents that investigates money-laundering alerts across many banks,
> with FalkorDB as their shared brain."

### 0:48 – 1:08 · The idea: 3D explainer
**Screen:** `/explainer`, scroll through: six bank slices → hashed ids stitch the consortium →
the ring one bank sees 37.5% of → PageRank hub and `algo.SPpaths` → paths collapsing to origins.
Pause briefly on the Cypher each scene shows.
**Labels:** `Multigraph: bank_* · consortium · case_*` · `Every scene = one live FalkorDB call`

> "Each bank lives in its own isolated FalkorDB graph and sees only itself. Salted, hashed account
> ids stitch them into a consortium graph, and only there does the ring appear. This bank sees
> 37.5 percent of it. PageRank finds the hub; shortest paths trace the money. Every scene here is
> a live FalkorDB query, and it shows you the Cypher."

### 1:08 – 1:22 · Dashboard, start the agents
**Screen:** `/command` (badge, KPI cards, claim support, agent team, triage gauge, FalkorDB Cloud
latency and memory) → press **Ctrl K**, type a case id (1 s) → `/demo` → **Stream alerts in
gradually** (activity feed at 2×).

> "The console runs live on FalkorDB Cloud: open cases, alerts decided, which claims are
> independently supported, what waits for a human, and the engine's own health. Six agents share a
> task blackboard stored in the graph."

### 1:22 – 1:36 · Alert queue and an innocent alert
**Screen:** `/alerts`, hover two cleared rows → `/scenarios` → A.
**Label:** `algo.wcc`

> "Most alerts are innocent, and Triage clears them in milliseconds with a reason. Here, FalkorDB's
> connected components show a two-account island at one bank: cleared, evidence attached."

### 1:36 – 1:58 · The ring reveal
**Screen:** `/network`: one bank (fragments, 2 s) → **Consortium** (ring draws; real speed) →
`/explorer`: preset **cross-bank ring**, the force graph settles, hover a node; then preset
**`algo.pageRank`** (hover focuses one community).
**Labels:** `GRAPH.RO_QUERY` · `algo.pageRank`

> "One bank sees fragments. The consortium sees one ring across four banks. In the graph explorer,
> one Cypher query returns the whole ring that no bank graph contains, and PageRank shows where the
> money pools. Every query here runs read-only; FalkorDB itself rejects writes."

### 1:58 – 2:33 · Inside a case
**Screen:** `/cases/<id>`: **Claims** (a Skeptic challenge) → **Evidence independence**
("N paths → K origins") → **Provenance DAG** → `/scenarios` C: the reach of a KYC update
highlighted in the DAG (the cascade a revocation triggers). For a live take, **Revoke** and
**Simulate freeze** can be recorded on a throwaway case; the rendered cut stays read-only.
**Labels:** `Echo-proof confidence` · `Cascading invalidation` · `GRAPH.COPY + algo.maxFlow`

> "Each case has its own graph. Every claim links to evidence, and every piece of evidence keeps
> the Cypher that produced it. The Skeptic argues the innocent side.
> AI agents overcount evidence: many paths, few real sources. BankWeave counts independent origins,
> not paths. Across 28 real cases, 27.8 percent of evidence was an echo.
> New KYC data says this address is a 200-unit building. I revoke it, and the change cascades to
> every claim and action that relied on it.
> Before a freeze, GRAPH.COPY makes a sandbox and reruns max flow: the ring's money stops, the real
> case is untouched."

### 2:33 – 2:48 · Approval and the signed dossier
**Screen:** `/approvals` (override note required) → case **Report** (click a sentence → its
evidence) → `/cases/<id>/dossier`, scroll at 2× to the signed Merkle root.
**Labels:** `Provenance gate ≥ 0.95` · `Ed25519-signed Merkle root`

> "Agents recommend; humans approve, and this action now needs an override because its evidence
> was revoked. A second model checks every report sentence against its evidence, and the dossier is
> sealed with a signed Merkle root."

### 2:48 – 3:23 · The hardware edge
**Screen, in order:**
1. `docs/media/wokwi-esp32.gif` (full screen, 6 s): the ESP32 joins Wi-Fi, Card A taps the Mumbai
   POS, the live API answers `00 APPROVED`, field 55 prints on the serial monitor.
2. `docs/img/falkordb/03-browser-card-taps.png` → `04-browser-terminal-node.png` (2 s each): that
   tap is a `CARD_TXN` edge in FalkorDB Cloud; the Terminal node holds Mumbai and its GPS.
3. `docs/media/emvlab-decode.gif` (4 s): EMVLab decodes the exact TLV.
4. `/hardware-lab` → Terminals → Security key → Enclave → ESP32 on Wokwi tabs (rendered cut:
   tabs only; for a live take add **Cloned EMV: Mumbai → Delhi**, a signature, and tamper PCR0 →
   **QUARANTINED**).
**Label (whole segment):** `Simulated devices · real cryptography`

> "The evidence starts at the card tap. This ESP32 terminal, running in Wokwi, posts a real tap
> over HTTPS to our live API, which approves it and writes a card-transaction edge into FalkorDB
> Cloud. Here it is in the FalkorDB Browser: the Mumbai terminal, its GPS, the cards that tapped
> it. And EMVLab, an independent decoder, reads the chip data correctly.
> The same card in Delhi ten seconds later, with a replayed counter, is a cloned card, and the alert
> goes straight to the agents. Approval is a security-key signature over the case's Merkle root;
> change the evidence and the seal breaks. The enclave that hashes identities quarantines itself if
> it is tampered with."

### 3:23 – 4:03 · MCP: any AI agent can investigate
**Screen, in order:**
1. Terminal (3 s): `claude mcp add --transport http bankweave https://bankweave-api.onrender.com/mcp`
2. Claude Code, ask: *"Use the bankweave tools: give me an engine overview, then investigate case
   C-44c08392. Which claims behind the proposed action are independently corroborated?"*
   Show the tool calls scrolling (2×): `engine_overview` → `get_case` → `explain_claim` →
   `trace_money_path` → `find_rings`. Freeze-frame on an `explain_claim` result showing
   **paths 3, independent sources 1, naive 0.593 vs echo-proof 0.259, "NOT independently
   corroborated"**, with its Cypher.
3. Ask: *"Run MATCH (a:Account) SET a.x = 1 RETURN a"* → **"read-only: write clauses are not
   allowed"**.
4. `/lab` → **MCP tools**: one tool's payload and its Engine X-Ray (3 s).
**Labels:** `17 read-only tools · 3 prompts · Streamable HTTP` · `Every result carries its Cypher`

> "Everything the agents know is also served over the Model Context Protocol. One line adds
> BankWeave to Claude Code: seventeen read-only tools on the live graph. Claude reads the engine,
> opens the case, and asks the key question: is this claim really proven? Three paths, but one
> independent source, so BankWeave scores it 0.26, not 0.59, and says it is not corroborated. Every
> answer carries the exact Cypher it ran. And if an agent tries to write, it is refused twice: by
> our guard and by FalkorDB's read-only mode."

### 4:03 – 4:33 · Proof in the official FalkorDB Browser
**Screen:** `docs/media/falkordb-cloud-instance.gif` (3 s: Free tier, ap-south-1, v4.22,
healthy) → `docs/media/falkordb-browser.gif` (cut to its best 8 s) → stills, slow push, 2.5 s each,
with the engine time as a label:
| Still | Label |
|---|---|
| `01-browser-cross-bank-ring.png` | `Cross-bank ring · 12 nodes · 1.85 ms` |
| `02-browser-pagerank.png` | `algo.pageRank · 3.55 ms` |
| `05-browser-sar-provenance.png` | `SAR → Sentence → Claim → Evidence · 0.61 ms` |
| `06-browser-vector-knn.png` | `HNSW vector KNN · 0.36 ms` |
| `07-browser-shared-identity.png` | `Shared devices and IPs across banks · 2.79 ms` |

> "This is not a mock-up. Here is our FalkorDB Cloud instance, and FalkorDB's own browser connected
> to it. The cross-bank ring in under two milliseconds. PageRank in three and a half, and its top
> account is the same one our MCP tool returns. Every report sentence cites a claim that rests on
> evidence: provenance is a graph pattern. Vector search finds behaviour twins at five banks, and
> shared devices join the bank slices."

### 4:33 – 4:43 · FalkorDB Lab
**Screen:** `/lab` → **Run all 17** (2×) → open the `GRAPH.PROFILE` inspector on one query.

> "The Lab runs seventeen FalkorDB features in one click: ten native algorithms, full-text, vector,
> JavaScript UDFs, ACLs and a tri-modal query."

### 4:43 – 4:53 · Measured results
**Screen:** `/evaluation`: E2 hero, E1 table, E6 card (the same highlighted captures are on the
landing page under "The numbers, not the pitch": `docs/img/eval/eval-e2|e1|e6|e7.png`).

> "And it is measured against IBM's labels: graph triage beats the rule baselines, 25 of 28 reports
> passed the provenance gate, and no action was approved on overturned evidence. Where we fell
> short, the page says so."

### 4:53 – 5:00 · End card
**Screen:** the last 7 s of the problem film (B logo, wordmark, tagline), then fade to black; add
`bankweave.vercel.app · github.com/LSUDOKO/BankWeave` as a lower line.

> "No bank can see a laundering ring alone. BankWeave can. Many banks, one ring, every claim proven."

---

## Feature coverage check

| Feature | Where in the video |
|---|---|
| Multigraph, hashed consortium | 0:48 explainer, 1:36 network |
| 3D explainer (eight scenes, live Cypher) | 0:48 |
| Dashboard 3.0, Ctrl K search | 1:08 |
| Agents + blackboard, triage | 1:08, 1:22 |
| Golden scenarios | 1:22 |
| Graph explorer (12 presets, read-only Cypher) | 1:36 |
| Echo-proof confidence, cascade, DAG | 1:58 |
| `GRAPH.COPY` freeze sandbox | 1:58 |
| Provenance gate, SAR, signed dossier | 2:33 |
| Wokwi ESP32, `CARD_TXN` in FalkorDB, EMVLab | 2:48 |
| Cloned card, security key + Merkle seal, enclave | 2:48 |
| Hosted MCP (17 tools, read-only, Cypher on every result) | 3:23 |
| FalkorDB Browser + Cloud console proof | 4:03 |
| FalkorDB Lab (17 features, PROFILE) | 4:33 |
| Evaluation | 4:43 |

Cut if over time, in this order: Ctrl K search, the enclave, the Lab segment, the PageRank preset
in the explorer. Never cut the ring reveal, the revoke cascade, the Wokwi tap or the MCP
`explain_claim` moment.

## Wording rules

| Say | Don't say |
|---|---|
| "simulated devices, real cryptography" (the Wokwi board is a simulator; its HTTPS posts are real) | "real hardware" |
| "FinCEN-style report" | "files with FinCEN" |
| "measured on IBM's synthetic dataset" | "works on real bank data" |
| "agents recommend, a human approves" | "the AI freezes accounts" |
| "salted, hashed account ids" | "fully anonymous" |

## If something breaks while recording

- Render asleep: the first MCP call can take ~50 s; cut the wait. Pages show "Seeded replay"
  while it wakes; use `docs/img/v3/` stills if needed and keep the badge visible.
- LLM rate limit: fine to show; agents fall back to the deterministic policy and the badge says so.
- Case id not found: `list_cases` first and use a case it returns.
