import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { diagnosePayrollReadiness, payrollReadinessSql } from '../diagnose-hr-payroll-readiness.mjs';

const database = process.env.POSTGRES_DB ?? '';
const enabled = process.env.HR_PAYROLL_READINESS_PG === '1';
const container = process.env.POSTGRES_CONTAINER ?? 'jinhu-smart-park-postgres';
const psql = (sql, allowFailure = false) => {
  try {
    return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', process.env.POSTGRES_USER ?? 'jinhu', '-d', database], { input: sql, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    if (allowFailure) return error;
    throw error;
  }
};

test('migrated PostgreSQL proves published source observation, invalid staged exclusion, ordering, truncation and read-only rejection', { skip: !enabled }, () => {
  assert.match(database, /^jinhu_hr_migration_lab_review_[A-Za-z0-9_]{6,64}$/);
  psql(`
    INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,employment_status) VALUES('10000001','20000001','READINESS','Fixture','active') ON CONFLICT DO NOTHING;
    INSERT INTO hr_payroll_book(tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES('10000001','20000001',1,'readiness-fixture',repeat('a',64)) ON CONFLICT DO NOTHING;
    INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status)
    VALUES('10000001','20000001','readiness-published',repeat('a',64),repeat('a',64),repeat('a',64),25,25,'staged'),
          ('10000001','20000001','readiness-invalid-staged',repeat('b',64),repeat('b',64),repeat('b',64),1,1,'staged');
    WITH book AS (SELECT id FROM hr_payroll_book WHERE tenant_id='10000001' AND park_id='20000001' AND book_name='readiness-fixture'),
      batch AS (SELECT id FROM hr_payroll_legacy_batch WHERE tenant_id='10000001' AND park_id='20000001' AND batch_code='readiness-published'),
      employee AS (SELECT id FROM hr_employee WHERE tenant_id='10000001' AND park_id='20000001' AND employee_code='READINESS'),
      periods AS (INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash)
        SELECT '10000001','20000001',book.id,(date '2025-01-01'+(n||' months')::interval)::date,0,repeat('a',64) FROM book,generate_series(0,24) n RETURNING id,period_month)
    INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash)
    SELECT '10000001','20000001',batch.id,periods.id,employee.id,'salary01',repeat('a',64),encode(digest(periods.period_month::text,'sha256'),'hex'),'mapped',repeat('a',64) FROM batch,employee,periods;
    WITH book AS (SELECT id FROM hr_payroll_book WHERE tenant_id='10000001' AND park_id='20000001' AND book_name='readiness-fixture'), batch AS (SELECT id FROM hr_payroll_legacy_batch WHERE batch_code='readiness-invalid-staged')
    INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) SELECT '10000001','20000001',book.id,'2030-01-01',0,repeat('b',64) FROM book;
    INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash)
    SELECT '10000001','20000001',batch.id,period.id,'salary02',repeat('b',64),repeat('b',64),'employee_unmapped',repeat('b',64) FROM hr_payroll_legacy_batch batch JOIN hr_payroll_book_period period ON period.tenant_id=batch.tenant_id AND period.park_id=batch.park_id WHERE batch.batch_code='readiness-invalid-staged' AND period.period_month='2030-01-01';
    UPDATE hr_payroll_legacy_batch SET status='published',published_at=clock_timestamp(),published_by=gen_random_uuid() WHERE batch_code='readiness-published';
    INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES('10000001','20000001','yzprod-import-20261011T000000Z-000000000003',repeat('d',64),repeat('d',64),repeat('d',64),1,1,'staged');
    INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) SELECT '10000001','20000001',id,'2028-01-01',0,repeat('d',64) FROM hr_payroll_book WHERE tenant_id='10000001' AND park_id='20000001' AND book_name='readiness-fixture';
    INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash) SELECT '10000001','20000001',batch.id,period.id,employee.id,'salary03',repeat('d',64),repeat('d',64),'mapped',repeat('d',64) FROM hr_payroll_legacy_batch batch JOIN hr_payroll_book_period period ON period.tenant_id=batch.tenant_id AND period.park_id=batch.park_id CROSS JOIN (SELECT id FROM hr_employee WHERE tenant_id='10000001' AND park_id='20000001' AND employee_code='READINESS') employee WHERE batch.batch_code='yzprod-import-20261011T000000Z-000000000003' AND period.period_month='2028-01-01';
    INSERT INTO hr_yuzhou_production_import_operation(operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,finished_at,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256) VALUES('yzprod-import-20261011T000000Z-000000000002','production_import','succeeded',repeat('a',40),repeat('d',64),repeat('d',64),repeat('d',64),repeat('d',64),repeat('d',64),repeat('d',64),now()-interval '1 hour',now()+interval '1 hour',now()-interval '2 hours',now()+interval '2 hours',repeat('d',64),repeat('d',64),repeat('d',64),repeat('d',64),repeat('b',64),'["T0","T1","T2","T3"]',now(),2,'10000001','20000001',hr_yuzhou_production_target_scope_sha256('10000001','20000001'));
    INSERT INTO hr_yuzhou_t4_followon_operation(operation_id,parent_operation_id,binding_sha256,binding,status,owned_state) VALUES('yzprod-import-20261011T000000Z-000000000003','yzprod-import-20261011T000000Z-000000000002',repeat('d',64),jsonb_build_object('operationId','yzprod-import-20261011T000000Z-000000000003','parent',jsonb_build_object('operationId','yzprod-import-20261011T000000Z-000000000002'),'intent','APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE','mode','full_archive','targetScope',jsonb_build_object('tenantId','10000001','parkId','20000001'),'targetScopeSha256',hr_yuzhou_production_target_scope_sha256('10000001','20000001'),'executionCodeSha',repeat('a',40),'triple',jsonb_build_object('sourceSnapshotHash',repeat('d',64))),'succeeded','{}');
    INSERT INTO hr_yuzhou_t4_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES(repeat('e',64),repeat('f',64),'yzprod-import-20261011T000000Z-000000000003','append');
    BEGIN ISOLATION LEVEL SERIALIZABLE;
    INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,tool_version,status,execution_context,t4_followon_operation_id) VALUES(gen_random_uuid(),'yzprod-import-20261011T000000Z-000000000003','yuzhou-v10',repeat('d',64),current_database(),'t4-followon-v1@'||repeat('a',40),'succeeded','t4_production_followon','yzprod-import-20261011T000000Z-000000000003');
    COMMIT;
    WITH payload AS (SELECT jsonb_build_object('formatVersion','1','tenantId','10000001','parkId','20000001','legacyBatchId',batch.id::text,'bookId',book.id::text,'periodMonth','2028-01-01','operationId','yzprod-import-20261011T000000Z-000000000003','bindingSha256',repeat('d',64),'snapshots',jsonb_build_array(jsonb_build_object()),'items',jsonb_build_array(jsonb_build_object())) value FROM hr_payroll_legacy_batch batch CROSS JOIN (SELECT id FROM hr_payroll_book WHERE tenant_id='10000001' AND park_id='20000001' AND book_name='readiness-fixture') book WHERE batch.batch_code='yzprod-import-20261011T000000Z-000000000003') INSERT INTO hr_payroll_reconciliation_source(tenant_id,park_id,legacy_batch_id,book_id,period_month,operation_id,binding_sha256,source_sha256,snapshot_count,item_count,frozen_input,created_by,review_reason) SELECT '10000001','20000001',(value->>'legacyBatchId')::uuid,(value->>'bookId')::uuid,'2028-01-01','yzprod-import-20261011T000000Z-000000000003',repeat('d',64),encode(digest(value::text,'sha256'),'hex'),1,1,value,(SELECT id FROM hr_employee WHERE tenant_id='10000001' AND park_id='20000001' AND employee_code='READINESS'),'fixture controlled source' FROM payload;
    INSERT INTO hr_payroll_book(tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES('foreign-tenant','20000001',1,'foreign-readiness-fixture',repeat('c',64));
    INSERT INTO hr_payroll_legacy_batch(tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES('foreign-tenant','20000001','foreign-readiness-published',repeat('c',64),repeat('c',64),repeat('c',64),1,1,'staged');
    INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) SELECT 'foreign-tenant','20000001',id,'2035-01-01',0,repeat('c',64) FROM hr_payroll_book WHERE tenant_id='foreign-tenant' AND book_name='foreign-readiness-fixture';
    INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash) SELECT 'foreign-tenant','20000001',batch.id,period.id,'salary01',repeat('c',64),repeat('c',64),'employee_unmapped',repeat('c',64) FROM hr_payroll_legacy_batch batch JOIN hr_payroll_book_period period ON period.tenant_id=batch.tenant_id AND period.park_id=batch.park_id WHERE batch.batch_code='foreign-readiness-published';
    UPDATE hr_payroll_legacy_batch SET status='published',published_at=clock_timestamp(),published_by=gen_random_uuid() WHERE batch_code='foreign-readiness-published';
  `);
  const result = JSON.parse(psql(payrollReadinessSql).trim());
  const sanitized = diagnosePayrollReadiness('/synthetic', () => JSON.stringify(result));
  assert.equal(sanitized.kind, 'hr_payroll_readiness_counts');
  assert.equal(sanitized.eligibility, 'UNVERIFIED');
  assert.throws(() => diagnosePayrollReadiness('/synthetic', () => { throw new Error('private fixture SQL error'); }), /HR_PAYROLL_READINESS_PROBE_FAILED/);
  assert.equal(result.latestObservedMonth, '2028-01-01');
  assert.equal(result.totalDistinctMonths, 26);
  assert.equal(result.monthsTruncated, true);
  assert.equal(result.observedMonths.length, 24);
  assert.equal(result.observedMonths[0], '2028-01-01');
  assert.equal(result.observedMonths.at(-1), '2025-03-01');
  assert.equal(result.publishedBatchCount, 1);
  assert.equal(result.stagedBatchCount, 2);
  assert.equal(result.receiptQualifiedStagedBatchCount, 1);
  assert.equal(result.latestMappedSnapshots, 1);
  assert.equal(result.latestReceiptQualifiedFrozenSources, 1);
  assert.equal(result.latestCompleteMonth, 'UNVERIFIED');
  const rejected = psql("BEGIN READ ONLY; INSERT INTO hr_payroll_book(tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES('10000001','20000001',1,'forbidden-write',repeat('d',64)); ROLLBACK;", true);
  assert.ok(rejected instanceof Error, 'PostgreSQL must reject a write in the read-only transaction');
  assert.match(String(rejected.stderr), /read-only transaction/i);
});
