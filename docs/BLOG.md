# Five paths, one fact: building AML agents that can't fool themselves

*How we built BankWeave on FalkorDB for Graph Hacks: one graph per bank, a consortium graph
that links them, and three research results turned into Cypher.*

## No bank can see a laundering ring alone

Anti-money-laundering teams drown in alerts. Rule-based monitoring looks at one signal at a
time (a large transfer, a cash deposit) and industry sources put 85-95% of those alerts as
false positives. Meanwhile the schemes that matter are deliberately spread across
institutions: money hops from a customer at one bank to a mule at a second and back through a
third. Each bank sees a slice that looks harmless. IBM's synthetic AML dataset documentation
says the same thing: a real institution only sees part of the laundering.

So we asked a narrow question: what does an investigation agent look like when the shape of
the money is the evidence, and the agent has to prove every sentence it writes?

## Laundering is a path, so we stored it as one

BankWeave loads IBM's AMLworld data (HI-Small) into FalkorDB as **many graphs in one
instance**:

- `bank_<id>`: one bank's view. Its own accounts, plus stubs for counterparties elsewhere, and
  only the transfers that touch the bank.
- `consortium`: every account at the selected banks, ids salted and hashed, all transfers.
- `case_<id>`: one graph per investigation, holding claims, evidence, actions and the agents'
  timeline.

That layout is the point. FalkorDB's multigraph maps directly onto how banks are allowed to
see data, and the same Cypher runs against any view. When we switch the UI from "Bank 001
only" to "Consortium", the same accounts go from scattered pieces to one connected structure
across four banks.

_(E2 numbers: how often a cross-bank attempt is connected in the consortium vs in the best
single bank's view.)_

## Algorithms as tools, not as a dashboard

The agents (Triage, Investigator, Skeptic, Reporter, Auditor, Archivist) don't compute
anything themselves. They call tools, and the tools are FalkorDB queries:

- `algo.wcc` and precomputed component sizes let Triage clear isolated accounts instantly
- `algo.SPpaths` gives the money path that becomes a claim's primary evidence
- `algo.pageRank`, `algo.betweenness` and `algo.HarmonicCentrality`, run on the copied case
  graph, find the hub, the bridges and the orchestrator
- `algo.maxFlow` over collapsed `FLOWS` edges gives "money at risk"
  (it refuses multi-edge relationship types, which is why `FLOWS` exists)
- full-text with Double Metaphone matches "Jon Smyth" to "John Smith"; a vector index finds
  accounts that behave like a known mule

Every tool returns the Cypher it ran, and every piece of evidence stores it. The same tools
are exposed over MCP, so Claude Desktop can investigate the graph directly.

## Five paths, one fact

Here's the failure that surprised us most. An investigator found a shared device between two
suspicious accounts. Then it found the same device again from the second account, and again
through a third account that also used it. Three supporting paths, so: high confidence?

No. It's one fact seen three times. The GraphEcho paper (arXiv 2609.17695) measured exactly
this: graph agents treat redundant paths to one origin as extra corroboration, and simply
telling the model to count sources barely helps. What worked was deterministic: group the
evidence by origin before the model sees it.

In BankWeave every `Evidence` node has an `origin`, the atomic fact it rests on
(`attr:D00063`, `flow:a->b`, `typ:cycle:acct`). Confidence is one query:

```cypher
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active', 'needs_verification']
RETURN count(e) AS paths, count(DISTINCT e.origin) AS independent_sources
```

The UI shows "14 paths, 9 independent sources" and the naive figure next to it, and a shared
address in a 200-unit building is weighted down because it's weak evidence.

## When a reason dies, everything resting on it notices

Beliefs go stale. A KYC update arrives: address A-77, which three suspicious accounts share, is
a 200-unit residential building. The shared-address evidence was never wrong, but it no longer
means what the agents thought.

Following PACMI (arXiv 2610.05732) we never delete. Evidence moves along a validity lattice
(`active < needs_verification < historical_only < superseded`) and the change cascades over
typed edges: claims that rest on it, claims derived from those, the freeze recommendation
justified by them, and the report sentences that cite them. In the UI they turn amber. A
premise check runs before approval: "This rests on evidence superseded (A-77 is a 200-unit
residential building). Re-verify before acting." Approving anyway needs a written override.

## A report that can't prove itself doesn't get filed

The last failure is the most dangerous for a compliance product: a fluent summary that invents
agreement. The Active Provenance Gate paper (arXiv 2609.31422) found that when the same model
writes and audits, it wrongly approved unsafe summaries 85.6% of the time.

BankWeave's Reporter drafts the SAR from a closed bundle, every sentence citing ids. Code checks
run first (does the id exist, belong to this case, still hold?), then a *different, stronger*
model judges each sentence against only what it cites. The SAR publishes only when at least 95%
of sentences are supported, after at most three repairs. Otherwise the output is a divergence
report: the Investigator's position and the Skeptic's, side by side, each with its evidence.
We also refuse a recommendation that rests on a claim below 0.5 echo-proof confidence, so
contested cases end as divergence reports rather than confident SARs.

## Agents that live in the graph

The agents coordinate through a blackboard of `Task` nodes. Claiming a task is one atomic query
(we checked: six concurrent workers, every task done exactly once). Workers heartbeat; kill one
mid-investigation and the orchestrator resets its stale tasks, and another worker continues from
the case graph. Episodic memory is the case's `Event` timeline, procedural memory is a graph of
tool sequences that led to approved outcomes, and cross-case recall is a mirrored
`Account <-[:ABOUT]- Claim` edge in the consortium.

## Reproducing a 2026 AML paper inside FalkorDB

"Feed-Guided Shortest Paths" (arXiv 2610.13280) scores accounts by local motifs (3-cycles,
reciprocity, relay potential, fan-in/out, leaf stars), picks coherent seeds, and builds
shortest-path investigation subgraphs. We rebuilt it with FalkorDB: motif scores written to
`Account`, ego networks copied into a scratch graph, `algo.betweenness` and `algo.pageRank`
(standing in for eigenvector centrality) to pick intermediaries, `algo.SPpaths` for the paths.

_(E3 numbers vs the paper's HI-Small figures.)_

## What we measured

_(Tables from eval/results: E1 triage vs baselines, E2 consortium vs single bank, E3 hunt mode,
E4 pass-through, E6 trust layer, E7 latency. Every number comes from a script in `eval/`.)_

## What we learned building it

- FalkorDB caps result sets at 10,000 rows by default; large reads need paging or they are
  silently truncated. We found it because 28,307 accounts came back as 10,000 motif scores.
- An unlabelled `MATCH (n {id:$id})` can't use an index. Labelling endpoints turned an edge load
  that would have run for hours into minutes.
- Unbounded variable-length cycle queries explode at hub accounts. A time-respecting expansion,
  one query per hop following only later transfers, is both faster and closer to what a
  laundering cycle is.

## Limits and next steps

Synthetic data only; our identity layer is generated (and its rules published so leakage can
be audited). Consortium sharing is modelled with salted hashes, not real privacy technology.
Clue-guided recovery uses graph signals, not the paper's GNN. Next: private set intersection
for real cross-bank linking, a learned risk field, and a study with real analysts.

*BankWeave is open source: github.com/LSUDOKO/BankWeave. Built with help from Claude Code.*
