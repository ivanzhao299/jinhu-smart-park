# Formal payroll rule versions

## 1. Scope / Trigger

Modern payroll rules must be authored and maintained without invented historical scheme/formula IDs. This contract is one implementation stage of the complete formal payroll workflow; it does not accept the payroll run or UI workflow by itself.

## 2. Signatures

`HrPayrollFormalRuleController` provides `/hr/payroll/rules`, scoped set versions, draft update, submission, review and effective-month lookup. `lockEffectiveVersion` is an internal transaction primitive for payroll consumers. `000347_hr_payroll_formal_rules.sql` creates scoped rule sets and versions, with optional one-to-one source-book lineage.

## 3. Contracts

Read uses RULE_READ, authoring uses PAYROLL_MANAGE, review uses FORMULA_REVIEW. All HTTP writes use idempotency and body-free audit; required write audits use the same transaction manager. Service authority precedes probes. Nested DTO validation rejects unknown fields, missing definitions and unclassified accounting roles.

Parent UPDATE locks serialize new revisions, draft writes and review. `expectedHeadRevision` protects append; `expectedVersion` protects edits and transitions. The database increments the scoped parent head with insertion and enforces sequential drafts. Only drafts are editable, submitted payloads are frozen, approved/rejected versions cannot be updated or deleted. The creator, latest author and submitter cannot review that version. Exactly one approved version per effective month; lookup chooses the latest approved start month not after the requested month. Expected effective UUID mismatch rejects calculation preparation.

Persist definition evidence containing AST, parser version/hash, dependencies, rounding and engine versions. The DB hash binds definition plus evidence. Submission, review and effective consumers recompute and compare evidence; changed interpretation requires a new reviewed revision. Syntax validation never approves rules. Evidence/AST and audit identities are not exposed in public rule projections.

The formal kernel requires explicit accounting roles and `line_items_half_up`: monetary lines round before subsequent references; informational quantities retain four decimals. Earnings equal gross and gross equals deductions plus tax plus net. No missing input becomes zero, no computed project accepts direct replacement, and employer contributions do not reduce employee net.

Salary references additionally require approved `compensationPolicy`: `full_period_single` requires one source covering the complete eligible period; `calendar_day_prorated` weights each eligible salary segment against the whole period's calendar days. Eligibility must be explicit and contained within the period. Gaps, overlaps and duplicate/invalid source versions reject projection. Use exact integer cents, sum before rounding to four decimal places, then apply the rule's monetary-line rounding. Bulk scoped source reads lock compensation and plan versions; formal runs must freeze those source versions. The projection helper alone does not prove run integration.

## 4. Validation & Error Matrix

No authority -> denial before probes. Foreign set/source -> not found. Stale head/version/effective identity, duplicate effective month or concurrent review -> conflict. Required audit failure -> all writes including parent-head increment roll back. Unsafe definitions, missing tax/gross/net or inconsistent money -> invalid input. Parser evidence drift -> conflict before submission, review or effective use.

## 5. Good / Base / Bad Cases

Good: author revises a draft, submits, independent reviewer selects an effective month, and future preparation binds that exact version. Base: manually created rules have no source book; mapped rules preserve the original catalog unchanged. Bad: manufacture a legacy ID, change an approved formula, silently reinterpret it after an engine upgrade, or treat these endpoints as a completed formal payroll UI.

## 6. Tests Required

Unit tests cover authority without probes and malformed nested DTOs. Opt-in owned localhost PostgreSQL15490 executes the entire new migration with only its original-book FK prerequisite fixture, then actual service SQL: source scope/duplicate mapping, draft and review races, creator/latest-author/submitter separation, stale writes, effective month selection, parser drift, database immutability and audit rollback. Drop the random DB and remove the owned container. This is not the full original fresh/upgrade migration gate, HTTP integration or real payroll acceptance.

Before completing the full task: original fresh/upgrade migrations, unified effective consumers, actual inputs/snapshots/run integration, actual Web desktop/390px and role interactions, and selected real-month amount verification remain required.

## 7. Wrong vs Correct

Wrong: raw formula text alone is the approved interpretation, or a standalone kernel is published as formal payroll completion. Correct: freeze verified interpretation with a reviewed version and continue implementation through inputs, formal batches and modern operator workflows.

## Formal input API stage

000348 stores scoped period/rule-bound input revisions. Read endpoints are `/hr/payroll/inputs` and `/:id`; creation, draft PUT and confirmation POST are wired to HrModule. Metadata list requires PAYROLL_READ and omits employee/monetary payloads. Paged detail requires PAYROLL_DETAIL_READ plus EMPLOYEE_READ before probes; every successful or empty read has required same-transaction audit. Financial writes require detail/employee reads plus manage or review, body-free audit and HTTP idempotency. DTO version guards and latest revision protect writes; confirmed payloads remain immutable. Unknown/non-overlapping employment dates require explicit paired `settlementStart`/`settlementEnd` within the period plus a business reason; a reason alone cannot authorize an unspecified salary window. The normal window intersects actual hire/departure dates with the period. Preserve exception dates in input revisions and recheck on independent confirmation; never rewrite employment dates for a settlement. Employee checks batch scoped IDs in deterministic order.

Shared role/definition/input types live in packages/shared/src/hr-payroll-formal.ts; pages use the standard PaginatedResult response (`page_size`) and explicit query `pageSize`. Web hrApi sends structured exact decimal strings, versions, cancellation signals and caller-retained idempotency keys. Its actual request tests prove transport only; modern operation screens and formal-run consumers are still required.

`lockConfirmedInput` is an internal formal-run transaction primitive. Authority precedes all probes; it locks an open period, the current effective rule and the selected confirmed input, then checks the expected input version and latest confirmed revision. A newer unconfirmed draft does not replace the latest confirmed revision. Employee versions, approved direct-project coverage and settlement dates are rechecked under employee share locks. Return exact input hash, version, rule evidence and normalized inputs for the consumer to freeze. The caller must retain the same transaction through remaining source locks and payroll persistence; this primitive is not a public financial read and must not be returned directly by a controller. It alone is not formal-run completion.

`calculateFormalPayrollWithSources` composes the approved definition with eligibility, salary intervals, attendance facts and insurance components. It verifies selected employee identity/version, reads only referenced attendance and insurance fields, and never supplies zero for a missing source. Insurance projection uses domain-prefixed keys internally; the formal kernel receives unprefixed HR codes. It returns balanced amounts/items and independent copies of source evidence so later object changes cannot mutate the result. The database consumer remains responsible for scoped source locks and confirmation/closure status. This pure composer is not source approval, run persistence or production acceptance.

## Formal run persistence stage

`POST /hr/payroll/formal-runs` requires PAYROLL_MANAGE, PAYROLL_DETAIL_READ and EMPLOYEE_READ before service probes. It uses HTTP idempotency and body-free audit. One transaction locks the selected confirmed input/open period/effective rule/employees, then required salary, closed effective attendance and explicitly selected modern confirmed insurance versions. It calculates every roster member before inserting a run, bulk payslips and monetary items. Informational quantities remain in immutable evidence at four decimals rather than being coerced into the legacy money column. Missing sources never skip employees. Amount totals use integer cents and the existing numeric bounds. Required audit failure rolls back the whole batch.

Base runs may have disjoint rosters within one period; employee overlap requires correction. A correction must reference a confirmed scoped run in the same period, preserve its roster and include a reason. Only one active successor per original is allowed under the period lock. Keep original run/results. Migration000349 creates scoped evidence FKs, a DB-computed snapshot hash and immutable evidence/payslip amount/item/run-total guards; review/confirm status transitions remain possible.

The owned PostgreSQL suite executes original233/247 and entire new347/348/349 migrations with catalog/employee/period prerequisite fixtures. It proves direct-input persistence, audit rollback, overlap/correction checks and frozen amounts; a second roster proves actual salary interval and closed attendance SQL produce gross4700, deduction100, tax80.10 and net4519.90 with two salary source snapshots. This is synthetic evidence, not complete original migration coverage or real-month acceptance. Modern insurance SQL through this consumer, source insertion concurrency, complete HTTP integration, independent run review/confirm, modern pages and retirement of the simplified create endpoint remain required before release.

## Formal review and operator detail stage

`GET /hr/payroll/formal-runs/:id` returns bounded, database-paged employee calculations and all project roles, including informational quantities. It requires detail plus employee reads and a required same-transaction read audit. No raw source snapshot, hash or audit identity is exposed. Action eligibility is advisory; writes always recheck status/version/authority. Shared contracts and Web hrApi carry explicit versions, review reasons, abort signals and stable idempotency keys.

Review and confirmation require their separate permissions plus detail/employee reads. Calculation authors cannot review or confirm their own run. An authorized independent reviewer can also confirm: two operators suffice, no third-person staffing requirement. Each action requires expected version and a meaningful reason, verifies persisted sums against immutable calculation evidence and records an immutable action in the same transaction. Confirmation updates the run and all payslip statuses atomically. Required audit failure rolls back the action/statuses. DB guards require the matching action to transition formal status. The previous transition/adjust endpoints explicitly reject formal runs; modern pages must select the governed flow.

Actual PostgreSQL tests prove review/confirm concurrency permits exactly one transition, self-review/confirmation and stale requests fail, audit failure preserves prior status, confirmed payslips match the run, action records stay immutable, and protected paged detail does not return snapshots. HTTP integration, user-visible workflow and real-role acceptance remain required.

## Payroll preparation candidates

GET /hr/payroll/inputs/preparation is author preparation, not payroll calculation. Before any probes it requires MANAGE, DETAIL_READ, EMPLOYEE_READ and RULE_READ. Validate period/rule IDs, keyword length and page bounds. Lock the open scoped period and resolve the verified effective rule; return its definition and ID, current input head, and paged employee identity/version/date windows. Preserve all employee statuses as candidates. Unknown, invalid or non-overlapping employment dates return requiresSettlementWindow with no fabricated range. Exact input creation/confirmation remains responsible for validating the explicit reason and both settlement dates. Required read audit runs in the same transaction; no snapshot hashes or monetary defaults are exposed. Keyword search is parameterized literal substring, not caller SQL or wildcard interpolation.

Actual owned PostgreSQL proves effective rule, midpoint hire range, exact version/head, empty/beyond-last paging totals, explicit settlement flag, foreign park exclusion and audit failure. The service/unit boundary proves every missing permission denies before probes. Web transport proves encoded keyword and abort propagation. These do not prove an operation page or real month acceptance.

Input detail now includes canEdit/canConfirm advisory booleans. Require the latest scoped input revision, open nondeleted period and draft status; edit requires manage, confirm requires review and an actor different from creator/latest author. Never return audit identities to support UI decisions. Actual PostgreSQL verifies author/independent reviewer flags, superseded and confirmed immutability. These are advisory; mutation locks/effective rule/employee version validation remain authoritative.

## Formal run source choices

GET /hr/payroll/formal-runs/options requires manage/detail/employee capabilities before probes. Validate input UUID, selected version and bounded employee paging, then reuse lockConfirmedInput for open period, latest confirmed input, effective interpretation and live employee checks. A shared dependency classifier drives both these options and create; unused attendance/insurance sources are not queried.

Return same-month closed effective attendance batches with roster coverage, paged employee identities and their latest confirmed owned insurance choice (id/version/hash as transport conflict tokens, never displayed as business labels). Expose base eligibility by current overlapping employees. Correction choices must be confirmed, in the same period, have the exact selected roster and no active successor. Reads are audited in the same transaction. Options are advisory: create rechecks and freezes the actually consumed choices; an option read cannot approve a new calculation.

Actual PostgreSQL source tests prove unused-source projection, paging, scoped input/version/audit denial, base/overlap and same-roster correction choices, closed attendance coverage, missing/latest insurance options and rejection of superseded insurance selections. Actual formal consumer persists gross100/deduction25/net75 and latest insurance identity in frozen evidence. The insurance producer tables in this suite are explicit prerequisite fixtures; its original preview/confirmation guards, concurrency and full migrations are separate required evidence, not proven by this consumer test. Do not present it as a real payroll month or production acceptance.


### 正式生成与更正工作区（2026-10-09）

简化工资创建入口已退役，仅提示使用正式已确认输入流程且不探测或写数据库。旧批次列表以tenant/park/runIds查询正式证据并投影usesApprovedInputs；正式批次由正式版本动作处理，旧工资条手工校正不可绕过冻结证据。


### 完整旧账约束衔接

正式批次写入既有 hr_payroll_run 时，deduction_total 保持原约束的全部扣除口径：分项扣款加个人税额。正式快照及工资条分别保存扣款/税额，不能移除 000243 金额平衡约束以绕过错误。000350 使用 formal_input_id 绑定确认输入；记录批次仍保持一个月份一个正常批次，正式批次允许互不重叠名单并通过期间锁及员工重叠核对串行创建。同一正式输入不能重复建立正常批次。冻结证据必须与批次正式输入一致，确认后不能改变。完整HTTP/PG用真实审计及幂等数据库，合成主体验证权限；不替代JWT/真实角色和真实业务金额验收。

## 现代账套关联候选

GET /hr/payroll/rules/book-options 同时要求RULE_READ及MANAGE，在任何探测前校验权限。按同租户/园区、未删除及未被规则集关联的账套查询；名称使用参数化literal子串，编号精确匹配；稳定排序分页，单语句给出同快照total及items，空页保留total。必需读审计在同一事务内，失败不返回结果。创建复用既有账套锁/范围外键/唯一映射约束，候选不代替写时校验。规则列表及创建直接投影sourceBook业务名称/编号，避免依赖候选页。关联只维护业务身份，不批准公式，不覆盖冻结工资；无关联仍可独立计算。无需新迁移。
