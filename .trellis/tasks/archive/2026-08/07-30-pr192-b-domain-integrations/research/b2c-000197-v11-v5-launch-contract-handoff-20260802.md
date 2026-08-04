# B2c 000197 v11-v5 formal launch contract handoff

Status: audit-only launch contract. This file does not authorize execution.

The frozen orchestrator requires exactly these eight non-secret launch environment keys. Values must be constructed and asserted in the launching shell before the frozen Node process starts.

| Environment key | Exact value source |
|---|---|
| `B2C_000197_PRELIMINARY_V11_EXECUTE` | Operator-authorized frozen entry literal `1` |
| `B2C_000197_PRELIMINARY_V11_RUN_ID` | Frozen `V11_RUN_ID` and E/F resource authority: `b2c197_prelim_20260802f` |
| `B2C_000197_V11_DATABASE_PATH` | Frozen `REVIEW_FILENAMES_V11.database`: `/home/jinhuit/JinHuCodebase/jinhu-smart-park/.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v11-v5-independent-database-review-20260802.grammar` |
| `B2C_000197_V11_DATABASE_SHA` | SHA-256 of the canonical DB GO file: `77f1d3dc8fb42aae2a48385caa22acb385671e6fe02ad941b7bdaf7c116790a7` |
| `B2C_000197_V11_QA_PATH` | Frozen `REVIEW_FILENAMES_V11.qa`: `/home/jinhuit/JinHuCodebase/jinhu-smart-park/.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v11-v5-independent-qa-security-review-20260802.grammar` |
| `B2C_000197_V11_QA_SHA` | SHA-256 of the canonical QA/security GO file: `5ab20a43d84e32f6436686972af602b21abb5a4dc1f73d1fa81c670145de144f` |
| `B2C_000197_V11_DRAIN_PATH` | Frozen `REVIEW_FILENAMES_V11.drain`: `/home/jinhuit/JinHuCodebase/jinhu-smart-park/.trellis/tasks/07-30-pr192-b-domain-integrations/research/b2c-000197-preliminary-v11-v5-old-writer-drain-20260802.grammar` |
| `B2C_000197_V11_DRAIN_SHA` | SHA-256 of the canonical old-writer drain GO file: `03cd70e5690b1ecb7acef85b546f3dc5583b2b79fd3ec781cb26982748e206b2` |

The launch shell must also assert that `B2C_000197_V11_PREFLIGHT`, `B2C_000197_V11_FREEZE`, `B2C_000197_V11_STATIC_GATE`, and `B2C_000197_V11_STATIC_MODE` are absent. Database credentials are not launch environment inputs: the frozen approval lifecycle discovers them from the exact authorized container and records only redacted evidence.

The prior invocation stopped at `v11-database-path` before the evidence recorder or any Docker/database command. The formal evidence root remains absent. Do not retry without new explicit authorization.
