# B-2c Approval Active-Source Index Forward-Schema Change Request

Date: 2026-08-02  
Status: OPEN / SCHEMA-BLOCKING / FORWARD MIGRATION OWNER REQUIRED  
Contract input SHA: `5cb700cc3265a75422e3204cea30598b84ca7919dfa9c0e6a65194bd3ed48597`

This initial runtime-lane escalation is retained as audit evidence. The later reviewed
authority `b2c-approval-active-source-index-forward-fix-plan-20260802.md` supersedes its
migration-number discussion and freezes the full reservation, DDL and release plan.

## Finding

Delivered migration `000186_property_b_approval_runtime_schema.sql` defines
`uq_biz_property_approval_request_active_source` with this predicate:

```sql
decision_status IN ('draft', 'submitted', 'pending_approval', 'approved')
```

The frozen B-2c contract instead classifies an approval request as active exactly when:

```sql
decision_status IN ('draft', 'submitted', 'pending_approval')
OR (
  decision_status = 'approved'
  AND execution_status IN ('not_started', 'executing', 'retry_wait', 'infra_exhausted')
)
```

Therefore the delivered partial unique index incorrectly retains terminal
`approved/executed` and `approved/execution_failed` rows in the active uniqueness set.
The runtime repository query has been corrected to the contract, but runtime and schema
do not yet express the same predicate. Migration `000186` is forward-only history and
must not be edited.

## Frozen correction

A new migration, with its number selected by the migration owner after checking the
current repository and deployed history, must replace the partial unique index with the
exact predicate above. It must preserve the canonical final index name
`uq_biz_property_approval_request_active_source` and the existing six key columns:

```sql
(tenant_id, park_id, action_id, source_type, source_id, source_expected_version)
```

The migration must fail loudly on duplicate rows under the corrected predicate. It must
not delete, merge or mutate approval requests to make the index build pass.

## Required migration DAG

1. Select a new, non-duplicated migration number from current/deployed history; do not
   revise `000186`.
2. Preflight duplicate active keys using the exact corrected predicate; abort with
   actionable diagnostics if any key has cardinality greater than one.
3. Create a temporary replacement unique index on the same six columns with the exact
   corrected predicate.
4. Drop only the old `uq_biz_property_approval_request_active_source` index.
5. Rename the temporary replacement to
   `uq_biz_property_approval_request_active_source`.
6. Update the repository's migration/schema catalog evidence and schema regression gate
   through the normal migration-owner workflow.
7. Run the B-2c PostgreSQL gate against a freshly migrated temporary database, including
   reuse after `approved/executed` and `approved/execution_failed`, and uniqueness for all
   seven active combinations.
8. Only after independent schema and runtime Gate acceptance may the B-2c runtime
   implementation be promoted from `SCHEMA-BLOCKED` to current authority.

## Ownership boundary

This request intentionally assigns no migration number and makes no migration edit.
The B-2c approval-port runtime lane owns the corrected query predicate and tests; the
forward-schema owner owns migration numbering, DDL, catalog evidence and database Gate.
