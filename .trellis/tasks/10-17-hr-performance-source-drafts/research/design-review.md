# Research: Source business draft design review before implementation

- Query: Audit persisted editable source drafts, complete six-family manifests, salary/privacy boundaries, concurrency, direct-SQL guards, and realistic regression coverage; supply exact contracts to freeze before a single writer starts.
- Scope: mixed; local source/design inspection and PostgreSQL 16 primary documentation only.
- Date: 2026-10-17
- Workspace: `/Users/mac/.codex/worktrees/hr-goal-report-ledgers-20261016/jinhu-smart-park`; supplied baseline `44bc07a5a`, main `9ed1e4b8`. No Git operation performed.
- Active task confirmed by `python3 ./.trellis/scripts/task.py current --source`: `.trellis/tasks/10-17-hr-performance-source-drafts` (session source).

## Findings

The additive draft aggregate is an implementable first child of full D. Keep complete immutable evidence, append-only business revisions, one identity per source master, and NOT_EVALUATED qualification. The following material contract corrections are required before implementation. They do not authorize activation, qualification credit, source writes, or new authentication infrastructure.

### R1 — Replayed write responses bypass the proposed live service permission checks

Evidence: child `design.md:6` puts kind authorization in the service. `apps/api/src/shared/interceptors/idempotency.interceptor.ts:88` returns cached responseBody without `next.handle()`; salary/business permissions checked only inside the service therefore do not run on replay. A cached detail payload could leak salary after revocation. The interceptor stores the handler result at line 106. This is a concrete existing mechanism, not a hypothetical JWT issue.

**Replace the write-response and authorization contract with:**

- POST/PATCH/refresh return only an immutable operation receipt: `draftId`, `revisionId`, `revisionNo`, `outcome` (`created|reused|updated|refreshed|alreadyCurrent`). Never put a snapshot, names, source codes, salaries, binding, reason, definition, workflow, differences, or manifest content in a cacheable response. Fetch current/history separately with current read authorization.
- A narrow route-specific live guard runs before IdempotencyInterceptor, resolves kind from the scoped draft or requested create kind, and checks current DB kind-manage permission and selected-park scope. Keep the same check inside the write transaction/SQL guards. Ordinary AnyPermission remains only the outer routing filter. Do not modify global auth behavior.
- Salary authority is checked for every actual business salary write. Replay performs no write and returns only the original non-sensitive receipt; it must still pass the current kind-manage guard. A revoked kind permission must receive 403 even with the old successful key.
- Exact same key/body repeats the original receipt; different key/same source may return the current revision receipt without creating a revision. A PATCH never returns sensitive current values through the idempotency cache.

Acceptance: write with salary authority, revoke salary-read, replay and search the entire response/cache body for the sentinel; revoke kind-manage and replay expecting 403. Repeat using stale JWT flags and selected-park roles.

### R2 — Whole-batch evidence needs structural projection, and salary capture/write semantics need one explicit choice

Evidence: child `design.md:11,16,25` shares all six source tables, while template access requires only template permissions. 300 has source person codes in detail rows (`database/migrations/000300_hr_performance_yuzhou_legacy_model.sql:216`); 302 master rows include person, author, timestamp, narrative and salary (`000302_hr_performance_yuzhou_legacy_master.sql:18`). Merely deleting `source_pay` from a whole-batch response still exposes other employees. Existing 372 salary intersection is explicit at `000372_hr_performance_channel_workflow.sql:170`; live actor semantics are at line 179.

**Freeze this projection/authority contract:**

- Whole-batch manifest is an internal immutable artifact. No GET, history, conflict, write receipt, audit, generic relation serialization or error returns its raw content or row identities. A template response contains only its selected template plus the three definition catalog families; no master/detail records, person bindings, author provenance or salary from the batch. A review response contains only the selected master and its exact same-batch/session/person details plus definition catalogs. Another master's narrative or identity must not appear, even when salary-read is granted.
- Manifest summary is strictly `schemaVersion`, opaque `manifestSha256`, and family counts. No row hashes, canonical source PKs, per-person deltas, value-derived debug output or raw invalid-row samples. Hash is a CAS token, not an authorization or source-qualified assertion.
- Internal capture of immutable source evidence is authorized by the selected kind operation and is distinct from changing business salary. For the editable review baseline, recommended consistent interpretation of PRD salary-write: creation with non-null `source_pay`, refresh that changes `source_pay`, and any human explicit salary assignment (including null) require live PERFORMANCE_READ + PERFORMANCE_MANAGE + COMPENSATION_MANAGE. A denied operation fails atomically; it must not replace pay with null to make creation succeed. Creation with null source pay and unrelated PATCH preserving existing pay need no extra salary-write permission. Template creation never creates an editable salary record, despite its internal manifest containing batch salaries.
- Salary read additionally requires PERFORMANCE_READ + PAYROLL_DETAIL_READ, on every GET/history. Omit the complete `source_pay` property when denied, preserve it internally, and do not let whole-snapshot replacement erase it. Apply the same projection to conflict summaries. An allowed writer without salary-read can receive the non-sensitive operation receipt.
- `reason` is plain human-entered audit narrative, never automatically populated with old/new salary or personal values. Error/audit records contain identifiers, field names, counts and codes only.

**Definition/workflow conclusion:** existing shared validators admit no salary value in workflow: `packages/shared/src/hr-performance-channel-workflow.ts:23` requires the exact policy shape; `salaryReference` there is a stage/actor/required/nullability policy, not a salary amount. `hr-performance-channel-definition.ts:23` rejects unknown keys. Reuse these strict schemas, not arbitrary JSON; reject `workflow.masterPolicies.salaryReference.value`, attached `input`, `preview`, `records` or other hidden value carriers. Never automatically copy pay/person values into definition text/IDs, policy metadata or names. Arbitrary authorized human free text cannot be classified as secret salary by a numeric substring filter; no such false guarantee or generic content scanner is required.

### R3 — Choose one isolation strategy and put source validation after the draft lock, including manifest reuse

Evidence: child `design.md:19` says READ COMMITTED and then “same REPEATABLE READ snapshot or single SQL”, reads source before locking draft, and does not define source drift between initial construction and revision insert. An identity advisory lock serializes new draft writers but does not block existing import/map/rollback writers. 300's source guard permits controlled rollback deletion (`000300...sql:264`), and exact-map constraints acquire map locks (`:330`). Source immutability is not a reason to assume batch/map visibility never changes.

**Replace with this bounded contract:**

1. Use READ COMMITTED for the whole write transaction. No mid-transaction switch to REPEATABLE READ.
2. For create/refresh take the deterministic scope/kind/source-identity advisory xact lock; then lock an existing draft `FOR UPDATE`. PATCH locks the draft `FOR UPDATE`. This order is uniform for all paths that take both locks. Re-read current head after waiting; enforce the caller's expected revision before creating artifacts. A new create is protected by advisory lock plus unique key.
3. Construct all six families, exact fact/map/batch evidence, selected baseline and SHA from one source statement snapshot. Implement the source-reading helper as `STABLE SECURITY INVOKER`, with explicit schema-qualified objects and no writes; do not invoke a VOLATILE helper that runs separate source queries and assume they share the outer snapshot. Explicitly sort arrays by family/source identity/fact UUID under C collation and hash the resulting jsonb text in DB.
4. A final revision INSERT guard revalidates the selected source and entire expected content/hash in its current statement snapshot for **both newly inserted and reused manifests**. A matching previously stored manifest is not proof that the source is currently visible. Compute content/hash/baseline together in one STABLE helper call per validation. Reject a newly committed source/map/batch change observed at this point with 409, rolling back all child artifacts.
5. The successful final source-validation statement is the documented source snapshot boundary. A source change committed after that statement is a later generation and does not rewrite the retained revision. This child does not claim commit-time exclusion of unrelated import writers. If a stronger commit-time freshness invariant is required, it needs a proven shared lock protocol with those writers; an advisory lock alone cannot provide it. Do not add broad legacy table locks or change source guards in this child.
6. Read history head/count/page together in one SQL statement. Human PATCH checks head and edits its immutable stored baseline; it does not re-read current source or block existing draft editing just because a later source batch exists. Refresh is the only source replacement operation.

This preserves one complete source generation, catches drift while waiting on a draft lock, and avoids falsely claiming repeatable-read semantics. PostgreSQL 16 confirms statement snapshots at READ COMMITTED and the caller snapshot behavior of STABLE functions: [transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html), [function volatility](https://www.postgresql.org/docs/16/xfunc-volatility.html).

### R4 — “62 fields retained” must not mean every non-PK field is an editable arithmetic input

Evidence: matrix counts are 11 + 6 + 5 + 7 + 12 + 21 = **62 business source columns**, plus 12 hash columns. 302 explicitly describes master values as summary/recomputed values (`000302...sql:3`) and preserves total as comparison baseline (`:185`). Child `design.md:16` currently allows all remaining source fields, which includes original author/time and derived summary scores. That permits contradictory detail scores and manually edited totals while calling both current business values.

**Replace blanket mutability with this field-class contract:**

| Family | Retained fields | Fixed identities/relations/provenance | Editable business fields |
|---|---:|---|---|
| template_profile | 11 | source_assessment | name, department label, five percent strings, three boolean switches |
| level_rule | 6 | source_ass_grade (source PK), source_assessment_id | description, order text, min/max |
| dimension_profile | 5 | source_item_id, source_assessment_id | name, full_value, order |
| dimension_level_guide | 7 | source_guide_id, source_item_id | grade label, description, min/max, order |
| dimension_result | 12 | source_detail_id, source_session_id, source_person_code, source_item_id; source_self_grade/source_ass_grade retained as source grade evidence | five channel detail values, appraisal |
| master_result | 21 | source_master_id, source_session_id, source_person_code; source_assessment_person/source_operator_code/source_recorded_at as immutable source authorship; source_self_grade/source_ass_grade and five channel summary values/source_total_value as comparison evidence | master/timekeep/bonus adjustments, self_appraisal/appraisal/description, permission-gated pay |

All fixed source fields remain readable under the appropriate projection and preserved in manifest/revisions. Future formal outputs are recomputed through core370 from current accepted business inputs; never initialize a modern computed total/grade from an editable source comparison scalar. No source authorship becomes modern created_by/time or approval. If a business requirement later needs a separate manual comparison annotation, give it a distinct typed field; do not overload output columns.

Changes are a closed discriminated list `{family, sourceFactId, field, value}` (or equivalent stable record locator), never arbitrary JSON pointers or full snapshot replacement. Reject duplicate changes, unknown record IDs, unknown keys, fixed field assignments, altered record membership and no-op writes. Precision/scale/range/nullability follow each SQL source type, with source integers as decimal strings, finite numeric strings only, boolean/null unchanged. Timestamp evidence uses an explicit timezone-free six-microsecond format; do not let DateStyle/session timezone or JS Date change evidence/hash.

Definition/workflow are separately authored intended modern configuration; source evidence alone must not select a template, invent role assignments or imply activation readiness. Always validate the resulting pair after any patch: workflow non-null requires definition non-null and workflow validation against that resulting definition; clearing definition requires clearing workflow atomically. Source-derived record edits do not silently mutate this separately authored config. Later activation must explicitly reconcile its item/detail mappings and input/output carriers; it cannot treat the draft's two representations as already proven equivalent.

### R5 — Close the direct-SQL origin/manifest and head loopholes explicitly

Evidence: `design.md:22` names guards but does not specify which transitions cannot change source, or whether the all-history human rule is enforced by DB. A human revision pointing to a new manifest can otherwise bypass refresh conflict preservation; a forged later `origin=source` can bypass the human history check.

**Freeze the following database invariants:**

- First revision only: origin=source, revision_no=1, predecessor null, exact server-selected source baseline, binding/config initially empty as specified, source fact kind and identity bound to the parent. Create reason is server-owned (`source intake`); POST has no reason field today.
- Human successor: previous=current head, no missing/extra/reordered identity tuples, same manifest_id/source_fact_id as previous, all fixed fields unchanged, allowed typed business changes only, at least one effective change. Live kind-manage and salary-write checks apply. A human successor cannot change the source batch or origin history.
- Refresh successor: previous=current head, same stable parent source identity/kind/table, exact selected new source baseline, expected new SHA verified, and **no origin=human anywhere in this draft's history**, enforced in the revision INSERT guard. Equal current manifest is a no-op returning alreadyCurrent with no revision, even if human history exists; a different manifest with any human history is a conflict. Different-key create against a same-identity/same-manifest human head reuses it intact. Different manifest requires refresh.
- Scoped composite keys/FKs bind manifest, draft, revision, predecessor and head to the same tenant/park and parent. Parent head may advance only to the exact new successor, never null, an old revision, a revision on another draft or an unadvanced insert. Append-only triggers reject update/delete of manifest and revision; deferred checks catch orphan first heads and detached successors.
- DB verifies each newly recorded actor exists in the tenant and has current selected-park/kind authority; created_at is server transaction time. Historical unchanged actors require same-tenant existence, not retained current privileges. Follow 372's sys_user FK + actor_has semantics (`000372...sql:179,391`), including protected tenant SUPER_ADMIN and ordinary target-park binding.
- Authority caveat: this follows existing trusted-service DB author semantics. A direct SQL writer choosing another valid authorized `created_by` is not cryptographically bound to an HTTP principal by `actor_has`; do not claim protection against a compromised database owner/runtime account. The API supplies authenticated actor/time and accepts neither from clients. No new authentication stack or pretend GUC-based identity guarantee is required.

### R6 — The existing test harness is a starting point, not yet a source-intake fixture

Evidence: `apps/api/src/modules/hr/hr-performance-channel-workflow.pg.spec.ts:49` loads actual migrations258/259 then copies base tables from the core spec at line50. `hr-performance-channel-snapshot-core.pg.spec.ts:61` defines a reduced migration_batch without execution_context/production_import_phase. Workflow test's only source fixture (`...workflow.pg.spec.ts:55`) is status running + map loaded, so it cannot pass the new succeeded production_import/exact-map path. It is useful preservation evidence, not a successful source draft intake fixture.

**Replace the fixture acceptance contract with:**

- Owned PostgreSQL16, real300/302/370/371/372/new373 and required actual dependencies; actual permission helper, guard functions, ValidationPipe, PermissionGuard, narrow live kind guard, DB idempotency and AuditService/Interceptor. Synthetic authentication principals only. Record which foundational schema is projected and add every actual consumed column/constraint; do not stub source helper/permission helper to true.
- Seed one owned synthetic successful production_import batch with complete six-family facts and exact verified maps. Add a second batch sharing one source identity and a second independent master for the same person/session. Use at least101 details, repeated item IDs,41 grade candidates, nulls, all62 business columns, max18,2/int32/18,0/19,4 sentinels and timezone-free timestamp. Keep test source fixtures explicit; no production samples.
- Test three privacy roles separately: template-only, performance manager without payroll-detail-read, and salary reader/writer. Test another master in the same batch; recursively scan every response/error/history/conflict/write receipt for disallowed sentinel values. Test forbidden unknown definition/workflow salary carriers and stale JWT replay after revocation.
- Use two real connections and barriers for same-head PATCH, create dedup, refresh waiting behind human PATCH, and source generation change between preview and final validation. Do not use sleeps alone as race evidence. Add reused-manifest drift, missing/invalid-map rejection without silent row dropping, and all-history human preservation after refresh attempts.
- Direct SQL must reject altered source content/hash, wrong scope/actor/parent/head/predecessor, human manifest replacement, later source-origin reset, changed immutable provenance/output, extra/dropped records, salary without its intersection, and detached revision/head changes. Assert rollback leaves zero partial artifact/revision changes.
- Fingerprint original facts/maps/receipts and existing372 functions/ACL before/after operations. Fixture phases may deliberately create alternate source generations; isolate those cases and compare invariance around each draft operation, rather than treating fixture setup as an application mutation. Existing receipts absent from a projected schema are **not tested**, not implicitly unchanged.
- Shared/API focused checks and builds are required implementation evidence; no tests were run during this design audit. UI390px, activation/receipt binding, full qualification, normal lifecycle, production and real-role acceptance remain parent deliverables.

## Files Found / Related Specs

- `.trellis/tasks/10-17-hr-performance-source-drafts/{prd,design,implement}.md` — proposed child contract under review.
- `.trellis/tasks/10-16-hr-performance-formal-source-continuation/{prd,design}.md` — retained full D requirements, activation and receipt-bound baseline.
- Parent `research/formal-intake-api-inventory.md` — existing formal API and372 guard inventory; `research/qualification-inventory.md` — visibility versus actual308/309/310 qualification.
- `.trellis/tasks/10-16-hr-performance-formal-source-weights/research/source-field-carrier-matrix.csv` — 62 business columns +12 source hashes; all rows inspected and family counts verified by csv parser.
- `database/migrations/000300_hr_performance_yuzhou_legacy_model.sql`, `000302_hr_performance_yuzhou_legacy_master.sql` — exact six-family fields, source append-only/map guards and legacy summary semantics.
- `database/migrations/000372_hr_performance_channel_workflow.sql` — current live actor, selected park, salary, author and input/head rules.
- `apps/api/src/modules/hr/hr-performance-legacy.service.ts:999` — existing visibility is not full qualification.
- `apps/api/src/shared/interceptors/idempotency.interceptor.ts:88` — replay returns cached result before service authorization.
- `packages/shared/src/hr-performance-channel-definition.ts:15`, `hr-performance-channel-workflow.ts:23` — strict config/policy shape and coupled validation.
- `apps/api/src/modules/hr/hr-performance-channel-workflow.pg.spec.ts:49`, `hr-performance-channel-snapshot-core.pg.spec.ts:61` — actual migrations with projected foundational fixtures.
- `.trellis/spec/api/backend/hr-performance-channel-workflow.md`, `hr-performance-channel-definition.md` — immutability, permission, salary, exact arithmetic and required PG/HTTP test conventions.
- `.trellis/spec/api/backend/index.md`, `.trellis/spec/shared/backend/index.md`, `.trellis/workflow.md` — scope, shared contracts and persistent phase1.2 evidence.

## External References

PostgreSQL16 is the existing owned test image (`...channel-workflow.pg.spec.ts:29`). Official [transaction isolation](https://www.postgresql.org/docs/16/transaction-iso.html) and [function volatility](https://www.postgresql.org/docs/16/xfunc-volatility.html) were checked for the R3 snapshot recommendation. No dependency recommendation or version upgrade is implied.

## Caveats / Not Found

- Only this research file was written. No application/spec/design edits, tests, migration execution, production queries, Git operations, or agents were performed.
- Source-qualified remains NOT_EVALUATED; no308/309/310 approval/equivalence credit is inferred from visibility or synthetic fixture success. Parent activation/UI/full D scope is retained.
- Parent-provided SHA and production-zero observation were not refreshed; they are context, not live runtime proof. Six-table zero counts apply only to the observed current scope; archived source counts were not established. No missing import, need to re-import, production import authorization, or need to redo backup analysis follows from those counts.
- Memory was used only for the standing import/function-reproduction priority; concrete findings above come from current workspace files and official PostgreSQL documentation.
- Recommendation to root: apply R1–R6 to child design/acceptance artifacts, then dispatch the single implementation writer. This report is a bounded design review, not implementation or release approval.
