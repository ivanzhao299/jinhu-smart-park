# B2c 000197 preliminary executor v3 review handoff

Status: frozen candidate awaiting two independent v3 GO reviews and a separate
old-writer drain GO. This handoff does not authorize live execution or a
database write.

## Exact frozen candidate

- Formal run ID: `b2c197_prelim_20260802b`
- Fixture run ID: `7d10fc7126c5c03b62f447821943f9e3`
- Migration SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- R0: `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
- R1 v2: `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b`
- Resource authority: `3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73`
- Approval runtime v5: `e30ffc9dd618d4b95c7974ab43d4ab6a54daa783876a5e37cb03a212aa69d9f3`
- Approval PG spec: `f8865fa948f1f4cac693a3ee2420bfc398b1feca487a2c6563c3afa8d388f4df`
- v3 evidence executor, 12682 bytes: `cf39bf526491984531f0513d8b6ef49b81b2b33f276ad830f0c98311974e91b6`
- v3 executor spec, 9269 bytes: `2f5967db4afda0bd79254efbb33addc9ebab136744e3b1bb67d00a71f7ade0ee`
- v3 orchestrator, 22589 bytes: `a7633f51f7b5b14cb86d62d95066e460875f9a6efa159ab2720b98c2fd32b6c9`
- v3 orchestrator spec, 6582 bytes: `17a00efe030fca29438aec0a32a46a7f4f20e275364652bcc0de82cecd8fe547`
- v3 input manifest, 5474 bytes: `de65c383cdd1774d2d60aa07b4789e08200d0d05dde457101ad8028749791133`

Any drift in these inputs returns the candidate to review.

## Dedicated resources and read-only preflight

Only the C/D resources named in the v3 resource authority are eligible. Old
A/B are audit-only and forbidden for absent-path reuse.

The immutable C/D read-only preflight passed before freeze:

- success artifact: `d6a540c0b5005ed0ae051e8aa4ab7171b69301a1acb4c654f240a9906726e926`;
- success manifest: `bd8afe9d9a5068107da55f22787cfd515ef5f5e986017aa2cc804f756d5169e4`;
- both exact container IDs and anonymous volume IDs matched;
- both 000197 primary/mirror histories were absent;
- both old index definition and predicate signatures matched;
- both build-residue flags were false and approval row counts were zero.

No migration history or business data was written by this preflight.

## Evidence and database safety boundary

Every external command is routed through the v3 immutable evidence recorder.
It writes a `0444` intent before spawn, then exact result and TAP evidence before
validation or throw. Nonzero exit, signal, spawn error, stdout/stderr byte and
SHA metadata, redacted text and terminal failure evidence are retained. Database
URLs, passwords, credentials, tokens and unallowlisted environment values are
never persisted as text.

The formal orchestrator revalidates the frozen manifest file-by-file, verifies
resource identity and dual-absent history, applies the migration only after the
required authorities pass, verifies exact post-catalog state and rerun
idempotency, exercises all four rollback boundaries, evaluates the 12-status
predicate matrix, and then runs the exact seven-test approval PostgreSQL gate.
Approval cleanup is checked across all eight runtime data tables plus owned DDL
objects and sessions before any child/TAP failure is surfaced.

## Static results before freeze

- ESLint: passed.
- Node syntax checks: 4/4 passed.
- v3 evidence tests: 11/11 passed, zero skipped/cancelled/todo.
- v3 orchestrator tests: 8/8 passed, zero skipped/cancelled/todo.
- 000197 SQL/history/catalog tests: 8/8 passed, zero skipped/cancelled/todo.
- Default invocation: passed with `execution_authorized=false`.

Total executable static cases: 27/27 passed.

## Required independent authority

The database and QA/security reviewers must independently reproduce the
manifest inputs and return separate immutable files whose first line is
`b2c-000197-preliminary-v3-independent-review-v1`. Each file must bind:

- `formal_run_id=b2c197_prelim_20260802b`;
- the raw SHA of the v3 input manifest;
- the raw SHA of this handoff;
- the resource-authority raw SHA;
- the executor and orchestrator raw SHAs;
- `decision=GO`;
- its exact reviewer authority, respectively `independent-database-reviewer`
  and `independent-qa-security-reviewer`.

The separate drain artifact must use schema `b2c-000197-old-writer-drain-v2`
and bind the formal run ID and resource authority, with `decision=GO`,
`intake=stopped`, `in_flight_approval_create_transactions=0`, and
`new_writer_build=approval-port-v5`.

Only after all three immutable authorities validate may the parent invoke the
formal v3 runner with the exact run ID. C/D remain retained after preliminary
execution. Final fresh, present-exact, later-apply, remaining final dynamic and
final/current decisions remain deferred.
