import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { parsePayrollFormula, HR_PAYROLL_DSL_PARSER_VERSION } from "./hr-payroll-formula-dsl";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";

// Opt-in against a fresh, disposable full-schema database. Never production.
const enabled = process.env.HR_RECONCILIATION_SOURCE_PG === "1";
const database = process.env.POSTGRES_DB ?? "";
const scope = { tenantId: "source-fixture", parkId: "source-fixture" };
const ids = Object.fromEntries(["actor", "employee", "book", "period", "definition", "item", "formula", "legacy", "snapshot", "snapshotItem", "control", "attendance", "attendanceBatch", "summary", "plan", "compensation"].map(key => [key, randomUUID()]));
const actor: JwtPrincipal = { ...scope, sub: ids.actor!, username: "synthetic-source-reviewer", roles: [], permissions: [HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE] };
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
  await manager.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name) VALUES($1,$2,$3,'FIXTURE','Synthetic Employee')", [ids.employee, scope.tenantId, scope.parkId]);
  await manager.query("INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES($1,$2,$3,1,'Synthetic Book',$4)", [ids.book, scope.tenantId, scope.parkId, hash]);
  await manager.query("INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,$4,'2026-07-01',0,$5)", [ids.period, scope.tenantId, scope.parkId, ids.book, hash]);
  await manager.query("INSERT INTO hr_payroll_item_definition(id,tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,$4,'NET','NET')", [ids.definition, scope.tenantId, scope.parkId, ids.book]);
  await manager.query("INSERT INTO hr_payroll_item_version(id,tenant_id,park_id,item_definition_id,version_no,display_name,value_type,decimal_scale,legacy_item_type,legacy_add_or_sub,item_category,source_hash,enabled) VALUES($1,$2,$3,$4,1,'NET','decimal',4,'fixture','fixture','summary',$5,true)", [ids.item, scope.tenantId, scope.parkId, ids.definition, hash]);
  const expression = "[人事系统.基本工资]+0.0034", parsed = parsePayrollFormula(expression);
  assert.ok(parsed.ast);
  await manager.query("INSERT INTO hr_payroll_formula_version(id,tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,raw_expression,expression_hash,dsl_ast,dependency_codes,parser_version,calculation_order,parse_status,reviewed_by,reviewed_at,review_reason) VALUES($1,$2,$3,$4,$5,1,1,$6,$7,$8,$9,$10,1,'approved_for_simulation',$11,now(),'synthetic review')", [ids.formula, scope.tenantId, scope.parkId, ids.book, ids.item, expression, createHash("sha256").update(expression).digest("hex"), JSON.stringify(parsed.ast), JSON.stringify(parsed.dependencies), HR_PAYROLL_DSL_PARSER_VERSION, ids.actor]);
  await manager.query("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES($1,$2,$3,$4,$5,$5,$5,1,1,'staged')", [ids.legacy, scope.tenantId, scope.parkId, operation, hash]);
  await manager.query("INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash,net_amount) VALUES($1,$2,$3,$4,$5,$6,'salary01',$7,$7,'mapped',$7,900719925474.1234)", [ids.snapshot, scope.tenantId, scope.parkId, ids.legacy, ids.period, ids.employee, hash]);
  await manager.query("INSERT INTO hr_payroll_legacy_snapshot_item(id,tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,value_type,is_source_null,source_hash,raw_value,decimal_value) VALUES($1,$2,$3,$4,$5,'NET','decimal',false,$6,'900719925474.1234',900719925474.1234)", [ids.snapshotItem, scope.tenantId, scope.parkId, ids.snapshot, ids.item, hash]);
  for (const [table, id] of [["hr_payroll_legacy_snapshot", ids.snapshot], ["hr_payroll_legacy_snapshot_item", ids.snapshotItem]]) await manager.query("INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active) VALUES($1,'yuzhou-v10',$2,$3::text,$4,$4,$2,$3::uuid,'loaded',true)", [ids.control, table, id, hash]);
  await manager.query("INSERT INTO hr_attendance_period(id,tenant_id,park_id,period_month,status) VALUES($1,$2,$3,'2026-07-01','closed')", [ids.attendance, scope.tenantId, scope.parkId]);
  await manager.query("INSERT INTO hr_attendance_month_summary(id,tenant_id,park_id,period_id,employee_id,summary_version) VALUES($1,$2,$3,$4,$5,1)", [ids.summary, scope.tenantId, scope.parkId, ids.attendance, ids.employee]);
  await manager.query("INSERT INTO hr_attendance_payroll_input_batch(id,tenant_id,park_id,period_id,batch_no,batch_type,created_from_summary_version) VALUES($1,$2,$3,$4,1,'close',1)", [ids.attendanceBatch, scope.tenantId, scope.parkId, ids.attendance]);
  await manager.query("INSERT INTO hr_attendance_payroll_input_item(tenant_id,park_id,batch_id,employee_id,source_summary_id,worked_minutes,late_minutes,early_minutes,absence_days,missing_punch_days) VALUES($1,$2,$3,$4,$5,0,0,0,0,0)", [scope.tenantId, scope.parkId, ids.attendanceBatch, ids.employee, ids.summary]);
  await manager.query("INSERT INTO hr_compensation_plan(id,tenant_id,park_id,plan_code,plan_name,effective_from) VALUES($1,$2,$3,'FIXTURE','Fixture','2026-07-01')", [ids.plan, scope.tenantId, scope.parkId]);
  await manager.query("INSERT INTO hr_employee_compensation(id,tenant_id,park_id,employee_id,plan_id,effective_from,base_salary) VALUES($1,$2,$3,$4,$5,'2026-07-01',900719925474.12)", [ids.compensation, scope.tenantId, scope.parkId, ids.employee, ids.plan]);
  });
});
after(async () => { if (db?.isInitialized) await db.destroy(); });
test("full-schema preview, audit rollback, freeze and exact-decimal simulation remain separate from payroll publication", { skip: !enabled }, async () => {
  const s = service(), request = { legacyBatchId: ids.legacy!, bookId: ids.book!, periodMonth: "2026-07-01" };
  const preview = await s.previewReconciliationSource(scope, actor, request);
  assert.equal(preview.snapshotCount, 1); assert.equal(preview.employeeCount, 1);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_source"))[0].count, 0);
  const freeze = { ...preview, reason: "synthetic integration review" };
  await assert.rejects(() => service(true).createReconciliationSource(scope, actor, freeze), /fixture audit unavailable/);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_source"))[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM source_fixture_audit WHERE method='POST'"))[0].count, 0);
  const source = await s.createReconciliationSource(scope, actor, freeze);
  assert.equal((await s.createReconciliationSource(scope, actor, freeze)).id, source.id);
  await s.createReconciliationPolicy(scope, actor, { bookId: ids.book!, netItemVersionId: ids.item!, toleranceAmount: "0.0000", reason: "synthetic mapping" });
  const simulation = { legacyBatchId: ids.legacy!, attendanceInputBatchId: ids.attendanceBatch!, reconciliationSourceId: source.id };
  await assert.rejects(() => s.simulateReconciliation(scope, actor, simulation), ConflictException);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_run"))[0].count, 0, "missing input rolls back partial run");
  const insurancePeriod = (await db.query("INSERT INTO hr_employee_insurance_period(tenant_id,park_id,employee_id,period_year,period_month,legacy_id,needs_review) VALUES($1,$2,$3,2026,7,1,true) RETURNING id", [scope.tenantId, scope.parkId, ids.employee]))[0].id as string;
  const insuranceItem = randomUUID();
  await db.query("INSERT INTO hr_employee_insurance_item(id,tenant_id,park_id,period_id,insurance_kind,contribution_base,total_amount,employer_amount,employee_amount,supplement_amount) VALUES($1,$2,$3,$4,'oldage',90071992547409.91,0.10,0.09,0.01,NULL)", [insuranceItem, scope.tenantId, scope.parkId, insurancePeriod]);
  const auditsBeforeReviewRejection = (await db.query("SELECT count(*)::int AS count FROM source_fixture_audit"))[0].count;
  await assert.rejects(() => s.simulateReconciliation(scope, actor, simulation), /Insurance input requires review/);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_run"))[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM source_fixture_audit"))[0].count, auditsBeforeReviewRejection);
  // This owned synthetic input has no historical source mapping; never update production history.
  await db.query("UPDATE hr_employee_insurance_period SET needs_review=false WHERE id=$1", [insurancePeriod]);
  await assert.rejects(() => s.simulateReconciliation(scope, actor, { ...simulation, reconciliationSourceId: undefined }), ConflictException);
  await assert.rejects(() => s.simulateReconciliation({ ...scope, parkId: "other" }, actor, simulation), ConflictException);
  const run = await s.simulateReconciliation(scope, actor, simulation);
  assert.equal(run.employeeCount, 1); assert.equal(run.differenceCount, 0);
  const result = (await db.query("SELECT old_total,new_total,delta_total FROM hr_payroll_reconciliation_result WHERE run_id=$1", [run.id]))[0];
  assert.deepEqual(result, { old_total: "900719925474.1234", new_total: "900719925474.1234", delta_total: "0.0000" });
  const binding = (await db.query("SELECT reconciliation_source_id,frozen_formula_version FROM hr_payroll_reconciliation_run WHERE id=$1", [run.id]))[0];
  assert.equal(binding.reconciliation_source_id, source.id); assert.equal(binding.frozen_formula_version.legacySource.sourceSha256, preview.sourceSha256);
  const insuranceEvidence = async (runId: string) => (await db.query(
    "SELECT frozen_insurance_version,input_snapshot_hash FROM hr_payroll_reconciliation_run WHERE id=$1", [runId]))[0];
  const originalEvidence = await insuranceEvidence(run.id);
  assert.deepEqual(originalEvidence.frozen_insurance_version[ids.employee!], {
    id: insurancePeriod, version: "1", snapshotVersion: "insurance-facts-v1", needsReview: false,
    items: [{ id: insuranceItem, version: "1", insuranceKind: "oldage",
      contributionBase: "90071992547409.91", totalAmount: "0.10", employerAmount: "0.09",
      employeeAmount: "0.01", supplementAmount: null, legacyBaseNegative: false }],
  });
  await db.query("UPDATE hr_employee_insurance_item SET employee_amount=0.02 WHERE id=$1", [insuranceItem]);
  const changedRun = await s.simulateReconciliation(scope, actor, simulation);
  const changedEvidence = await insuranceEvidence(changedRun.id);
  assert.notEqual(changedEvidence.input_snapshot_hash, originalEvidence.input_snapshot_hash,
    "a fact change must alter the hash even when the period version did not change");
  assert.equal(changedEvidence.frozen_insurance_version[ids.employee!].items[0].employeeAmount, "0.02");
  assert.deepEqual(await insuranceEvidence(run.id), originalEvidence, "old simulation evidence remains immutable");

  let signalRead!: () => void;
  const readReached = new Promise<void>((resolve) => { signalRead = resolve; });
  let releaseRead!: () => void;
  const continueRead = new Promise<void>((resolve) => { releaseRead = resolve; });
  const isolatedReader = {
    transaction: (callback: (manager: EntityManager) => Promise<unknown>) => db.transaction(async (manager) => {
      const query = manager.query.bind(manager);
      manager.query = async (sql: string, parameters?: unknown[]) => {
        const rows = await query(sql, parameters);
        if (sql.includes("SELECT id,period_id,version,insurance_kind")) {
          signalRead();
          await continueRead;
        }
        return rows;
      };
      return callback(manager);
    }),
  } as DataSource;
  const blockedSimulation = new HrPayrollHistoryService(isolatedReader, {
    recordOperationRequired: async () => undefined,
  } as unknown as AuditService).simulateReconciliation(scope, actor, simulation);
  // Surface an early SQL failure instead of waiting forever for the fixture barrier.
  await Promise.race([readReached, blockedSimulation.then(() => { throw new Error("reader barrier was skipped"); })]);
  const writer = db.createQueryRunner();
  try {
    await writer.connect(); await writer.startTransaction();
    await writer.query("SET LOCAL lock_timeout='200ms'");
    await assert.rejects(() => writer.query(
      "INSERT INTO hr_employee_insurance_item(tenant_id,park_id,period_id,insurance_kind) VALUES($1,$2,$3,'remedy')",
      [scope.tenantId, scope.parkId, insurancePeriod]),
      (error: unknown) => (error as { driverError?: { code?: string } }).driverError?.code === "55P03");
  } finally {
    try {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
    } finally {
      try { await writer.release(); } finally { releaseRead(); }
    }
  }
  const lockedRun = await blockedSimulation;
  assert.equal((await insuranceEvidence(lockedRun.id)).frozen_insurance_version[ids.employee!].items.length, 1);

  assert.equal((await db.query("SELECT status FROM hr_payroll_legacy_batch WHERE id=$1", [ids.legacy]))[0].status, "staged");
  assert.equal((await db.query("SELECT (SELECT count(*) FROM hr_payroll_run)+(SELECT count(*) FROM hr_payslip) AS count"))[0].count, "0");
});
