# B2c 000197 preliminary executor v9 review handoff

Status: frozen candidate awaiting two new independent v9 GO reviews and one new
old-writer drain v9 GO. This handoff does not authorize live execution.

## Frozen chain

- Logical formal run ID: `b2c197_prelim_20260802d`
- Fixture run ID: `4fce75ade89881fb1079f88f3a1e46ab`
- SQL: `a9b98ca82aa4dafc16535085184df838880ef27801f7cd4b225e1ca1a15af059`
- Approval runtime v8 authority: `022d992f6f4a1c5326904dccd158e168573b0fd383186dc7db110488bfd2e118`
- Failure cases v9: `dfefa7f9af2bb33d159575d7148a961f4a5d14125dcc42ed91e5ce58f79d72fc`
- Executor v9: `d8b61878c564d2abb90bda000ea812f9cceac1237be08a31a9887460272d1dc3`
- Orchestrator v9: `4510c7213922c741965a90d2e231d7ef2a987d6275f93ac7907bf378134c1834`
- Closure resolver v9: `58ec28f3f6ddf98b2e68a90ba38338d7abb017570ba552a8f928225889a51fdd`
- Input manifest, 997 rows, 158938 bytes:
  `f38efeefc618cfcda9cf188a724ef523a5e2507eaded6d5f30395912c86c446c`

Any byte, size, symlink, reason, closure, resource identity or authority-binding
drift returns this candidate to review.

## v9 P1 correction

The v9 orchestrator freezes the resolver SHA in `expected.resolver`, recomputes
the raw resolver SHA at authority intake, compares it exactly with the frozen
value, and supplies the result to the one required-field loop used for both the
database and QA/security reviews. The same loop therefore rejects a missing or
incorrect `resolver_raw_sha256`; both negative cases and the positive case are
executable tests in the v9 orchestrator suite.

The frozen candidate and terminal static evidence expose the same review schema
and resolver SHA. The terminal evidence also records the complete required field
list. Review grammar files are review outputs and are not resolver seeds or
manifest inputs, so the binding creates no hash cycle.

## Recursive execution closure

The v9 resolver starts from all seven formal children and the approval PG
entries, follows repository JavaScript and TypeScript dependencies, classifies
builtins and externals explicitly, and fails closed on unresolved internal
specifiers with importer and specifier. The closure contains 987 repository
files, including 957 compiler files. The manifest adds the frozen authority and
read-only preflight inputs for exactly 997 rows and contains no `node_modules`
file. The TypeScript Program file set exactly matched real `tsc --listFilesOnly`
on Node 22.23.2 and 24.18.1 with no missing or excess file.

## Validation and C/D read-only preflight

ESLint passed on every v9-owned JavaScript file. Before manifest freeze, Node
22.23.2 and Node 24.18.1 each passed 33/33 tests: executor 8, orchestrator 7,
capability 3, recursive closure 3, contract 8 and approval lifecycle 4. Frozen
closure adds three post-freeze tests. An initial sandboxed run was blocked from
spawning Node/corepack children with EPERM; it is a development failure only and
does not authorize anything. The complete suites subsequently passed outside
that sandbox boundary without relaxing assertions.

The new v9 C/D read-only preflight passed against the exact retained resources.
Both targets have no host port binding; primary and mirror 000191/000192/000197
history counts, failed/running rows, other clients, open transactions and
approval-create writers are zero. Approval rows are zero, the old index and
predicate are exact, and build residue is absent. No database or container
mutation was performed.

- preflight artifact, 3204 bytes:
  `83e88e1d849620cf7db149e6e0a0ba212b82697d589f4f5c5b2230981b623b05`
- preflight manifest, 379 bytes:
  `0beea2f96433372619c8fda5bad8a4902dca05b3c2f812d5eb7ea2b8acb73755`

## Required new authority

Each new independent review must use schema
`b2c-000197-preliminary-v9-independent-review-v1` and contain exact values for:

- `formal_run_id`
- `manifest_raw_sha256`
- `handoff_raw_sha256`
- `resource_authority_raw_sha256`
- `executor_raw_sha256`
- `orchestrator_raw_sha256`
- `resolver_raw_sha256`
- `reviewer_authority`
- `decision`

Reviewer A must be `independent-database-reviewer`; reviewer B must be
`independent-qa-security-reviewer`; both decisions must be `GO`.

The new drain must use schema `b2c-000197-old-writer-drain-v9`, bind this formal
run ID and the frozen resource authority, state `decision=GO`, `intake=stopped`,
`in_flight_approval_create_transactions=0`, and
`new_writer_build=approval-port-v9`.

All v8 review, drain, GO and NO-GO artifacts are audit-only. They are not read,
imported, statted, spawned or listed as v9 authority inputs. No v9 review or
drain artifact is created here. Formal/live execution remains blocked until two
new independent v9 GO reviews and one new drain v9 GO pass exact intake.
