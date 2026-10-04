# Source-bound organization and position continuity

## 1. Scope / Trigger

Incremental `organization/dbo.departmentcode`, `position/dbo.job`, and employee assignment dependencies through the existing encrypted preview/commit API. Original T0 operations, maps and receipts are immutable.

## 2. Signatures

Shared domains are organization, position, employee, profile, contract. Organization `parentSourceKey`, position `orgSourceKey/parentPositionSourceKey`, employee `orgSourceKey/positionSourceKey` are canonical source SHA keys, never target UUIDs. The source table is fixed by dependency domain. Existing package version 1 remains readable.

Reusable input adds `organizationRecords`, `positionRecords` and optional `includeAssignments`. The fixed staging config adds `includeOrganizations/includePositions/includeAssignments`. Structural source columns must be present; `parentPositionCode` and `legacyUptoCode` stay separate. Presence of employee source department/job columns carries these relationships automatically; existing-record replays predating those fields retain compatibility; new non-preboarding employees must provide an exact active organization. Unassigned preboarding is valid, consistent with ordinary employee creation.

## 3. Contracts

- Reject duplicate domain/source identities before graph traversal; sorting must never silently deduplicate input. Topological order precedes chunking and API canonicalization. Prefix-derived department parents use the supplied verified department index. Position relations require exact source codes; no new company-root fallback or name match. Company merge, secondary assignments and station semantics remain explicit pending coverage.
- Original sys_org/hr_position complete v1 witnesses authenticate exact original projection hash, operation/phase/batch/active-map chain and every original dependency. Baseline-only fields:{} commits encrypted provenance and unchanged revision, with no business version/time changes. Old employee baselines can acquire missing assignment comparison facts only from their authenticated saved original witness.
- Three-way comparison uses previous source keys and original target UUIDs separately. Unchanged source fields preserve modern edits/reparenting; source/modern same-field changes conflict. Existing employee assignment revisions require NORMAL_JOB_CHANGE_WORKFLOW_REQUIRED, even if current modern assignment matches. New employees resolve active same-scope owning-compatible dependencies; positionSourceKey must travel with orgSourceKey so a partial new assignment is never discarded.
- Organization create/update requires the respective system permission before original-witness, target-row or parent probes (only source-binding existence metadata may precede this decision); position requires HR_POSITION_MANAGE. Related target/parent scope uses the ordinary DataScopeService via transaction-scoped repositories. HR import authority does not imply either domain authority or hidden-parent visibility.
- Imports and ordinary organization/position creation share lockOrgHierarchy. Lock before source/parent reads, validate cycles/active ancestry, then conditional target version write and ledger/revision in one transaction. Ordinary position database hierarchy triggers remain active. Missing/inactive historical bindings never silently become new source rows.
- Original and newly accepted hierarchy comparison baselines and source facts remain encrypted. No source-absent deletion, implicit resurrection, login account or role creation. Package conflicts keep existing item-level receipt semantics; a thrown write/CAS/dependency error rolls back the complete package transaction.

## 4. Validation & Error Matrix

Malformed source/schema/hash -> YUZHOU_ORG_SOURCE_INVALID / YUZHOU_ORG_SOURCE_SCHEMA_INVALID. Missing exact relation -> YUZHOU_DEPENDENCY_UNAVAILABLE. Hidden related org -> YUZHOU_ORGANIZATION_UNAVAILABLE. Graph cycle -> YUZHOU_SOURCE_DEPENDENCY_CYCLE / YUZHOU_HIERARCHY_CYCLE. Inactive historical source -> YUZHOU_ORIGINAL_SOURCE_INACTIVE. Unsupported historical baseline -> INITIAL_FIELD_BASELINE_UNKNOWN; wrong original witness -> INITIAL_BASELINE_ORIGINAL_EVIDENCE_INVALID. Source assignment revision -> NORMAL_JOB_CHANGE_WORKFLOW_REQUIRED.

## 5. Good / Base / Bad Cases

Good: original baseline-only acceptance then source phone update while preserving modern name; new parent/child org, parent/child job, employee in one package. Base: same source after modern transfer is unchanged. Bad: bind job by current name, borrow a target UUID, silently restore deleted org, replace modern assignment from unchanged source, or repeat full historical A/B for every same-format batch.

## 6. Tests Required

Actual fixed staging CLI -> reusable package -> isolated real PostgreSQL. Original business equality/replay, new dependencies, source update, modern conflicts, scope/permission failures, missing/inactive/cyclic/duplicate relations, independent-connection CAS and ordinary hierarchy-lock race, transactional rollback and residual zero. Existing employee/profile/contract PG suites and original-writer canonical parity remain gates. Shared/API/Web type checks, scoped lint, five-domain summary tests and desktop/390 browser inspection.

## 7. Wrong vs Correct

Wrong: UPDATE employee SET primary_org_id = original_org on every source row. Correct: compare source assignment identities to authenticated accepted facts; preserve unchanged assignments and route changed existing assignments to the normal job-change workflow.
