# Research: Qualification inventory for formal Yuzhou performance source continuation

- Query: Identify exact existing joins, identity/hash fields, statuses, and read-only aggregate checks needed to qualify import receipt, 000309 person/detail evidence, employee identity, and complete candidate/item/detail facts.
- Scope: internal
- Date: 2026-10-16

## Findings

Reviewed current checkout migrations `000235`, `000300`, `000302`, `000308`, `000309`, `000310` and `apps/api/src/modules/hr/hr-performance-legacy.service.ts`. These are source contracts only; no database was queried.

### Shared import/map qualification

`migration_batch` (`000235`) identifies a run with `id`, `run_id`, `source_system`, `source_snapshot_sha256`, `target_database`, `phase`, `status`, `counts`, timestamps. `migration_batch_item` is keyed by `batch_id,domain,source_object,phase`, with extracted/valid/loaded/rejected counts and nullable `checksum_sha256`; qualification should require the exact requested source object item(s) in the relevant phase to have `status='succeeded'`, non-null checksum, and count reconciliation rather than infer success from a batch alone. For a production-owned batch, later contracts additionally require `execution_context='production_import'`, `production_import_phase='T0'`, target database equals `current_database()`, and `status='succeeded'` (see 000308/000309 capability/receipt checks).

`legacy_record_map` fields are `id,batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active`. Exact ownership joins must bind map id to fact `legacy_record_map_id`, batch id to fact `migration_batch_id`, source system/table, canonical PK and both SHA-256 values, target table/id, `mapping_status='verified'`, and `is_active=true`. For import receipt qualification, bind receipt `migration_batch_id` to the same batch and its parent production operation/phase; receipt needs `status='succeeded'` and no rollback marker/status. Validate receipt hashes against the exact artifacts/code/migration hashes named in its row, not merely regex shape. `000308` relation receipt is explicitly a distinct predecessor receipt; do not treat its 7/117/234 relationship counters as assessment fact totals.

### (a) Import receipt qualification

For the relevant owner import, small aggregate outline:

1. Select the single `migration_batch` by exact operation-linked batch id; return only ids, enums, target database equality, counts, and hashes. Require production import context, T0, succeeded, and expected source snapshot hash.
2. Join the parent `hr_yuzhou_production_import_operation` and phase row; require operation/phase succeeded (or the precise live continuation phase contract), plus its source restore receipt/payload and T0 artifact hashes to match the sealed continuation evidence.
3. Join `migration_batch_item` by batch and exact source domain/object/phase; report per-object `extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,status`. Require succeeded and expected count/hash reconciliation.
4. Join receipt ledger by its `migration_batch_id` and compare receipt’s `source_snapshot_sha256`, `code_sha`, `mapping_contract_sha256`, target identity/scope hashes, parent receipt hashes, and own receipt hash to the approved artifacts. Require `status='succeeded'`, no rollback fields, and no open/unresolved blocking error rows for qualified source identities.

Concrete receipts: 000308 `hr_yuzhou_performance_relations_production_receipt` has operation/batch ids, code/source/mapping/target/scope hashes, T0 and relation artifact hashes, 305/306 hashes, fixed relation counts, `status,receipt_sha256,rollback_operation_id,rollback_receipt_sha256,rolled_back_at`. 000310 `hr_yuzhou_performance_fact_identity_production_receipt` has `operation_id,migration_batch_id,sealed_plan_sha256,authorization_artifact_sha256,authorization_nonce_sha256,extension_nonce_sha256,code_sha,source_snapshot_sha256,mapping_contract_sha256,target_identity_sha256,tenant_id,park_id,target_scope_sha256,t0_phase_receipt_sha256,parent_performance_relations_contract_sha256,parent_relations_receipt_sha256,fact_loader_receipt_sha256,migration_308_sha256,migration_310_sha256`, fact/resolution/cycle counts, `fact_set_sha256,resolution_state_sha256,fact_owner_maps,relation_owner_maps,verified_owner_maps,owner_map_state_sha256,status,receipt_sha256`, and rollback fields. Its status constraint is `succeeded` with all rollback fields null, or `rolled_back` with rollback fields populated. No `hr_yuzhou_performance_fact_identity_production_receipt` is joined by API visibility. 000309 operation lifecycle requires timestamps and `applied_state_sha256`; its operation row is linked to its own migration batch. Exact latest runtime receipt/table state cannot be inferred from checked-in migration definitions.

### (b) Person/detail template evidence (000309)

`000309` stores person assessment evidence in `hr_performance_legacy_person_assessment_evidence`: exact key is batch + `source_person_identity_sha256` + nullable `source_assessment_id`; evidence carries `evidence_sha256`. Its weight-resolution rows (`hr_performance_legacy_ass_compute_weight_resolution`) join to `hr_performance_legacy_master_result` through `legacy_master_result_id` with tenant/park/batch scope. Exact resolution fields from 000307 are `source_person_evidence_count,source_person_assessment_id,person_template_candidate_count,person_template_profile_id,person_resolution_status,detail_template_candidate_count,detail_template_profile_id,detail_resolution_status,comparison_status,evidence_sha256`. 000307 constraints define `comparison_status IN ('matched','mismatch','not_comparable')`; matched requires both sides resolved and equal profile ids, mismatch requires both resolved and unequal ids, not_comparable requires at least one unresolved side. Person statuses are `not_applicable,evidence_unmatched,evidence_ambiguous,assessment_missing,template_unmatched,template_ambiguous,resolved`; detail statuses are `unmatched,ambiguous,resolved`.

For each master require one resolution row joined on `(legacy_master_result_id,tenant_id,park_id,migration_batch_id)=(master.id,master.tenant_id,master.park_id,master.migration_batch_id)`. Evidence joins by same scope plus `source_person_identity_sha256`; the resolution helper derives exact counts and expected assessment/template ids and the trigger verifies every listed field and canonical `evidence_sha256`. Qualification for this branch requires `person_resolution_status='resolved'`, evidence count 1, person template candidate count 1/profile non-null, detail status resolved and detail candidate count 1/profile non-null, and `comparison_status='matched'` (which enforces equal profile ids). Report other enum partitions as counts. No person code/name needs to be selected.

### (c) Employee identity

For each `hr_performance_legacy_dimension_result` and `hr_performance_legacy_master_result`, identity resolution key is fact id + tenant + park + `migration_batch_id`, with `fact_kind` distinguishing `dimension_result` from `master_result` and `person_role='subject'`. Resolution carries `source_person_identity_sha256` (derived from `source_person_code`), `person_resolution_status`, owner T0 map id, target employee id, and evidence hash. Require source identity hash equals `hr_performance_yuzhou_person_identity_sha256(fact.source_person_code)`; status `resolved`; exact unique T0 candidate (one candidate) whose `owner_t0_record_map_id` and `target_employee_id` equal resolution; owner map identifies `dbo.person`, canonical source key `sha256:<identity hash>`, `target_table='hr_employee'`, `mapping_status='verified'`, active, target id equal resolved employee. Join `hr_employee` on id+tenant+park and require not deleted. These are the semantics in current service `resultSubjectIdentityJoin` and 000310 fact resolution rules. Employee resolution alone does not establish cycle employee/session binding; keep those identities separate.

### (d) Complete candidate/item/detail fact coverage

The “complete” target sets are `hr_performance_legacy_template_profile` (template sources), `hr_performance_legacy_level_rule`, `hr_performance_legacy_dimension_profile` (items), `hr_performance_legacy_dimension_level_guide`, `hr_performance_legacy_dimension_result` (details), and `hr_performance_legacy_master_result`. For every table, qualify the fact-to-map exact join described above and require SHA fields be valid and identical on fact/map. Source uniqueness is batch/scope plus source key: profiles `source_assessment`; level rules `source_ass_grade`; items `source_item_id`; guides `source_guide_id`; details `source_detail_id`; master `source_master_id`. Use source identity SHA as cross-table source identity, and source row SHA to compare the precise row snapshot; do not assume a PK alone is globally unique.

Small aggregate output per fact family should contain only `count(*)`, distinct source identities, map match count, invalid/missing SHA count, non-verified/inactive map count, duplicate identity/key count, and a deterministic set hash over ordered `(fact_kind,source_identity_sha256,source_row_sha256)` (or the migration’s canonical `fact_set_sha256` helper for the governed production ledger). Compare to exact source payload/receipt item counts and hashes. For 000310, use receipt fields `dimension_rows,master_rows,fact_rows,resolved_rows,unmatched_rows,ambiguous_rows,not_applicable_rows`, cycle resolution counters, `fact_set_sha256`, `resolution_state_sha256`, and `fact_owner_maps`; ensure `fact_rows=dimension_rows+master_rows`, owner maps/identities reconcile, and all unexpected unresolved statuses are surfaced. Do not silently require all source subjects resolved if the approved source contract explicitly permits unmatched/ambiguous cases; qualification should report status partitions and apply the task’s explicit acceptance criteria.

The API `visibilitySql` (service 999-1011) exposes owner fact tables only after exact fact-map id, batch, source system, target table/id, verified + active and joined batch `(id,source_system,execution_context,status)=(fact.batch,'yuzhou-v10','production_import','succeeded')`, scoped by tenant and park. It does not join the 000310 fact identity receipt, 000309 operation/evidence/resolution ledger, or `migration_batch_item`; therefore visible count is not formal receipt qualification. Person projections additionally use resolved subject identity + unique T0 candidate + verified active `dbo.person` owner map + live non-deleted `hr_employee`.

### Actionable read-only SQL outline

Use transaction-level read-only mode, explicit `:batch_id`, `:tenant_id`, `:park_id`, and `:operation_id`. This outline uses actual column names and emits only aggregates:

```sql
WITH batch_q AS (
  SELECT b.id batch_id, b.source_snapshot_sha256, b.status batch_status,
         b.execution_context, b.production_import_phase, b.target_database,
         op.operation_id, op.status operation_status, op.intent, op.code_sha,
         op.mapping_contract_sha256, op.sealed_plan_sha256, op.target_identity_sha256,
         ph.status phase_status, ph.source_batch_manifest_sha256,
         receipt.status receipt_status, receipt.fact_rows, receipt.master_rows,
         receipt.dimension_rows, receipt.resolved_rows, receipt.unmatched_rows,
         receipt.ambiguous_rows, receipt.not_applicable_rows,
         receipt.fact_set_sha256, receipt.resolution_state_sha256,
         receipt.verified_owner_maps, receipt.owner_map_state_sha256,
         receipt.receipt_sha256, receipt.rollback_operation_id,
         receipt.rollback_receipt_sha256, receipt.rolled_back_at
  FROM migration_batch b
  JOIN hr_yuzhou_production_import_operation op
    ON op.operation_id=:operation_id
  JOIN hr_yuzhou_production_import_phase ph
    ON (ph.operation_id,ph.phase)=(op.operation_id,'T0')
  JOIN hr_yuzhou_performance_fact_identity_production_receipt receipt
    ON (receipt.operation_id,receipt.migration_batch_id)=(op.operation_id,b.id)
  WHERE b.id=:batch_id AND b.source_system='yuzhou-v10'
    AND b.execution_context='production_import'
    AND b.production_import_phase='T0' AND b.status='succeeded'
    AND b.target_database=current_database()
    AND op.intent='production_import' AND op.status='succeeded'
    AND ph.status='succeeded' AND receipt.status='succeeded'
    AND receipt.rollback_operation_id IS NULL
    AND receipt.rollback_receipt_sha256 IS NULL AND receipt.rolled_back_at IS NULL
    AND (receipt.tenant_id,receipt.park_id)=(:tenant_id,:park_id)
    AND receipt.source_snapshot_sha256=b.source_snapshot_sha256
    AND receipt.code_sha=op.code_sha
    AND receipt.mapping_contract_sha256=op.mapping_contract_sha256
    AND receipt.target_identity_sha256=op.target_identity_sha256
), fact_q AS (
  SELECT 'master_result' fact_kind,f.id,f.migration_batch_id,
         f.tenant_id,f.park_id,f.legacy_record_map_id,
         f.source_identity_sha256,f.source_row_sha256,f.source_master_id source_key
  FROM hr_performance_legacy_master_result f WHERE f.migration_batch_id=:batch_id
  UNION ALL
  SELECT 'dimension_result',f.id,f.migration_batch_id,f.tenant_id,f.park_id,
         f.legacy_record_map_id,f.source_identity_sha256,f.source_row_sha256,
         f.source_detail_id
  FROM hr_performance_legacy_dimension_result f WHERE f.migration_batch_id=:batch_id
), map_q AS (
  SELECT f.*,m.id map_id,m.mapping_status,m.is_active,
         (m.id=f.legacy_record_map_id AND m.batch_id=f.migration_batch_id
          AND m.source_system='yuzhou-v10'
          AND m.source_table=CASE f.fact_kind WHEN 'master_result' THEN 'dbo.assessmentmaster'
                                               ELSE 'dbo.assessmentdetail' END
          AND m.source_identity_sha256=f.source_identity_sha256
          AND m.source_row_sha256=f.source_row_sha256
          AND m.target_table=CASE f.fact_kind WHEN 'master_result'
            THEN 'hr_performance_legacy_master_result'
            ELSE 'hr_performance_legacy_dimension_result' END
          AND m.target_id=f.id AND m.mapping_status='verified' AND m.is_active) exact_map
  FROM fact_q f LEFT JOIN legacy_record_map m ON m.id=f.legacy_record_map_id
), master_status AS (
  SELECT m.id master_id,
         r.person_resolution_status,r.source_person_evidence_count,
         r.person_template_candidate_count,r.person_template_profile_id,
         r.detail_resolution_status,r.detail_template_candidate_count,
         r.detail_template_profile_id,r.comparison_status,r.evidence_sha256
  FROM hr_performance_legacy_master_result m
  LEFT JOIN hr_performance_legacy_ass_compute_weight_resolution r
    ON (r.legacy_master_result_id,r.tenant_id,r.park_id,r.migration_batch_id)=
       (m.id,m.tenant_id,m.park_id,m.migration_batch_id)
  WHERE m.migration_batch_id=:batch_id
), agg AS (
  SELECT fact_kind,count(*) total,count(*) FILTER(WHERE exact_map) exact_maps,
         count(*) FILTER(WHERE NOT exact_map) map_gaps,
         count(DISTINCT source_identity_sha256) unique_identities,
         count(DISTINCT source_key) unique_source_keys
  FROM map_q GROUP BY fact_kind
)
SELECT ... -- emit batch_q hashes/status, agg counts, and master_status enum counts;
       -- qualified only if every expected status/count/hash/map criterion equals approved manifest.
```

This is an outline, not ready-to-run complete SQL: bind all source object item rows against the approved manifest, include the remaining four owner definition families in `fact_q` where those are in the selected continuation scope, compute/compare the canonical 000310 `hr_yuzhou_performance_fact_identity_set_v1(tenant,park,batch)` and `hr_yuzhou_performance_fact_identity_state_v1(...)` hashes, and check 000309 operation by its actual operation id/batch pair plus `applied_state_sha256`. Do not emit a generic `ready=true`; return per-gate booleans and an overall qualified flag only when every explicit acceptance criterion matches. Note `hr_yuzhou_production_import_operation` and phases do not by themselves store a relation/assessment receipt; use the receipt table appropriate to the claimed layer.

The parent task’s dated period fields must come from a separately qualified session/assessment source relation only if that source schema actually stores period start/end; the reviewed legacy master/detail schema preserves `source_session_id`, `source_recorded_at` (master), and source values but no canonical `period_start` / `period_end` columns were found. Do not derive period dates from session identifiers or timestamps. The UI rubric is trimmed and should not be treated as the canonical legacy source rubric; canonicality requires qualified source template/item/detail evidence and hash coverage.

## Related Specs

- `.trellis/workflow.md`: research and task persistence expectations.
- `.trellis/tasks/10-16-hr-performance-formal-source-continuation/prd.md` and `design.md`: active parent scope (read by requester/parent).
- Migrations `000235`, `000300`, `000302`, `000308`, `000309`, `000310` are the executable schema/control contracts inspected here.

## Caveats / Not Found

- No production query was run; source code and migration definitions do not establish current production counts, applied migration hashes, receipt status, or runtime code identity.
- `comparison_status='matched'` enum and equality semantics are established by checked-in migration 000307; applied live catalog still requires confirmation before operational qualification.
- No canonical period start/end fields were found in the inspected performance master/detail schema; dates remain unresolved pending the actual source relation/catalog.
- No old-source score math reanalysis, 212 scans, schema/API design, or raw/private row inspection was performed.
- The status and helper functions in migrations are contract descriptions until confirmed against the applied target database revision.
