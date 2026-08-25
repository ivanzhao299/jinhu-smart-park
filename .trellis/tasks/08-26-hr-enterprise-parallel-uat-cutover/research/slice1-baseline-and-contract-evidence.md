# Slice 1 baseline and full-domain contract evidence

Recorded at 2026-08-26 (Asia/Shanghai) after `git fetch origin --prune`. This is engineering baseline evidence, not a rehearsal manifest and not production authorization.

## Repository and three-end baseline

- Worktree: `/Users/mac/Documents/jinhu-smart-park-worktrees/hr-m6-attendance-operations`
- Branch: `codex/hr-t6-modern-360-evidence`
- Candidate HEAD observed: `4dff6b263be68388fd0ef42f68185df00be80c73`
- `origin/main`: `9b62b41004ed5a6dfb998cdeddde94d21f60a5e6`
- Ahead/behind (`HEAD...origin/main`): `1/0`
- WIP deliberately preserved: T6 modern-360 task metadata/patch plus this untracked cutover task. No merge, reset, stash, migration, production write or cleanup was performed.
- Highest migration on all fetched `origin/main` paths: `000261`.
- Highest production seed on all fetched `origin/main` paths: `000027`.

The observed engineering C/S/M baseline is:

| Component | Observed value | Meaning |
| --- | --- | --- |
| C | `4dff6b263be68388fd0ef42f68185df00be80c73` | Candidate code HEAD at Slice 1 start; it is not yet a frozen rehearsal SHA because Slice 1 files are uncommitted. |
| S | `3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e` | Pinned Yuzhou source backup SHA-256 referenced by all current domain loaders and the T4 source evidence. |
| M | `0b0896340fea2cbbc87d60a75ef98697499f877b09dc03faaaaaa214bac0f446` | Deterministic aggregate SHA-256 over the sorted full-domain contract, parent schema and all six domain transforms after independent review. |

A real A/B rehearsal must recompute and freeze C after commit and prove S plus M byte-for-byte; these observed values must not be copied forward as execution proof without that check.

## Existing six-domain capability scan

All six domains have extract, transform, load and rollback files. The frozen contract matrix points to those existing files and does not copy their transformation SQL.

| Domain | Business scope | Dependency | Existing command surface before Slice 1 |
| --- | --- | --- | --- |
| T0 | organization, position, employee | none | package extract/load/rollback existed |
| T1 | employment events | T0 | scripts existed; no package entry |
| T2 | contracts | T0, T1 | scripts existed; no package entry |
| T3 | attendance and insurance history | T0-T2 | scripts existed; no package entry |
| T4 | payroll history and reconciliation | T0-T3 | extract package entry only; load/rollback scripts existed |
| T5 | recruitment, employee records, training, reward/discipline and file evidence | T0-T4 | package extract/load/rollback existed |

Slice 1 adds only `hr:migration:full:contract` and `test:e2e:yuzhou-full-domain-contract`. It intentionally does not add or execute the Slice 2 runner/adapters.

## T4 hard gate

`.trellis/tasks/08-24-yuzhou-hr-t4-payroll-history/research/source-evidence-manifest.json` still has:

```json
{ "pendingExtractionEvidence": { "status": "not_started" } }
```

The verifier accepts that fact only while the parent is still in a pre-execution/failed-cleanup state, requires `T4_EXTRACTION_NOT_STARTED`, and rejects advancement to `loading` or later. The existing T4 profile (35 salary tables, 46,092 rows, 711 items, 244 formulas, 1,431 closes, 647 memberships and 9 tax rules) is a source profile, not completed extraction or rehearsal evidence.

## Frozen Slice 1 contract surface

- `parent-manifest.schema.json`: closed JSON Schema for the unique parent identity, C/S/M triple, source/target identity, six children, resource registry, ledger, canonical hashes, hard gates, evidence index and 0700/0600/secret-free policy.
- `full-domain-contract-v1.json`: T0→T5 and reverse order, parent state machine, lab-only target/Compose policy, resource types, ledger equation, canonical normalization, approved-ignore catalog, redaction catalog, stable hard-gate reasons, protected online tables, and the six-domain adapter matrix.
- `verify-full-domain-contract.mjs`: fail-closed static verifier for parent identity, exact triple, child completeness/order, lab target, ledger conservation, controlled ignored reasons, cleanup residual, evidence hash/mode/path, sensitive material, T4 status and A/B resource independence.
- Fixtures cover a valid pre-execution parent, an old single-domain fragment, and a declarative negative-case catalog.

Canonical input is limited to stable source identity, normalized business JSON and related source identities. Target UUID, sequence, run ID and timestamps are excluded; money is a decimal string and NULL remains distinct from zero. `approvedIgnored` cannot balance a row without a catalog reason and detached approval hash.

## Negative evidence

`pnpm run test:e2e:yuzhou-full-domain-contract` passes fourteen named negative fixtures plus filesystem evidence checks:

- legacy domain/source evidence cannot be recognized as a full rehearsal;
- wrong C, S or M fails with `TRIPLE_MISMATCH`;
- unsafe target identity fails;
- ledger tampering fails;
- secret-bearing manifest/evidence fails;
- T4 `not_started` cannot advance the parent;
- evidence byte/hash tamper and actual `0644` mode fail;
- A/B cannot reuse database, Compose, volume, container, port, path or account namespace.
- closed-schema unknown fields, target path traversal, missing resource classes, invalid child states and partial verified runs fail closed;
- A/B resource-registry overlap, ledger drift and canonical/quarantine hash drift fail closed;
- evidence containing personal-value keys fails even when its value claims to be redacted.

No secret value, credential, connection string, employee value or payroll value is stored in the fixture or output.

## Remaining boundary after Slice 1

- No lifecycle runner, resource provisioner, adapter execution, database mutation, A/B rehearsal, UAT, restore, rollback or production import was implemented or executed.
- Current legacy T1/T2/T3 rollback scripts do not all independently enforce the final dual-authorization/Compose contract; Slice 2 adapters must only tighten them and must not weaken any existing guard.
- The JSON Schema is a durable interchange artifact; the dependency-free Node verifier is the executable gate. A future change to either invalidates M and all dependent rehearsal evidence.
- Business-execution inputs remain unresolved and therefore retain `NO_GO/productionImport=HOLD`; they do not block Slice 2 or Slice 3 engineering.

## Validation record

- `git diff --check`: passed.
- JSON parse for package, schema, contract and all fixtures: passed.
- `node --check scripts/hr-cutover/verify-full-domain-contract.mjs`: passed.
- `node --check scripts/e2e/yuzhou-full-domain-contract.mjs`: passed.
- `sh -n` for all 18 existing T0-T5 extract/load/rollback scripts and `node --check` for all six transforms: passed.
- `pnpm run test:e2e:yuzhou-full-domain-contract`: passed, including fourteen named negative cases plus filesystem hash/mode/secret scans.
- Existing T0 extract/load/rollback and T1/T2/T3/T4 extract/T4 controlled rollback/T5 domain contract suites: all passed.
- Direct CLI validation against the current T4 source evidence: passed only as `state=planned`, with `productionImport=HOLD`.
- `pnpm lint`: passed for shared, UI, API and Web.
- `pnpm typecheck`: passed for shared, UI, API and Web.

## Independent Slice 1 review closure

The independent Trellis check found and fixed four executable-contract gaps before acceptance: the dependency-free verifier now enforces the schema's closed key sets instead of merely shipping a closed JSON Schema artifact; T4 `NOT_STARTED` blocks state advancement even when the caller omits the external T4 evidence argument; every resource class must be registered and A/B registries must be disjoint; and A/B comparison now requires identical source facts, global ledger, canonical hashes and quarantine-reason hash. Target paths must be normalized, evidence symlinks cannot escape the real evidence root, and the source profile baseline freezes every required T0-T5 count while requiring a new signed profile after source change. M is now the deterministic aggregate of the contract, schema and all six mapping transforms, so changing any executable mapping component invalidates dependent rehearsal evidence.
