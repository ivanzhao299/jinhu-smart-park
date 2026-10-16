# Performance source draft verification

Run from repository root, with Docker available:

```sh
pnpm --filter @jinhu/shared build
node --test scripts/e2e/hr-performance-source-drafts.contract.mjs
HR_PERFORMANCE_SOURCE_DRAFT_PG_REQUIRED=1 TS_NODE_TRANSPILE_ONLY=true pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-performance-source-draft.pg.spec.ts
pnpm --filter @jinhu/api lint
pnpm --filter @jinhu/api typecheck
pnpm --filter @jinhu/api build
```

The required flag turns on the real owned PostgreSQL16 tmpfs/HTTP suite; Docker/start/schema errors fail. Default test discovery skips it and is not evidence of PG acceptance. Exact generated container name and `jinhu.hr-source-drafts` ownership label are verified during cleanup, including partial creation. No production samples, connection settings or permissions are used.

The suite executes actual migrations258/259/300/302/304/321/370/371/372/373 and000136_idempotency_request. Foundational projections: migration_batch/legacy_record_map, sys_user/sys_role/rel_user_role/sys_permission/rel_role_perm, hr_employee/sys_org, sys_op_log, and unrelated performance dependency tables needed to create actual258/259/372 functions. Every consumed batch context/T0/status/database/map/key and RBAC role/status/deletion column is present. These projections are bounded test schema, not full fresh-schema migration/production upgrade proof. Production308/309/310 receipt ledgers are absent and explicitly NOT TESTED; no qualification/preservation credit is claimed for them.

All six source families contain62 source business columns+12 hashes. Two succeeded production_import/T0 batches share identities; each includes101 details with repeated item references,41 grades and multiple masters for the same person/session. Exact18,0/18,2/int32/19,4/null/timezone-free six-microsecond evidence is asserted. Template-only, performance-manager-no-salary, and salary-authorized principals have actual DB roles in a selected park different from their home park. Only authentication is synthetic.

The real Nest chain includes ValidationPipe, PermissionGuard, IdempotencyKeyGuard, route live DB guard, actual DB IdempotencyService/Interceptor and AuditService/Interceptor. It verifies safe receipts, same-key replay/body conflict/business reuse, selected-master projection and whole-manifest isolation, hidden salary preservation on unrelated edits, historical masking, live revocation despite stale principals, closed fields/config, template-person binding denial, current binding labels, options search/pages/scope, source refresh and all-history human protection. Two actual connections and observed PostgreSQL lock wait barriers cover same-head PATCH/create dedup/refresh behind human PATCH. An instrumentation barrier immediately before actual revision INSERT lets a second DB connection commit batch drift; both new and reused manifest paths must fail atomically. It does not stub permission/source helpers or replace the write path with projection-only queries.

Direct SQL rejects immutable history/manifest writes, old heads, changed fixed output, missing records, unauthorized salary/actor/scope, human manifest swap, later source reset and an inserted successor without head advancement. Original full source/map rows and pre-existing performance function definitions/ACL are fingerprinted before and after draft operations. Deliberate test source-generation changes are restored before final comparison. Private local logs contain synthetic fixture evidence only and should be retained at mode0600 in a mode0700 artifact folder.

Success is child API/DB acceptance only. Parent UI/desktop390px, activation/receipt equivalence, complete normal evaluation lifecycle, fresh-main/CI/ReleaseSmoke, production runtime and real-role/business acceptance remain separate. Current production zero rows in one observed scope do not establish archived-source emptiness or a missing import.

Serial review regressions additionally cover scoped same-identity candidates across two source batches, invalid/mismatched draft filters, post-parent-lock generation capture with an actual row-lock barrier, and JSON-key-order-only no-op400. Actual Web tests cover later-batch source selection with exact retry payload, mismatched preview rejection and successful-create/failed-GET recovery without repeating creation.
