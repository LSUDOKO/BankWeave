# Demo script (about 3 minutes)

Before recording: `scripts/reset_demo.sh`, start the API (`uvicorn app.main:app --port 8000`)
and the UI (`pnpm start -p 3001`), open the FalkorDB Browser on http://localhost:3030 as a
second screen. Press **Start agents** on Demo control about a minute before you begin, so
cases exist.

| Time | Beat | Where | What to say / do |
|---|---|---|---|
| 0:00-0:15 | Hook | Alert queue | "Banks clear 85-95% of AML alerts as false positives, and the real rings hide between banks." |
| 0:15-0:40 | Alert flood | Alert queue | Point at the counter: rule-based monitoring would send every alert to an analyst; BankWeave cleared most. Click a cleared alert to show its graph signals. |
| 0:40-1:05 | Consortium reveal | Network | Pick the case with the most banks. Click "Bank 001 only": a few disconnected pieces. Click **Consortium**: one structure, red threads across lanes. Show the Cypher behind the view. |
| 1:05-1:30 | Skeptic and echo | Case workspace | Open the case. The ring claim says "N paths, K independent sources". Trust page: toggle naive path counting to show how much path-counting inflates. |
| 1:30-1:50 | Cascade | Trust | Press **Push KYC update: A-77 is a 200-unit building**. Claims, the freeze recommendation and SAR sentences turn amber. Approvals: the action now needs an override note. |
| 1:50-2:10 | Kill and resume | Demo control | Press **Kill agents** mid-investigation, then **Restart agents**; tasks reset from their heartbeats. On a case, press **Resume from graph**. |
| 2:10-2:35 | SAR and gate | Case > Report | Provenance fidelity badge; click a sentence to light up its accounts. Show a divergent case if one exists. |
| 2:35-2:55 | Scoreboard | Scoreboard | Measured precision/recall vs baselines, consortium vs single bank, SPNSA vs the paper. Every number links to its result file and commit. |
| 2:55-3:00 | Close | FalkorDB Browser | `GRAPH.LIST` showing consortium, bank_*, case_* graphs. "Many banks, one ring, every claim proven." |

Optional (if time): Demo control > **Inject evasive ring** (no alert fires) then **Run hunt mode**
(the ring gets an alert from motif seeds alone).

Record at 1080p with voice-over; keep a backup recording.
