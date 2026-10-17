# Demo script (about 3 minutes, BankWeave 2.0)

Before recording: `scripts/reset_demo.sh`, start the API (`uvicorn app.main:app --port 8000`)
and the UI (`pnpm start -p 3001`), and open the FalkorDB Browser on http://localhost:3030 as a
second screen. Press **Start agents** on Demo control a few minutes before you begin so cases
exist, and approve one SAR on Approvals so procedural memory has something to show.

| Time | Beat | Where | What to say / do |
|---|---|---|---|
| 0:00-0:15 | Hook | Command Center | "Banks clear 85-95% of AML alerts as false positives, and the real rings hide between banks." Point at the live counters and the FalkorDB health card. |
| 0:15-0:40 | Innocent alert | Golden scenarios, A | "This alert fired on a rule. `algo.wcc` shows a two-account island at one bank: cleared, with the reason." |
| 0:40-1:05 | The ring nobody sees | Golden scenarios, B | Toggle "Bank 012 alone" vs **Consortium**: "the best bank holds half of this ring; across 36 IBM rings, 43.8%, and never the whole ring." |
| 1:05-1:25 | Echo | Case → Evidence independence | "15 paths, 12 origins: the Skeptic hit the same KYC fact twice; confidence counts it once." |
| 1:25-1:45 | Cascade | Case → Evidence independence → **Revoke** on the A-77 address | Watch the ripple; the DAG tab highlights what it reached; Approvals now needs an override note. |
| 1:45-2:00 | Freeze | Case → Simulate freeze | "`GRAPH.COPY` sandbox, delete the account, rerun `algo.maxFlow`: 100% of the ring's money flow stops. The case graph is untouched." |
| 2:00-2:15 | Signed report | Case → Audit dossier | Merkle root, Ed25519 signature, every query's execution hash. Hardware Lab → Approval signing: sign with a passkey; revoke evidence and the seal breaks. |
| 2:15-2:35 | The engine | FalkorDB Lab | **Run all 17**; open the PROFILE inspector on a tool's query; Engine features: JS UDF reach, tri-modal query, ACL denial in `ACL LOG`. |
| 2:35-2:50 | Hardware | Hardware Lab → Card terminals | Preset "Cloned EMV: Mumbai → Delhi": ATC replay plus 2,755 km/h, alert raised into the queue. Mention the Wokwi ESP32 that posts the same taps. |
| 2:50-3:00 | Close | 3D consortium → **Fly through** | "Many banks, one ring, every claim proven." |

Optional: Demo control → **Inject smurfing (25 transfers)**: rules see one alert at the source;
the agents open a case covering the fan-out and fan-in. 3D consortium → **Kill worker**: watch
the 30-second heartbeat countdown, then a fresh worker resumes from the graph.

Record at 1080p with voice-over; keep a backup recording.
