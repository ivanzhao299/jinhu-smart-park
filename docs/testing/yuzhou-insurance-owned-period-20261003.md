# Modern insurance periods: implementation checkpoint

This is an in-progress slice, not a production release or business acceptance.

Implemented locally: routed controller/service with four independent write capabilities, required same-manager audits and durable request identities; request DTOs for owned preview/confirmation/close/correction; forward migration 000323 with separate append-only preview, revision and close tables; precise SQL result validation, source/current-employee checks, family serialization and modern payroll result FK. Historical tables receive no DML.

Validation:

- `pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-insurance-owned-period-dto.spec.ts`: two tests passed, zero skipped.
- Focused ESLint and `git diff --check`: passed before the migration addition; rerun as files change.
- `scripts/e2e/hr-insurance-owned-period-sql-gate.sql`: run only against an explicitly isolated empty localhost fixture after the complete original migration chain, with `psql -v ON_ERROR_STOP=1`. It tests exact cents, confirmation/close/correction, six rejection cases and historical conservation; its transaction rolls back. Complete original migrations through 000323 and the SQL gate passed; the owned container was removed. This does not prove parallel races, service audits, payroll integration or existing-history coexistence with populated fixtures.

Not yet implemented/accepted: reviewed payroll amount references and explicit source integration, production release/real-role acceptance, and retrospective eligibility semantics. Modern DS UI and original-schema service PG checks are implemented and locally verified. Current draft eligibility is active/probation; suspended and departed retrospective rules remain a business gap to resolve. Existing isolated runner owns and removes its temporary container/volume, keeps credentials out of output, and never connects to production.

## Routed service checkpoint

- Shared build, API typecheck/build and Web typecheck passed.
- Focused ESLint and `git diff --check` passed.
- `node --test --require ts-node/register src/modules/hr/hr-insurance-owned-period.spec.ts src/modules/hr/hr-insurance-owned-period-dto.spec.ts src/modules/hr/hr-insurance-policy-version.spec.ts` from apps/api: 13 passed, zero failed/skipped.
- New service tests use deterministic synthetic transaction stubs: independent authority before protected probes; all four write route permission/interceptor metadata; server factor resolution and exact base canonicalization; TypeORM DML tuple handling; original-result replay after expiry/source drift; changed request conflict; required audit propagation and same-manager confirmation/close/correction. These do not prove database rollback or race serialization.
- Detail/list use repeatable-read snapshots so returned revision/state projections share a consistent view. No production writes, historical replay or automatic role grants.

## Real PostgreSQL service verification passed

Added `hr-insurance-owned-period.pg.spec.ts`, enabled only with explicit localhost fixture identity and isolated database prefix. It exercises real AuditService, same-month populated historical coexistence, exact half-cent rounding/fund inclusion, required audit rollback for all four writes and sensitive reads, durable retries including expired previews, employee drift/foreign scope, parallel first confirmation/close/correction, and full production seed replay with zero automatic grants.

First complete original-schema run: migrations and SQL gate passed; service tests 3/5 passed, 2 failed due to fixture errors (actual role link table is `rel_role_perm`; direct departure mutation requires the departure workflow). Corrected the table reference and used the supported suspended-state/version drift case without changing lifecycle guards. The first container was removed. The next run exposed automatic SUPER_ADMIN grants on the second core-seed replay. The core seed now excludes these four new capabilities from that automatic grant path, without deleting explicit role bindings. Final fresh original-schema run: 5 passed, 0 failed, 0 skipped; SQL gate and two full seed replays passed; owned container removed.

Catalog seed 000035 registers four capabilities only. The core seed parent map now retains their insurance hierarchy on full replay. Shared request/response types and seven frontend API methods preserve exact decimal strings and caller retry keys; API transport tests passed 6/6. An action-authorized employee selector returns current employee version and explicit preview eligibility; the ordinary employee projection remains unchanged. Suspended/departed retrospective business semantics remain unresolved and are not counted as parity.

## Modern page checkpoint

Route `/hr/insurance/periods` implements paginated modern revisions, authorized detail, action-scoped employee/version and explicit policy selection, six exact bases/month/fund selection, owned preview, confirmation, close and correction. Inputs changing invalidate previews; unchanged failed writes preserve business and HTTP retry identities. Parent navigation is disabled during writes, scope/permission changes abort reads/writes and suppress late results. Successful operation receipts survive optional list refresh failures. Historical and current versions remain distinct.

Six React interaction tests passed for authority/read-only catalogs, observed version/hash transport, preview/confirm retry, parent locking and revocation, close retries and successful-receipt retention, and correction predecessor/month binding. Six API transport tests passed. Relevant ESLint, Web typecheck and diff check passed. Full Web/API builds are tracked separately until terminal results.

In-app browser inspected the actual worktree component and shared CSS with synthetic API/auth fixtures: desktop viewport 1280/document width 1275 and phone viewport 390/document width 385; no horizontal overflow. Panel padding and card grids were adjusted after inspection. Phone completed synthetic preview -> correction and displayed original closed history plus current revision two. Screenshots and fixture inputs remain in the private `s3-insurance-owned-period-ui-20261003` artifact directory. Browser tab/server were closed and viewport reset. This is not production authentication, business-role UAT or payroll monetary integration.

## Payroll monetary integration checkpoint

The reviewed DSL now exposes 24 explicit kind/component references plus four five-insurance aggregates. Original references retain parser v1; insurance references use v2 and require matching reviewed parser/AST/dependencies. Simulation projects only required components from locked historical facts and freezes the effective parser version. Missing required amounts reject instead of becoming zero; unused NULL components preserve old behavior.

Focused DSL, amount, simulation source and contract tests: 24 passed, zero failed/skipped. API typecheck and focused ESLint passed for the implementation. Full Web build session77988 completed successfully; it covers the prior UI candidate, not production roles. Real full-schema PostgreSQL monetary-effect/NULL-rollback/frozen-history validation is running in the private `s3-payroll-insurance-monetary-pg-20261003` fixture. Explicit historical/modern source selection and modern result references remain pending. No production writes/publication/payment.

Full original migration and SQL gate completed; real payroll monetary service PG test passed 1/1, zero skipped, owned container removed. This run proves pre-explicit-source monetary effects, required-NULL transaction rollback and frozen prior evidence. Latest explicit-source code was added only after that run ended and requires its own database validation.

Explicit source DTO/resolver/service now requires exact employee coverage, modern permissions before probes, matching historical identity/version or scoped current modern revision/version/hash. Modern family locks precede row reads. Modern evidence uses insurance-modern-v1, separate result FK and corresponding difference metadata. Seventeen source/service tests and fourteen history/source tests passed; initial source test lacked reflect-metadata bootstrap and was corrected. No explicit-source UI or modern-source PG acceptance yet.

## Explicit source preparation API and modern page

Added scoped paged insurance-source options for one validated published/frozen payroll source and effective closed attendance month; required same-manager metadata audit, bounded employee count and no salary/insurance amounts in the response. Shared request/response contracts and frontend transport bind explicit choices. Payroll preparation includes per-employee choices across pages, clears on source/scope changes and refresh, disables simulation until all employees are chosen, and retains the HTTP retry key for unchanged failed requests.

Nine frontend source/transport tests and sixteen backend options/simulation tests passed. Three latest source-component tests passed after layout fixes. Shared build, API/Web typecheck, focused ESLint and diff checks passed. A missing test reflection bootstrap, nonexistent ESLint directive and trailing whitespace were corrected. In-app browser tested actual source component/shared CSS with synthetic fixtures at1280 and390; document width matches viewport. Fixed desktop-hidden mobile-only list and narrow card name column; final DS cards stack employee heading and source selector with explicit spacing. Screenshots remain private. Browser tab closed, viewport reset, server stopped. This is not full parent-workbench or real-role production UAT.

Full original-schema modern-source PostgreSQL run8910 and API/Web builds15843/11639 are running against the candidate captured in source-ui result.json. New PG case verifies current version/hash choice, exact amount effect, stale rejection after correction, old frozen result retention and historical item conservation. Until terminal success, these are pending, not accepted. No production writes, publication or payment.

## Modern payroll source validation follow-up

API build15843 and Web build11639 completed successfully. Thirteen focused frontend tests passed: eight transport tests, three source-selector tests and two full-parent workbench tests. The parent tests verify an unchanged failed request retains its body and retry key, and scope changes abort a pending simulation and suppress its late result. Focused frontend test lint passed. These checks do not prove real-role production acceptance.

Run8910 completed with original migrations and the SQL gate passing, but the modern payroll service case failed: the result trigger incorrectly read `period_month` from `hr_attendance_payroll_input_batch`. Migration000247 stores that field on `hr_attendance_period`. The uncommitted, unapplied candidate000323 now joins the period through the batch's `period_id`, binding tenant and park on both joins. Original production migrations are unchanged. A new isolated full-original-schema run53949 is pending; the previous passing monetary test cannot substitute for this modern-source gate.

Run53949 subsequently completed successfully: complete original migrations through000323 and SQL gate PASS, both real payroll service tests PASS, zero failed/skipped, owned container removed. This proves the corrected trigger executes with actual modern-source monetary results, rejects obsolete choices through the service, preserves prior frozen results and historical insurance items, and creates no formal payroll or payslips. Latest Web typecheck passed. Actual business-period reconciliation and production role UAT remain separate pending gates.

Reviewed the changed DSL against the prior version and ran eight prior base-pay/DSL regressions successfully. Rebound only the four dependent compatibility contracts, preserving all pending decisions and compatibility credit. DSL receipt, frozen manifest and progress builders passed; an intentionally wrong DSL hash was rejected. Default progress output has no fresh production receipts and must not be treated as current import status.
