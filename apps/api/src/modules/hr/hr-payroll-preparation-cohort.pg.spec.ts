import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { HrInsuranceOwnedPeriodService } from "./hr-insurance-owned-period.service";
import { HrInsurancePolicyVersionService } from "./hr-insurance-policy-version.service";
import { HR_INSURANCE_KINDS } from "./hr-insurance-calculation";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";

// Opt-in against a fresh, disposable full-schema database. Never production.
const enabled = process.env.HR_PREPARATION_COHORT_PG === "1";
const database = process.env.POSTGRES_DB ?? "";
const scope = { tenantId: "source-fixture", parkId: "source-fixture" };
const ids = Object.fromEntries(["actor", "employee", "book", "period", "definition", "item", "formula", "legacy", "snapshot", "snapshotItem", "control", "attendance", "attendanceBatch", "summary", "plan", "compensation"].map(key => [key, randomUUID()]));
const actor: JwtPrincipal = { ...scope, sub: ids.actor!, username: "synthetic-source-reviewer", roles: [], permissions: ["*"] };
const parent = "yzprod-import-20261002T000000Z-000000000001";
const operation = "yzprod-import-20261002T000000Z-000000000002";
const hash = "a".repeat(64);
let db: DataSource;
function service(auditFails = false) {
  return new HrPayrollHistoryService(db, {
    recordOperationRequired: async (input: { method: string }, manager?: EntityManager) => {
      await (manager ?? db.manager).query("INSERT INTO source_fixture_audit(method) VALUES($1)", [input.method]);
      if (auditFails) throw new Error("fixture audit unavailable");
    },
  } as unknown as AuditService);
}
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.HR_PREPARATION_COHORT_ISOLATED, "yes");
  assert.match(database, /^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$/);
  assert.ok(["127.0.0.1", "localhost"].includes(process.env.POSTGRES_HOST ?? ""));
  db = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database, synchronize: false, entities: [] });
  await db.initialize();
  assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_employee"))[0].count, 0, "fixture requires an empty isolated schema");
  await db.transaction("SERIALIZABLE", async (manager) => {
  await manager.query("CREATE TABLE source_fixture_audit(method text NOT NULL)");
  await manager.query(`INSERT INTO hr_yuzhou_production_import_operation(operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,finished_at,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256)
    VALUES($1,'production_import','succeeded',repeat('a',40),$2,$2,$2,$2,$2,$2,now()-interval '1 hour',now()+interval '1 hour',now()-interval '2 hours',now()+interval '2 hours',$2,$2,$2,$2,repeat('b',64),'["T0","T1","T2","T3"]',now(),2,$3,$4,hr_yuzhou_production_target_scope_sha256($3,$4))`, [parent, hash, scope.tenantId, scope.parkId]);
  const scopeHash = (await manager.query("SELECT hr_yuzhou_production_target_scope_sha256($1,$2) AS hash", [scope.tenantId,scope.parkId]))[0].hash as string;
  const binding = { operationId: operation, parent: { operationId: parent }, intent: "APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE", mode: "full_archive", targetScope: scope, targetScopeSha256: scopeHash, executionCodeSha: "a".repeat(40), triple: { sourceSnapshotHash: hash } };
  await manager.query("INSERT INTO hr_yuzhou_t4_followon_operation(operation_id,parent_operation_id,binding_sha256,binding,status,owned_state) VALUES($1,$2,$3,$4,'succeeded','{}')", [operation, parent, hash, JSON.stringify(binding)]);
  await manager.query("INSERT INTO hr_yuzhou_t4_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES(repeat('b',64),repeat('c',64),$1,'append')", [operation]);
  await manager.query("INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,tool_version,status,execution_context,t4_followon_operation_id) VALUES($1,$2,'yuzhou-v10',$3,current_database(),'t4-followon-v1@'||repeat('a',40),'succeeded','t4_production_followon',$2)", [ids.control, operation, hash]);
  await manager.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES($1,$2,$3,'FIXTURE','Synthetic Employee','active')", [ids.employee, scope.tenantId, scope.parkId]);
  await manager.query("INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES($1,$2,$3,1,'Synthetic Book',$4)", [ids.book, scope.tenantId, scope.parkId, hash]);
  await manager.query("INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,$4,'2026-07-01',0,$5)", [ids.period, scope.tenantId, scope.parkId, ids.book, hash]);
  await manager.query("INSERT INTO hr_payroll_item_definition(id,tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,$4,'NET','NET')", [ids.definition, scope.tenantId, scope.parkId, ids.book]);
  await manager.query("INSERT INTO hr_payroll_item_version(id,tenant_id,park_id,item_definition_id,version_no,display_name,value_type,decimal_scale,legacy_item_type,legacy_add_or_sub,item_category,source_hash,enabled) VALUES($1,$2,$3,$4,1,'NET','decimal',4,'fixture','fixture','summary',$5,true)", [ids.item, scope.tenantId, scope.parkId, ids.definition, hash]);
  await manager.query("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES($1,$2,$3,$4,$5,$5,$5,1,1,'staged')", [ids.legacy, scope.tenantId, scope.parkId, operation, hash]);
  await manager.query("INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash,net_amount) VALUES($1,$2,$3,$4,$5,$6,'salary01',$7,$7,'mapped',$7,900719925474.1234)", [ids.snapshot, scope.tenantId, scope.parkId, ids.legacy, ids.period, ids.employee, hash]);
  await manager.query("INSERT INTO hr_payroll_legacy_snapshot_item(id,tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,value_type,is_source_null,source_hash,raw_value,decimal_value) VALUES($1,$2,$3,$4,$5,'NET','decimal',false,$6,'900719925474.1234',900719925474.1234)", [ids.snapshotItem, scope.tenantId, scope.parkId, ids.snapshot, ids.item, hash]);
  for (const [table, id] of [["hr_payroll_legacy_snapshot", ids.snapshot], ["hr_payroll_legacy_snapshot_item", ids.snapshotItem]]) await manager.query("INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES($1,'yuzhou-v10',$2,$3::text,$4,$4,$2,$3::uuid,'loaded',true)", [ids.control, table, id, hash]);
  await manager.query("INSERT INTO hr_attendance_period(id,tenant_id,park_id,period_month,status) VALUES($1,$2,$3,'2026-07-01','closed')", [ids.attendance, scope.tenantId, scope.parkId]);
  await manager.query("INSERT INTO hr_attendance_month_summary(id,tenant_id,park_id,period_id,employee_id,summary_version) VALUES($1,$2,$3,$4,$5,1)", [ids.summary, scope.tenantId, scope.parkId, ids.attendance, ids.employee]);
  await manager.query("INSERT INTO hr_attendance_payroll_input_batch(id,tenant_id,park_id,period_id,batch_no,batch_type,created_from_summary_version) VALUES($1,$2,$3,$4,1,'close',1)", [ids.attendanceBatch, scope.tenantId, scope.parkId, ids.attendance]);
  await manager.query("INSERT INTO hr_attendance_payroll_input_item(tenant_id,park_id,batch_id,employee_id,source_summary_id,worked_minutes,late_minutes,early_minutes,absence_days,missing_punch_days) VALUES($1,$2,$3,$4,$5,0,0,0,0,0)", [scope.tenantId, scope.parkId, ids.attendanceBatch, ids.employee, ids.summary]);
  });
});
after(async () => { if (db?.isInitialized) await db.destroy(); });
const query = {legacyBatchId:ids.legacy!,periodMonth:"2026-07-01",page:1,page_size:50};
test("full-schema all-book cohort preserves records, anomalies, pages and actual attendance membership",{skip:!enabled},async()=>{
  const book2=randomUUID(),period2=randomUUID();
  await db.query("INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES($1,$2,$3,2,'Second Book',$4)",[book2,scope.tenantId,scope.parkId,hash]);
  await db.query("INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,$4,'2026-07-01',0,$5)",[period2,scope.tenantId,scope.parkId,book2,hash]);
  await db.query(`WITH employees AS (INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,employment_status)
    SELECT $1,$2,'E'||lpad(n::text,3,'0'),'Synthetic '||n,'active' FROM generate_series(1,51) n RETURNING id)
    INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash)
    SELECT $1,$2,$3,$4,id,'salary01',$5,encode(digest(id::text,'sha256'),'hex'),'mapped',$5 FROM employees`,[scope.tenantId,scope.parkId,ids.legacy,ids.period,hash]);
  for(const [period,employee,mapping,key] of [[period2,ids.employee,'mapped','cross-book'],[ids.period,ids.employee,'mapped','duplicate-person'],[ids.period,null,'employee_unmapped','unmapped'],[ids.period,null,'duplicate_source','duplicate-source'],[ids.period,null,'quarantined','quarantined']]) {
    await db.query(`INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash)
      VALUES($1,$2,$3,$4,$5,'salary01',$6,$7,$8,$6)`,[scope.tenantId,scope.parkId,ids.legacy,period,employee,hash,createHash('sha256').update(String(key)).digest('hex'),mapping]);
  }
  const first=await service().preparationCohort(scope,actor,query),second=await service().preparationCohort(scope,actor,{...query,page:2});
  assert.equal(first.total,52);assert.equal(first.items.length,50);assert.equal(second.items.length,2);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.employeeId)).size,52);
  assert.deepEqual(first.totals,{recordCount:57,sourceRowCount:57,itemCount:1,mappedRecordCount:54,unmappedRecordCount:1,duplicateSourceCount:1,quarantinedCount:1,unavailableReferenceCount:0,unavailableEmployeeCount:0,unresolvedItemCount:0,duplicateEmployeeExtraCount:1,bookCount:2,employeeCount:52});
  const person=second.items.find(x=>x.employeeId===ids.employee)!;
  assert.equal(person.recordCount,3);assert.equal(person.attendanceInputCount,1);
  assert.deepEqual((person.books as {recordCount:number}[]).map(x=>x.recordCount).sort(),[1,2]);
  assert.ok(first.items.every(x=>x.attendanceInputCount===0));
  assert.ok(first.items.every(x=>x.historicalInsuranceSourceCount===0&&x.modernInsuranceSourceCount===0));
  assert.ok(first.books.every(x=>x.approvedFormulaCandidateCount===0&&x.currentNetPolicy===null));
  const beyond=await service().preparationCohort(scope,actor,{...query,page:5000});assert.equal(beyond.total,52);assert.deepEqual(beyond.items,[]);
  const deleted=String(first.items[0]!.employeeId);
  await db.query("UPDATE hr_employee SET is_deleted=true WHERE id=$1",[deleted]);
  const withDeleted=await service().preparationCohort(scope,actor,query);assert.equal(withDeleted.total,51);assert.equal(withDeleted.totals.unavailableEmployeeCount,1);assert.equal(withDeleted.totals.recordCount,57);
  await db.query("UPDATE hr_employee SET is_deleted=false WHERE id=$1",[deleted]);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_payroll_reconciliation_source"))[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM hr_payroll_reconciliation_run"))[0].n,0);
  assert.doesNotMatch(JSON.stringify(first),/netAmount|grossAmount|source_snapshot|raw_value|toleranceAmount|identity|phone|bank/);
});

test("same-month historical review and modern latest revision counts never imply amount readiness",{skip:!enabled},async()=>{
  const employeeId=ids.employee!;
  const historical=(await db.query("INSERT INTO hr_employee_insurance_period(tenant_id,park_id,employee_id,period_year,period_month,legacy_id,needs_review) VALUES($1,$2,$3,2026,7,1,true) RETURNING id",[scope.tenantId,scope.parkId,employeeId]))[0].id;
  const person=async()=> (await service().preparationCohort(scope,actor,{...query,page_size:100})).items.find(x=>x.employeeId===employeeId)!;
  await db.query("INSERT INTO hr_employee_insurance_period(tenant_id,park_id,employee_id,period_year,period_month,legacy_id) VALUES($1,$2,$3,2026,8,2),('foreign','foreign',$3,2026,7,3)",[scope.tenantId,scope.parkId,employeeId]);
  assert.equal((await person()).historicalInsurancePeriodCount,1);assert.equal((await person()).historicalInsuranceSourceCount,0);assert.equal((await person()).historicalInsuranceNeedsReview,true);
  await assert.rejects(db.query("INSERT INTO hr_employee_insurance_period(tenant_id,park_id,employee_id,period_year,period_month,legacy_id) VALUES($1,$2,$3,2026,7,2)",[scope.tenantId,scope.parkId,employeeId]),/unique|duplicate/);
  await db.query("UPDATE hr_employee_insurance_period SET needs_review=false WHERE id=$1",[historical]);assert.equal((await person()).historicalInsuranceSourceCount,1);
  const audit={recordOperationRequired:async()=>undefined} as unknown as AuditService;
  const policies=new HrInsurancePolicyVersionService(db,audit),modern=new HrInsuranceOwnedPeriodService(db,audit);
  const policy=await policies.create(scope,actor,{requestId:randomUUID(),policyCode:'COHORT',policyName:'Synthetic',variantNo:1,effectiveFrom:'2026-01',effectiveThrough:'2026-12',reason:'Synthetic',items:HR_INSURANCE_KINDS.map(insuranceKind=>({insuranceKind,factors:{base:{rate:'0.01',fixedAmount:null},employer:{rate:'0.01',fixedAmount:null},employee:{rate:'0.01',fixedAmount:null},supplement:{rate:'0.01',fixedAmount:null}}}))});
  const dto={requestId:randomUUID(),employeeId,expectedEmployeeVersion:1,policyVersionId:policy.id,expectedDefinitionHash:policy.definitionHash,periodMonth:'2026-07',includeFund:false,bases:HR_INSURANCE_KINDS.map(insuranceKind=>({insuranceKind,contributionBase:'10.00'}))};
  const preview=await modern.preview(scope,actor,dto),revision=await modern.confirm(scope,actor,{requestId:randomUUID(),previewId:preview.id,expectedPreviewHash:preview.previewHash,reason:'Synthetic'});
  assert.equal((await person()).modernInsuranceSourceCount,1,'confirmed source does not require modern close');
  await modern.close(scope,actor,{requestId:randomUUID(),revisionId:revision.id,expectedPeriodVersion:1,reason:'Synthetic'});
  const preview2=await modern.preview(scope,actor,{...dto,requestId:randomUUID()});
  await modern.correct(scope,actor,{requestId:randomUUID(),previewId:preview2.id,expectedPreviewHash:preview2.previewHash,previousRevisionId:revision.id,expectedPeriodVersion:1,reason:'Synthetic'});
  assert.equal((await person()).modernInsuranceSourceCount,1,'two revisions count only latest');
  const wrongMonth=await modern.preview(scope,actor,{...dto,requestId:randomUUID(),periodMonth:'2026-08'});
  await modern.confirm(scope,actor,{requestId:randomUUID(),previewId:wrongMonth.id,expectedPreviewHash:wrongMonth.previewHash,reason:'Synthetic'});
  assert.equal((await person()).modernInsuranceSourceCount,1);
});

test("invalid, foreign, unqualified and nonexistent month fail; mandatory audit rolls back",{skip:!enabled},async()=>{
  await assert.rejects(service().preparationCohort({...scope,parkId:'foreign'},actor,query),ForbiddenException);
  await assert.rejects(service().preparationCohort({...scope,parkId:'foreign'},{...actor,parkId:'foreign'},query),ConflictException);
  await assert.rejects(service().preparationCohort(scope,actor,{...query,legacyBatchId:randomUUID()}),ConflictException);
  await assert.rejects(service().preparationCohort(scope,actor,{...query,periodMonth:'2025-07-01'}),ConflictException);
  for(const patch of ["status='failed'","source_backup_hash=repeat('b',64)","batch_code='missing-source-receipt'"]) {
    await db.query(`UPDATE hr_payroll_legacy_batch SET ${patch} WHERE id=$1`,[ids.legacy]);
    try {await assert.rejects(service().preparationCohort(scope,actor,query),ConflictException);}
    finally {await db.query("UPDATE hr_payroll_legacy_batch SET status='staged',source_backup_hash=$2,batch_code=$3 WHERE id=$1",[ids.legacy,hash,operation]);}
  }
  for(const kind of ["wrong-scope","missing-control","failed-control","wrong-database","rolled-back"]) {
    const op=`yzprod-import-20261002T000000Z-${randomUUID().replaceAll("-","").slice(0,12)}`;
    const receiptWrite=db.transaction("SERIALIZABLE",async manager=>{
      const binding=(await manager.query("SELECT binding FROM hr_yuzhou_t4_followon_operation WHERE operation_id=$1",[operation]))[0].binding;
      binding.operationId=op;if(kind==="wrong-scope")binding.targetScope={...scope,parkId:"foreign-park"};
      const sha=createHash("sha256").update(op).digest("hex");
      await manager.query("INSERT INTO hr_yuzhou_t4_followon_operation(operation_id,parent_operation_id,binding_sha256,binding,status,owned_state,rolled_back_at) VALUES($1,$2,$3,$4,$5::varchar,'{}',CASE WHEN $5::varchar='rolled_back' THEN now() END)",[op,parent,sha,JSON.stringify(binding),kind==="rolled-back"?"rolled_back":"succeeded"]);
      if(kind!=="missing-control") {
        await manager.query("INSERT INTO hr_yuzhou_t4_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES($1,$2,$3,'append')",[createHash("sha256").update(op+"nonce").digest("hex"),createHash("sha256").update(op+"auth").digest("hex"),op]);
        await manager.query("INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,tool_version,status,execution_context,t4_followon_operation_id) VALUES($1,$2,'yuzhou-v10',$3,$4,'t4-followon-v1@'||repeat('a',40),$5,'t4_production_followon',$2)",[randomUUID(),op,hash,kind==="wrong-database"?"foreign_database":database,kind==="failed-control"?"failed":"succeeded"]);
      }
    });
    if(kind==="wrong-database") {await assert.rejects(receiptWrite,/T4_BATCH_BINDING_INVALID/);continue;}
    await receiptWrite;
    await db.query("UPDATE hr_payroll_legacy_batch SET batch_code=$2 WHERE id=$1",[ids.legacy,op]);
    try { await assert.rejects(service().preparationCohort(scope,actor,query),ConflictException); }
    finally { await db.query("UPDATE hr_payroll_legacy_batch SET batch_code=$2 WHERE id=$1",[ids.legacy,operation]); }
  }
  const before=(await db.query("SELECT count(*)::int n FROM source_fixture_audit"))[0].n;
  await assert.rejects(service(true).preparationCohort(scope,actor,query),/fixture audit unavailable/);
  assert.equal((await db.query("SELECT count(*)::int n FROM source_fixture_audit"))[0].n,before);
});

test("published source works without receipt; archive deletion and foreign references remain constrained",{skip:!enabled},async()=>{
  const published=randomUUID();
  await db.query("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES($1,$2,$3,'synthetic-published',$4,$4,$4,1,1,'staged')",[published,scope.tenantId,scope.parkId,hash]);
  await db.query("INSERT INTO hr_payroll_legacy_snapshot(tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash) VALUES($1,$2,$3,$4,$5,'salary01',$6,$6,'mapped',$6)",[scope.tenantId,scope.parkId,published,ids.period,ids.employee,hash]);
  await db.query("UPDATE hr_payroll_legacy_batch SET status='published',published_at=now(),published_by=$2 WHERE id=$1",[published,ids.actor]);
  const result=await service().preparationCohort(scope,actor,{...query,legacyBatchId:published});assert.equal(result.sourceStatus,'published');assert.equal(result.totals.recordCount,1);
  await assert.rejects(db.query("UPDATE hr_payroll_legacy_snapshot SET is_deleted=true WHERE id=$1",[ids.snapshot]),/append-only|immutable|deleted|constraint|published/i);
  await assert.rejects(db.query("INSERT INTO hr_payroll_book_period(tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES('foreign','foreign',$1,'2019-01-01',0,$2)",[ids.book,hash]),/fk_hr_payroll_book_period_book/);
  assert.equal((await service().preparationCohort(scope,actor,query)).totals.recordCount,57);
});
