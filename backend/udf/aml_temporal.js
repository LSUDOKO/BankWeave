// BankWeave temporal AML functions, loaded as the FalkorDB UDF library "aml_temporal".
// Runs inside FalkorDB's QuickJS engine and walks the graph with node.getNeighbors.

// Accounts reachable from `start` along outgoing TRANSFERS where each hop happens after
// the previous one and within `windowSec` of it: money cannot leave before it arrives.
// Returns one row per account with the earliest arrival time and the hop count.
function timeRespectingReach(start, maxHops, windowSec) {
  const best = {};
  const rows = {};
  let frontier = [{ node: start, ts: -1, hops: 0 }];
  while (frontier.length) {
    const next = [];
    for (const f of frontier) {
      if (f.hops >= maxHops) continue;
      const edges = f.node.getNeighbors({ direction: 'outgoing', types: ['TRANSFERS'], returnType: 'edges' });
      for (const e of edges) {
        const ts = e.attributes.ts;
        if (ts <= f.ts) continue;
        if (f.ts >= 0 && ts - f.ts > windowSec) continue;
        const t = e.target;
        if (best[t.id] !== undefined && best[t.id] <= ts) continue;
        best[t.id] = ts;
        rows[t.id] = { account: t.attributes.id, bank: t.attributes.bank_id, hops: f.hops + 1,
                       arrived: ts, amount: e.attributes.amount, back_to_start: t.id === start.id };
        if (t.id !== start.id) next.push({ node: t, ts: ts, hops: f.hops + 1 });
      }
    }
    frontier = next;
  }
  return Object.values(rows);
}

// True if money leaving `start` comes back to it through a time-ordered chain.
function returnsToSource(start, maxHops, windowSec) {
  return timeRespectingReach(start, maxHops, windowSec).some((r) => r.back_to_start);
}

falkor.register('timeRespectingReach', timeRespectingReach);
falkor.register('returnsToSource', returnsToSource);
