# Performance template version continuity

## 1. Scope / Trigger
Modern operators configure actual enterprise dimensions and grade bands and continue saved templates through appended draft versions without replacing historical cycles.

## 2. Signatures
`GET /hr/performance-v2/templates/:id`; `POST /hr/performance-v2/templates/:id/versions` accepts inherited full CreateHrPerformanceTemplateDto plus expectedVersionId. Creation and publication retain existing endpoints.

## 3. Contracts
Detail requires TEMPLATE_READ or TEMPLATE_MANAGE; version creation exact TEMPLATE_MANAGE, actor tenant/park matching scope before SQL. Body identity code/name must match immutable parent. Strict real ValidationPipe retains nested array1..30/1..20 constraints and UUID optimistic target. Weights precision4, score precision2 match database numeric fields.
Reuse existing total-weight/unique-code/range/continuous-level validation. Inside transaction lock parent first, then read current version and compare expectedVersionId; only one concurrent same-base version succeeds. Insert new draft and children with preserved scoringGuide, advance parent current pointer; never update/delete previous versions or cycle snapshots. Parent identity and version name immutable by existing migration000258; editing continues as a new named version, including saved drafts.
Publication can publish only the current draft version; older draft conflicts before any update. Current pointer may identify a draft while previous published versions remain valid cycle options. Server owns score totals and frozen publication, no payroll or employee writes. No migration/env/auth expansion.

## 4. Validation & Error Matrix
Malformed/inherited DTO/UUID/precision ->400. Missing exact authority/actor scope ->403 before SQL. Parent absent ->404. Retired/stale/identity change ->409 with no inserts. Old draft publication ->409. Published children and frozen cycle changes rejected by existing database guards.

## 5. Good/Base/Bad Cases
Good: v1 published cycle remains scored from v1 after concurrent append produces exactly one v2 draft. Base: old published versions remain immutable and selectable by explicit ID. Bad: overwrite version name/dimensions or allow stale publication to replace the latest pointer.

## 6. Tests Required
Service/DTO permission, scope, stale/identity/validation and publication tests. Opt-in HR_PERFORMANCE_TEMPLATE_VERSION_PG_REQUIRED=1 only owned loopback15485 database: actual unmodified000258 with minimal prerequisite tables, real concurrent append, published child rejection, frozen-cycle preservation and exact scoring. Lab validates domain guards, not full schema/bootstrap/real business UAT. Random database and container cleanup required.

## 7. Wrong vs Correct
Wrong: select joined current version before waiting for parent lock. Correct: lock parent, then resolve current version and optimistic identity inside the same transaction.
