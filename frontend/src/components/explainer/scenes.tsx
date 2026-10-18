// The storyboard: eight scenes, each one FalkorDB feature and the Cypher that ran for it.
// Every number is read from the API payload (or its bundled snapshot); a missing value renders
// as "–". Queries come from the payload's own `cypher` fields where the API returns them, and
// otherwise are the exact statements from the backend file named under `source`.
import type { ReactNode } from "react";
import { dec, num, pct1, short, type ExplainerData, type Merkle } from "./data";
import type { Facts } from "./model";

export type Stat = { label: string; value: string; tone?: "ok" | "warn" | "ring" | "blue" };
export type Scene = {
  id: string;
  feature: string;
  title: string;
  body: ReactNode;
  stats: Stat[];
  cypher: string;
  source: string;
  steps?: [string, string];
  extra?: ReactNode;
};

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (n: number) => WORDS[n] ?? String(n);

const ACL_RULE = (b: string) => `# a bank-scoped user: its own graph, read-only, nothing else
ACL SETUSER bw_bank_${b} reset on >*** ~bank_${b} +GRAPH.RO_QUERY +PING

GRAPH.RO_QUERY bank_${b} "MATCH (a:Account) RETURN count(a)"
# allowed: the bank's own slice
GRAPH.RO_QUERY consortium "MATCH (a:Account) RETURN count(a)"
# denied by the ACL, like every other bank's graph`;

const PAGERANK = `CALL algo.pageRank('Account', 'TRANSFERS') YIELD node, score
SET node.pagerank = score
RETURN count(node) AS n`;

const SPPATHS = `MATCH (s:Account {id:$src}), (d:Account {id:$dst})
CALL algo.SPpaths({sourceNode:s, targetNode:d, relTypes:['TRANSFERS'],
                   maxLen:$max_len, pathCount:$path_count, relDirection:$direction})
YIELD path, pathWeight
RETURN [n IN nodes(path) | n.id] AS accounts,
       [t IN relationships(path) | t.txn_id] AS txn_ids,
       [t IN relationships(path) | t.amount] AS amounts,
       pathWeight AS hops`;

const MERKLE_LEAVES = `MATCH (c:Claim)
RETURN 'Claim' AS type, c.id AS id,
       {text:c.text, kind:c.kind, state:coalesce(c.state, 'active')} AS body
UNION ALL
MATCH (e:Evidence)
RETURN 'Evidence' AS type, e.id AS id,
       {kind:e.kind, origin:e.origin, summary:e.summary, cypher:e.cypher, payload:e.payload,
        state:coalesce(e.state, 'active')} AS body
UNION ALL
MATCH (s:Sentence)
OPTIONAL MATCH (s)-[:CITES]->(n)
WITH s, collect(n.id) AS cites
RETURN 'Sentence' AS type, s.id AS id,
       {text:s.text, supported:s.supported, cites:cites, state:coalesce(s.state, 'active')} AS body`;

const ATTEST = `MATCH (t) WHERE (t:Action OR t:SAR) AND t.id = $target
CREATE (h:HardwareAttestation {id:$id, method:$method, merkle_root:$root, alg:-7,
        credential_id:$cred, aaguid:$aaguid, counter:$counter, public_key:$pk,
        signature:$sig, origin:$origin, ts:timestamp(), device:$device})
CREATE (h)-[:ATTESTS]->(t)
RETURN h.id AS id`;

export function buildScenes(d: ExplainerData, f: Facts, merkle: Merkle | null): Scene[] {
  const { scenarios: S, layers: L, overview: O } = d;
  const A = S.A, B = S.B, Cc = S.C;
  const b0 = f.banks[0] ?? "001";
  const ind = f.ind;
  const sup = f.sup;
  const kyc = Cc.independence.claims.flatMap((c) => c.challenge_groups).find((g) => g.kind === "kyc_fact");
  const e2 = B.e2;
  const consPct = B.accounts ? (B.views.consortium.stats.nodes / B.accounts) : null;

  return [
    {
      id: "slices",
      feature: "bank_<id> graphs · per-graph ACL",
      title: `${word(f.banks.length)} banks, each sees only its slice`,
      body: (
        <>
          Every bank gets its own FalkorDB graph, <code>bank_&lt;id&gt;</code>: its own customers in colour, and a grey stub for each
          counterparty held at another bank. Graphs are separate keys, so access is per graph: in the ACL demo a bank-scoped user may run{" "}
          <code>GRAPH.RO_QUERY</code> on its own graph and nothing else, and the consortium and the other banks&apos; graphs are refused.
        </>
      ),
      stats: [
        { label: "bank graphs", value: f.bankGraphs.length ? String(f.bankGraphs.length) : String(f.banks.length), tone: "blue" },
        { label: "stubs for accounts held elsewhere", value: num(f.extTotal) },
        { label: "accounts on this map", value: num(f.accountsInView) },
      ],
      extra: f.bankGraphs.length ? (
        <div className="flex flex-wrap gap-1.5">
          {f.bankGraphs.map((g) => (
            <span key={g.name} className="rounded-md bg-panel-2 px-2 py-0.5 text-[11.5px]"><span className="mono text-paper">{g.name}</span> <span className="text-muted">{g.nodes.toLocaleString("en-US")} nodes</span></span>
          ))}
        </div>
      ) : undefined,
      cypher: ACL_RULE(b0),
      source: "backend/app/routers/lab.py · POST /lab/acl-demo",
    },
    {
      id: "join",
      feature: "consortium graph · hashed ids",
      title: "Hashed ids stitch the slices into one graph",
      body: (
        <>
          Account ids are hashed with the bank and a consortium salt before they reach FalkorDB, so the stub one bank holds for a
          counterparty carries the same id as that customer&apos;s own account at the other bank. The <code>consortium</code> graph joins
          on those ids. Watch each account rise out of its bank tile, and the grey stubs fly to the account they stand for.
        </>
      ),
      stats: [
        { label: "consortium nodes", value: num(f.consGraph?.nodes), tone: "blue" },
        { label: `of ${num(f.extTotal)} stubs resolve to an account`, value: num(f.extJoined) },
        { label: `of ${num(f.consEdges)} flows cross banks`, value: num(f.crossCons) },
      ],
      cypher: [L.cypher?.[4], L.cypher?.[2]].filter(Boolean).join("\n\n") ||
        "MATCH (s:Account)-[f:FLOWS]->(d:Account)\nWHERE s.id IN $ids AND d.id IN $ids\nRETURN s.id AS source, d.id AS target, f.capacity AS amount",
      source: "GET /network/layers · backend/app/services/loader.py (hash_id)",
    },
    {
      id: "triage",
      feature: "algo.wcc",
      title: "Triage clears an innocent alert in one call",
      body: (
        <>
          Alert <code>{A.alert.id}</code> fired on rule <code>{A.alert.rule}</code>: {A.alert.reason}. Weakly connected components over
          <code> TRANSFERS</code> put account <code>{short(A.alert.account)}</code> (bank {A.alert.bank}) in component{" "}
          <b>{A.wcc?.componentId ?? "–"}</b>: <b>{num(A.wcc?.size ?? A.alert.component_size)} accounts at {num(A.wcc?.n_banks)} bank</b>,
          no cross-bank counterparty. It cannot be part of a layering ring, so the agent clears it: <i>{A.alert.cleared}</i>.
        </>
      ),
      stats: [
        { label: "algo.wcc lookup", value: `${dec(A.wcc_ms, 1)} ms`, tone: "blue" },
        { label: `of ${num(O?.alerts.total)} alerts cleared`, value: num(O?.alerts.cleared), tone: "ok" },
        { label: "opened as cases", value: num(O?.alerts.case) },
      ],
      cypher: A.cypher[1] ?? A.cypher[0],
      source: "GET /scenarios → A",
    },
    {
      id: "ring",
      feature: "same query, bank graph vs consortium",
      title: "The ring appears only in the consortium",
      steps: [`Bank ${B.best_bank.bank} alone`, "Consortium"],
      body: (
        <>
          Case <code>{B.case.id}</code>: {B.case.title}. The same query runs on every bank&apos;s graph. The best placed,{" "}
          bank {B.best_bank.bank}, holds <b>{B.best_bank.holds} of {B.accounts}</b> ring accounts and sees {B.best_bank.links} of its
          transfers; the rest are stubs. On the consortium graph the ring is one structure: {B.views.consortium.stats.nodes} accounts,{" "}
          {B.consortium_links} money links.
          {e2 && (
            <> Across {e2.attempts} cross-bank laundering groups in the IBM evaluation, the best single bank holds{" "}
              <b>{pct1(e2.best_single_bank.mean_accounts_held)}</b> of a ring&apos;s accounts on average, and the whole ring{" "}
              {pct1(e2.best_single_bank.attempts_fully_held)} of the time.</>
          )}
        </>
      ),
      stats: [
        { label: `bank ${B.best_bank.bank} holds`, value: `${B.best_bank.holds_pct}%`, tone: "warn" },
        { label: "consortium holds", value: consPct == null ? "–" : pct1(consPct), tone: "ok" },
        ...(e2 ? [{ label: `best bank, mean of ${e2.attempts} IBM rings`, value: pct1(e2.best_single_bank.mean_accounts_held), tone: "ring" as const }] : []),
      ],
      cypher: [B.cypher[1], B.cypher[2]].filter(Boolean).join("\n\n"),
      source: "GET /scenarios → B (one query per bank_<id> graph, then consortium)",
    },
    {
      id: "hub",
      feature: "algo.pageRank · algo.SPpaths",
      title: "PageRank finds where the money pools",
      body: (
        <>
          PageRank over <code>TRANSFERS</code> is precomputed on every account in the consortium. Inside the ring,{" "}
          <code>{short(f.hub)}</code> at bank {f.hubAcc?.bank ?? "–"} scores highest ({dec(f.hubAcc?.pagerank, 5)}), number {num(f.hubRank)} of
          the {num(f.accountsInView)} case accounts on this map. <b>{num(f.crossRing)} of the ring&apos;s {num(f.ringEdges)} money links cross a
          bank boundary</b>, where each bank sees only its own end. <code>algo.SPpaths</code> then traces the shortest money paths between
          flagged accounts and files them as evidence.
        </>
      ),
      stats: [
        { label: "hub PageRank", value: dec(f.hubAcc?.pagerank, 5), tone: "blue" },
        { label: `rank of ${num(f.accountsInView)} accounts`, value: f.hubRank ? `#${f.hubRank}` : "–" },
        { label: "cross-bank ring links", value: `${num(f.crossRing)} / ${num(f.ringEdges)}` },
      ],
      cypher: `${PAGERANK}\n\n${SPPATHS}`,
      source: "backend/detection/precompute.py · backend/detection/algorithms.py",
    },
    {
      id: "echo",
      feature: "echo-proof confidence",
      title: ind ? `${ind.paths} paths, ${ind.origins} independent origins` : "Paths collapse to their origins",
      steps: ["Count paths", "Count origins"],
      body: ind ? (
        <>
          Claim <code>{ind.id}</code>, “{ind.text}”, is backed by {ind.paths} evidence paths, but several retrace the same fact:{" "}
          {ind.groups.map((g, i) => (
            <span key={g.origin}>{i ? ", " : ""}<code>{g.kind}</code> ×{g.multiplicity}</span>
          ))}. Counting paths would score it <b>{dec(ind.naive)}</b>. BankWeave groups evidence by origin in Cypher, scores distinct
          origins only and subtracts challenges{ind.challenge_groups.length ? <> ({ind.challenge_groups.map((g) => g.kind).join(", ")})</> : null}:{" "}
          <b className="text-ok">{dec(ind.confidence)}</b>.
          {O && <> Across every claim in the system, {num(O.claims.paths)} paths collapse to {num(O.claims.origins)} origins.</>}
        </>
      ) : "No claim in this case carries evidence yet.",
      stats: ind ? [
        { label: "path counting", value: dec(ind.naive), tone: "warn" },
        { label: "echo-proof", value: dec(ind.confidence), tone: "ok" },
        { label: "paths → origins (all claims)", value: O ? `${num(O.claims.paths)} → ${num(O.claims.origins)}` : "–" },
      ] : [],
      cypher: Cc.independence.cypher ?? "",
      source: "GET /cases/{id}/independence · backend/trust/echo.py",
    },
    {
      id: "cascade",
      feature: "typed edges · variable-length traversal",
      title: "A KYC fact changes; the case re-checks itself",
      steps: ["Before", "After the KYC update"],
      body: sup ? (
        <>
          In case <code>{Cc.case_id}</code> the Investigator cited <i>{sup.summary}</i>.{" "}
          {kyc && <>The Skeptic checked KYC: <i>{kyc.summary}</i>. </>}
          When that fact supersedes <code>{sup.id}</code>, FalkorDB walks <code>SUPPORTED_BY</code>, <code>DERIVED_FROM*1..3</code>,{" "}
          <code>JUSTIFIED_BY</code> and <code>CITES</code>: <b>{sup.reach.claims.length} claim, {sup.reach.derived.length} derived claim,{" "}
          {sup.reach.actions.length} action and {sup.reach.sentences.length} report sentence</b> drop to <i>needs verification</i>. Nothing
          is deleted, and the approval resting on them is locked until a human writes an override note.
        </>
      ) : "This case cites no shared-attribute evidence.",
      stats: sup ? [
        { label: "claims reached", value: String(sup.reach.claims.length + sup.reach.derived.length), tone: "warn" },
        { label: "actions locked", value: String(sup.reach.actions.length), tone: "ring" },
        { label: `${sup.id} now`, value: sup.state.replace(/_/g, " ") },
      ] : [],
      cypher: Cc.cypher[1] ?? Cc.cypher[0] ?? "",
      source: "GET /scenarios → C · backend/trust/validity.py",
    },
    {
      id: "seal",
      feature: "Merkle root over the case graph · WebAuthn",
      title: "A human signs the Merkle root with a hardware key",
      body: (
        <>
          Each case lives in its own graph, <code>case_&lt;id&gt;</code>
          {O && <> ({num(O.falkordb.case_graphs)} of the {num(O.falkordb.graphs)} graphs on FalkorDB Cloud)</>}. Its claims, evidence
          (with the query that produced it) and report sentences hash into one RFC 6962 Merkle root. The approver signs that root
          with a passkey or hardware key, and the signature is written back as a <code>HardwareAttestation</code> node. Supersede any
          evidence later and the root changes: the seal shows broken.
        </>
      ),
      stats: [
        { label: "Merkle root", value: merkle ? `${merkle.root.slice(0, 8)}…${merkle.root.slice(-4)}` : "live only", tone: "blue" },
        { label: "sealed records", value: merkle ? num(merkle.count) : "–" },
        { label: `case_${Cc.case_id}`, value: f.caseGraph ? `${num(f.caseGraph.nodes)} nodes` : "–" },
      ],
      cypher: `${MERKLE_LEAVES}\n\n${ATTEST}`,
      source: "GET /cases/{id}/merkle · backend/app/services/merkle.py · attestation.py",
    },
  ];
}
