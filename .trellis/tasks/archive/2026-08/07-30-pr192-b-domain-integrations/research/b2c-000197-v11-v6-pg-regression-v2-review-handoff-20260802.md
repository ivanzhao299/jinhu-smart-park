# B2c 000197 v11-v6 PostgreSQL fault-regression runner v2 review handoff

Status: sealed candidate; execution is not authorized; formal GO is false.

This v2 candidate closes the prior independent database and QA/security NO-GO findings. It freezes canonical review paths and exact schemas; requires database GO before a QA/security GO that binds the database review SHA; requires decision `GO`, `execution_authorized=true`, `formal_go=false`, and zero P0/P1/P2 findings; and binds the runner, index parser, failure cases, migration SQL, candidate artifacts, immutable baseline, and a future resource authority.

The execution path claims a unique evidence directory atomically, spawns every child once, never retries, never cleans up, persists immutable intent and result evidence for every child, and leaves every terminal outcome non-reusable. Baseline and injected-fault SQL travel through stdin only. Persisted command output is bounded and redacts secret assignments and database URLs.

Preflight requires an exact 64-hex container ID, exact container name, running state, no host port bindings, exactly one matching anonymous volume mount, an exact database name, and PostgreSQL major 16. The Docker inspect format reads only these fields and does not serialize container environment variables.

Static evidence:

- candidate manifest raw SHA-256: `0fded2af5c147686c1e44c83f137892d43e87ca0f92d9c9e0ffe0c6b6ef7685e`
- static test record raw SHA-256: `c80d4168c2bc3fbf163962da6d68c879d24d5d1a13e184e92603140c60473430`
- Node.js 22.23.2: 8/8 passed
- Node.js 24.18.1: 8/8 passed
- targeted ESLint: passed with zero output

The earlier syntax, child-count, DrvFS mode, resource-negative-fixture, and ESLint PATH failures are audit-only development attempts. They are not cited as passing evidence. No Docker or database command was run while producing this candidate.

Independent reviewers must write only to the fixed review files and schemas declared by the runner. A database GO must be completed first. QA/security must independently review the sealed candidate and bind the exact database review raw SHA-256. Neither reviewer may set `formal_go=true`. The resource authority remains a separate, later input for one unique runId and must remain `READY-NOT-AUTHORIZED` until both reviews are valid.
