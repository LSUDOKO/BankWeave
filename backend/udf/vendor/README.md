# Vendored FLEX

`flex.js` is FLEX 1.0.1, FalkorDB's official UDF library (MIT licence), downloaded unmodified
from https://github.com/FalkorDB/flex/releases/download/1.0.1/flex.js
(sha256 `e7e833ba87f88c1e31913b58bb9bdeab231714f8af4b43b437d84277ee653ece`).

It is pure JavaScript that runs inside FalkorDB's embedded QuickJS engine. BankWeave loads it
with `GRAPH.UDF LOAD flex` and uses `flex.text.levenshtein`, `flex.text.jaroWinkler` and
`flex.sim.jaccard` for name and attribute-set matching.
