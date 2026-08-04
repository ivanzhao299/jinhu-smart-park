# B2c 000197 preliminary executor v4 review handoff

Status: frozen candidate awaiting two new independent v4 GO reviews and a new
old-writer drain v3 GO. This document does not authorize live execution.

## Exact candidate

- Formal run ID: `b2c197_prelim_20260802c`
- Fixture run ID: `1e8dc65d5145b78cf447ef661f517ad2`
- SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- Resource authority: `3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73`
- Approval runtime v8: `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Approval v8 handoff: `e79639b00cbb70085d5977c6ce77d0a3f2ae828e00dfa467dba9336b6acde0b7`
- PG spec: `2d35ee6245aa0b81db00815a905ab393b203f48ac9ba7454208e990f35e35613`
- Lifecycle CLI: `e805a00506a2c98c460eb73d5c69f4abfa011091f7dccfab8912e42596ce3a8e`
- v4 executor, 14612 bytes: `ec6d1bd3200a1722ed4980b2043b6ef0f3336bc7d38f7f9cc4091dfcc4e6a8b8`
- v4 executor spec, 7567 bytes: `63d8781e609b9271af3e5817784ba8415a42245c182d6a0f677ee31b1793974b`
- v4 orchestrator, 24825 bytes: `078870c63def8faa83e15f6e0e13ee9b6ed1e622da5b4f05e640a5880e859989`
- v4 orchestrator spec, 3101 bytes: `1b7b7d30efe29ce257308ecba7d2e2a6871178ab6541e97004a8c9c1f037f339`
- v4 input manifest, 6001 bytes: `9fbbccba0d996038dbde7aed95e3a8aaf13a2b6285293945157d8645b29eca9e`

Any content, size or SHA drift returns this candidate to review.

## Corrected evidence and lifecycle

The v4 recorder discovers secret-bearing argv/environment values before writing
intent evidence. It discovers `POSTGRES_PASSWORD=`, PostgreSQL URL userinfo and
secret JSON from inspect/process output in memory before writing result or parse
evidence. Tests assert that exact known secrets never occur in any generated
`0444` evidence.

Formal absent validation requires both migration histories to be null,
`approval_rows` to be numeric zero, the exact old index/predicate signatures and
zero build residue. Formal execution independently records compile, connect,
setup, exact ordered seven named tests, cleanup and after-residue phases. Cleanup
and after run through the finally path after any prior phase failure; their
evidence is written before the primary failure is surfaced.

The formal run also records the v4 evidence, orchestrator, 000197 contract and
approval v8 lifecycle static suites as independent real subprocesses before any
database write.

## Resource and preflight evidence

Only exact C/D resources in the frozen resource authority are eligible. The R0
loader success chain is bound by artifact
`ab3c631e30991bad95d9dbb50f6612103ebbc463d2ca97112686768ff85b97c4`
and manifest
`788cae3c1d8a27a54db7b7a0b503f25a2d1fc23d92ce50ccacb8a75d6ee8bd14`.

The new v4 read-only preflight passed and is bound by artifact
`4a1fac3e4a650de79999349b1080eadb25c61030f0a0bde624ee3aa89f798779`
and manifest
`d90afa62bc40115ea48d38c42a52a2f6f3925932db87a7ff4de4615cd821e811`.
Both exact identities matched; both histories were absent; both approval row
counts were zero; old catalog signatures matched and build residue was false.
No database write occurred.

## Validation before freeze

- ESLint: passed.
- Node syntax: 4/4 passed.
- v4 evidence suite: 8/8 passed.
- v4 orchestrator suite: 4/4 passed.
- 000197 SQL/history/catalog suite: 8/8 passed.
- approval v8 real-spawn lifecycle suite: 4/4 passed.
- Default invocation: `execution_authorized=false`, `live_execution=false`.
- Owned-scope diff/whitespace check: passed.

Total executable cases: 24/24 passed with zero fail, skipped, cancelled or todo.

## New authority required

Database and QA/security reviewers must each produce a new immutable artifact
with schema `b2c-000197-preliminary-v4-independent-review-v1`. Each must bind
the formal run ID, raw manifest SHA, raw SHA of this handoff, resource-authority
SHA, executor SHA, orchestrator SHA, `decision=GO`, and respectively
`independent-database-reviewer` or `independent-qa-security-reviewer`.

The new drain artifact must use schema `b2c-000197-old-writer-drain-v3` and bind
the run ID and resource-authority SHA with `decision=GO`, `intake=stopped`,
`in_flight_approval_create_transactions=0`, and
`new_writer_build=approval-port-v8`.

Old v3 manifest, handoff, reviews and drain are RETURNED audit-only. No v4 review
or drain artifact is created by this work. C/D must remain retained after the
preliminary run; all final/current scenarios remain deferred.
