# B2c 000197 preliminary executor v10 review handoff

Status: frozen candidate awaiting two new independent v10 GO reviews and one new
old-writer drain v10 GO. This handoff does not authorize live execution.

## Frozen chain and identity authority

- Formal run ID: `b2c197_prelim_20260802b`
- Fixture run ID: `4fce75ade89881fb1079f88f3a1e46ab`
- Resource authority: `3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73`
- SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- R0: `705882718458b69bf76478ebd071316031782dfe1c9485674f211655715f1439`
- R1: `244a9eca21442ecbec916c962956fa5f2e807bc53d9d70704102070e76ca3f6b`
- Approval runtime v8: `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Active writer build: `approval-port-v8`
- Failure cases v10: `0f28ac8680ca9b1d04dae13f1d85d3faae251cde04a11fd669a7e00a9dc46d48`
- Executor v10: `124d751b386b9b8c7e12b805ee5cbed4ae0abfa202ecccea1dfc3cd62750db3c`
- Orchestrator v10: `040d4c86bb5a08d78826ca427476081893da31fdb30b3b0870e9157946f60043`
- Closure resolver v10: `70d10b94b456d813c30e0674a5214c5ecf8ece824b56a2c5b56e78967efacc55`
- Input manifest, 997 rows, 158954 bytes:
  `e28a0274cb3c5085f8d5955a65da48b4d3285e4c931b634fb95c657d4332b1dd`

The orchestrator reads the immutable resource-authority grammar as the source of
truth for formal run ID and exact C/D topology, container ID, database and volume.
Candidate values are compared against those fields and fail closed on drift. No
new container, volume or resource authority was created.

## v10 P1 correction and identity audit

The only frozen approval runtime is v8 and its only valid writer label is
`approval-port-v8`. The v10 drain parser therefore requires that exact value.
Positive, missing and wrong-value tests execute the same parser used by formal
authority intake; wrong values include the nonexistent `approval-port-v9` and
`approval-port-v10`.

A table-driven identity audit binds writer build, runtime version and SHA, formal
run ID, resource authority and exact C/D identities, review/drain schemas, SQL,
R0 and R1. Candidate output names the runtime explicitly as
`approval_runtime_v8_raw_sha256`; no `runtime_v10` identity is advertised.

The earlier v10+02e read-only preflight was based on an unapproved derived run ID.
It is preserved only under an `audit-only-no-resource-authority` directory and is
explicitly forbidden from the manifest. It is not an input to this handoff,
review intake, drain intake, static evidence or formal execution.

## Review and drain contracts

Independent reviews use schema
`b2c-000197-preliminary-v10-independent-review-v1`. Each review must bind the
exact formal run ID, manifest, this handoff, resource authority, executor,
orchestrator and resolver SHA, reviewer authority and `decision=GO`. Reviewer A
is `independent-database-reviewer`; reviewer B is
`independent-qa-security-reviewer`.

The drain uses schema `b2c-000197-old-writer-drain-v10` and must contain exact:

- `formal_run_id=b2c197_prelim_20260802b`
- `resource_authority_raw_sha256=3c2c91ca18c6639c9d3306ececf06d2b43b3b74c06a870a5c786d08616ab8c73`
- `decision=GO`
- `intake=stopped`
- `in_flight_approval_create_transactions=0`
- `new_writer_build=approval-port-v8`

The frozen terminal static evidence exposes the same review schema, resolver
binding, drain schema, required drain fields and writer build.

## Closure, validation and read-only preflight

The recursive closure contains 987 repository files, including 957 compiler
files, with explicit builtin/external classification, no unresolved internal
specifier and no `node_modules` file. With authority and preflight inputs the
manifest contains exactly 997 rows. Node 22.23.2 and Node 24.18.1 each passed
37/37 pre-freeze tests, including the positive/missing/wrong drain cases and the
full identity audit. Both real `tsc --listFilesOnly` runs matched all 957 compiler
files. ESLint passed on every v10-owned JavaScript file.

The authoritative v10+02b C/D read-only preflight passed. Both targets retained
their exact approved identities and have no host port binding; primary and mirror
000191/000192/000197 history, failed/running rows, other clients, open
transactions, approval-create writers and approval rows are zero. The old index
and predicate are exact and no build residue exists. No database or container
mutation was performed.

- preflight artifact, 3207 bytes:
  `7480fbd6a0e1d24a8b0ed0a1ed3c6a9bab9993094909a38c3e8de4f407cc6ec7`
- preflight manifest, 381 bytes:
  `f4a112c1dac5066f022c9c65fa9f49a3cc8544e3797aa51b4b5b464dffaae642`

All v9 review, drain, GO and NO-GO artifacts are audit-only. No v10 review or
drain artifact is created here. Formal/live execution remains blocked until two
new independent v10 GO reviews and one new drain v10 GO pass exact intake.
