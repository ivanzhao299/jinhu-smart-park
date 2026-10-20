import { registerSyntheticPayrollExtraction } from "./hr-yuzhou-payroll-source-extraction.fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrPayrollTrialService } from "./hr-payroll-trial.service";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";
import { ConfigService } from "@nestjs/config";
import { DataSource, type EntityManager } from "typeorm";
import { canonicalJson, yuzhouPayrollSourceHashInputs, type YuzhouPayrollSourcePackage } from "@jinhu/shared";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import { HrYuzhouPayrollSourceService } from "./hr-yuzhou-payroll-source.service";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { lockCurrentPayrollSource } from "./hr-payroll-frozen-source";

const enabled = process.env.HR_PAYROLL_SOURCE_PG_REQUIRED === "1";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
test("same-database T4 monthly baselines reference original facts and preserve old frozen hashes", { skip: !enabled }, async () => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_core_payrollupgrade$/u);
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15490, username: "postgres",
    password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
  await db.initialize();
  try {
    const scope = { tenantId: `anchor_${randomUUID()}`, parkId: `anchor_${randomUUID()}` };
    const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic_baseline_author", roles: [],
      permissions: ["hr:payroll:manage", "hr:payroll_reconciliation:review", "hr:payroll_detail:read"] };
    let auditFails = false;
    const audit = { recordOperationRequired: async (_input: unknown, manager: EntityManager) => {
      assert.ok(manager);
      if (auditFails) throw new Error("SYNTHETIC_BASELINE_AUDIT_FAILURE");
      await manager.query("SELECT 1");
    } } as unknown as AuditService;
    const service = new HrYuzhouPayrollSourceService(db,
      new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "synthetic-baseline-key-only-12345678901234567890" })), audit);
    const registeredPreview = async (value: Record<string, unknown>) => {
      await registerSyntheticPayrollExtraction(db, value as unknown as YuzhouPayrollSourcePackage);
      return service.preview(scope, actor, value);
    };
    const history = new HrPayrollHistoryService(db, audit);
    const rules = new HrPayrollFormalRuleService(db, audit);
    const inputs = new HrPayrollFormalInputService(db, rules, audit);
    const runs = new HrPayrollFormalRunService(db, inputs, audit);
    const trials = new HrPayrollTrialService(db, inputs, runs, audit);
    const trialActor = { ...actor, permissions: [...actor.permissions, HR_PERMISSIONS.HR_EMPLOYEE_READ,
      HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE] };
    const employeeId = randomUUID(), batchId = randomUUID(), controlId = randomUUID();
    const operation = `yzprod-import-20261020T000000Z-${randomUUID().replace(/-/gu, "").slice(0, 12)}`;
    const parent = `yzprod-import-20261020T000000Z-${randomUUID().replace(/-/gu, "").slice(0, 12)}`;
    const sourceHash = sha(operation);
    const makePackage = (month: string): YuzhouPayrollSourcePackage => {
      const books: YuzhouPayrollSourcePackage["books"] = [34, 35].map(scheme => {
        const rowHash = sha(`${month}:${scheme}:row`);
        return { scheme, bookName: null, closeState: 1, closeSourceHash: sha(`${month}:${scheme}:close`),
          items: [{ legacyItemName: "U1", itemCode: "U1", displayName: "合成工资项", valueType: "decimal",
            legacyItemType: "数值", legacyAddOrSub: "增加项", itemCategory: "earning", decimalScale: 4,
            sortNo: 1, sourceHash: sha(`${scheme}:item`), declarativeMetadata: {
              taxable: null, printEnabled: null, enabled: true, printWidth: null, printWidthSourceHash: null,
              taxFlag: null, noDecimalFlag: null, useFlag: null, legacyDecimalLength: null, decimalLengthSourceHash: null,
              legacyPrintReport: null, printReportSourceHash: null, itemTitle: null, longDescription: null,
              suppressDecimals: null, legacyMetadataReviewRequired: true } }],
          formulas: [{ legacyFormulaId: scheme * 100, itemCode: "U1", rawExpression: "1", rawCondition: "[U1]>0",
            calculationOrder: 1, sourceHash: sha(`${scheme}:formula`) },
            { legacyFormulaId: scheme * 100 + 1, itemCode: "ORIGINAL_ABSENT_ITEM", rawExpression: "1", rawCondition: null,
              calculationOrder: 2, sourceHash: sha(`${scheme}:orphan`) }],
          records: [{ sourcePersonIdentity: "SYNTHETIC-ANCHOR", employeeMappingId: employeeId,
            sourceTable: `dbo.salary${scheme}`, sourceRowSha256: rowHash, summary: { grossAmount: "1.0000", netAmount: "1.0000" },
            values: [{ column: "U1", valueType: "decimal", isSourceNull: false, decimalValue: "1.0000", sourceHash: sha(`${rowHash}U1`) }] }] };
      });
      return { version: 1, sourceSystem: "yuzhou-v10", targetScope: scope, sourceInstance: "synthetic-original-source",
        manifestId: "synthetic-original-export", month, extractedAt: "2026-10-20T00:00:00Z", evidenceSha256: sourceHash,
        expectedHeadVersion: 0, expectedHeadHash: null, books,
        bookSetSha256: sha(canonicalJson(books.map(b => ({ scheme: b.scheme, closeState: b.closeState, closeSourceHash: b.closeSourceHash })))),
        rosterSha256: sha(canonicalJson(books.map(b => ({ scheme: b.scheme, roster: b.records.map(r => r.sourcePersonIdentity) })))),
        catalogSha256: sha(canonicalJson(books.map(b => ({ scheme: b.scheme, items: b.items, formulas: b.formulas })))) };
    };
    const july = makePackage("2026-07"), august = makePackage("2026-08");
    await db.transaction("SERIALIZABLE", async m => {
      // Synthetic original T4 fixture only. No actual imported source receipts
      // or production authorization artifacts are fabricated by the feature.
      await m.query(`INSERT INTO hr_yuzhou_production_import_operation(operation_id,intent,status,code_sha,source_snapshot_sha256,mapping_contract_sha256,sealed_plan_sha256,target_identity_sha256,authorization_artifact_sha256,authorization_nonce_sha256,authorization_issued_at,authorization_expires_at,window_starts_at,window_ends_at,approval_set_sha256,manifest_sha256,final_rehearsal_pair_sha256,rehearsal_a_manifest_sha256,rehearsal_b_manifest_sha256,phase_order,finished_at,execution_contract_version,target_tenant_id,target_park_id,target_scope_sha256)
        VALUES($1,'production_import','succeeded',repeat('a',40),$2,$2,$2,$2,$2,$2,now()-interval '1 hour',now()+interval '1 hour',now()-interval '2 hours',now()+interval '2 hours',$2,$2,$2,$2,repeat('b',64),'["T0","T1","T2","T3"]',now(),2,$3,$4,hr_yuzhou_production_target_scope_sha256($3,$4))`, [parent, sourceHash, scope.tenantId, scope.parkId]);
      const binding = { operationId: operation, parent: { operationId: parent }, intent: "APPEND_UNPUBLISHED_T4_FULL_ARCHIVE_ONCE",
        mode: "full_archive", targetScope: scope, targetScopeSha256: (await m.query("SELECT hr_yuzhou_production_target_scope_sha256($1,$2) AS hash", [scope.tenantId, scope.parkId]))[0].hash,
        executionCodeSha: "a".repeat(40), triple: { sourceSnapshotHash: sourceHash } };
      await m.query("INSERT INTO hr_yuzhou_t4_followon_operation(operation_id,parent_operation_id,binding_sha256,binding,status,owned_state) VALUES($1,$2,$3,$4,'succeeded','{}')", [operation, parent, sourceHash, JSON.stringify(binding)]);
      await m.query("INSERT INTO hr_yuzhou_t4_followon_authorization_use(nonce_sha256,authorization_sha256,operation_id,intent) VALUES($1,$2,$3,'append')", [sha(`${operation}:nonce`), sha(`${operation}:auth`), operation]);
      await m.query("INSERT INTO migration_batch(id,run_id,source_system,source_snapshot_sha256,target_database,tool_version,status,execution_context,t4_followon_operation_id) VALUES($1,$2,'yuzhou-v10',$3,current_database(),'t4-followon-v1@'||repeat('a',40),'succeeded','t4_production_followon',$2)", [controlId, operation, sourceHash]);
      await m.query("INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status) VALUES($1,$2,$3,'SYNTHETIC-ANCHOR','合成基线员工','active')", [employeeId, scope.tenantId, scope.parkId]);
      const own = async (table: string, id: string, hash: string) => m.query(`INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
        VALUES($1,'yuzhou-v10','derived',$2,$3,$4,$5,$6,'loaded',true)`, [controlId, `${table}:${id}`, sha(`${table}:${id}`), hash, table, id]);
      await m.query("INSERT INTO hr_payroll_legacy_batch(id,tenant_id,park_id,batch_code,source_backup_hash,catalog_hash,manifest_hash,source_row_count,loaded_row_count,status) VALUES($1,$2,$3,$4,$5,$5,$5,4,4,'staged')", [batchId, scope.tenantId, scope.parkId, operation, sourceHash]);
      await own("hr_payroll_legacy_batch", batchId, sourceHash);
      for (const book of july.books) {
        const bookId = randomUUID(), definitionId = randomUUID(), versionId = randomUUID(), formulaId = randomUUID();
        const item = book.items[0]!, formula = book.formulas[0]!;
        await m.query("INSERT INTO hr_payroll_book(id,tenant_id,park_id,legacy_scheme,source_hash) VALUES($1,$2,$3,$4,$5)", [bookId, scope.tenantId, scope.parkId, book.scheme, sha(String(book.scheme))]);
        await own("hr_payroll_book", bookId, sha(String(book.scheme)));
        await m.query("INSERT INTO hr_payroll_item_definition(id,tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,$4,'U1','U1')", [definitionId, scope.tenantId, scope.parkId, bookId]);
        await own("hr_payroll_item_definition", definitionId, sha(`${book.scheme}:U1`));
        await m.query(`INSERT INTO hr_payroll_item_version(id,tenant_id,park_id,item_definition_id,version_no,display_name,value_type,legacy_item_type,legacy_add_or_sub,item_category,decimal_scale,sort_no,source_hash)
          VALUES($1,$2,$3,$4,1,$5,'decimal','数值','增加项','earning',4,1,$6)`, [versionId, scope.tenantId, scope.parkId, definitionId, item.displayName, item.sourceHash]);
        await own("hr_payroll_item_version", versionId, item.sourceHash);
        for (const sourceFormula of book.formulas) {
          const sourceFormulaId = sourceFormula === formula ? formulaId : randomUUID();
          await m.query(`INSERT INTO hr_payroll_formula_version(id,tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,raw_expression,raw_condition,expression_hash,parse_status,calculation_order)
            VALUES($1,$2,$3,$4,$5,$6,1,'1',$7,$8,'manual_review',$9)`, [sourceFormulaId, scope.tenantId, scope.parkId, bookId,
            sourceFormula.itemCode === "U1" ? versionId : null, sourceFormula.legacyFormulaId, sourceFormula.rawCondition, sha("1"), sourceFormula.calculationOrder]);
          await own("hr_payroll_formula_version", sourceFormulaId, sha("1"));
        }
        for (const pkg of [july, august]) {
          const monthBook = pkg.books.find(b => b.scheme === book.scheme)!, record = monthBook.records[0]!;
          const periodId = randomUUID(), snapshotId = randomUUID(), valueId = randomUUID();
          await m.query("INSERT INTO hr_payroll_book_period(id,tenant_id,park_id,book_id,period_month,legacy_close_state,source_hash) VALUES($1,$2,$3,$4,$5::date,1,$6)", [periodId, scope.tenantId, scope.parkId, bookId, `${pkg.month}-01`, monthBook.closeSourceHash]);
          await own("hr_payroll_book_period", periodId, monthBook.closeSourceHash);
          await m.query(`INSERT INTO hr_payroll_legacy_snapshot(id,tenant_id,park_id,batch_id,book_period_id,employee_id,legacy_source_table,legacy_employee_hash,source_content_group_hash,mapping_status,source_hash,gross_amount,net_amount)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'mapped',$9,1.0000,1.0000)`, [snapshotId, scope.tenantId, scope.parkId, batchId, periodId, employeeId, `salary${book.scheme}`, sha(record.sourcePersonIdentity), record.sourceRowSha256]);
          await own("hr_payroll_legacy_snapshot", snapshotId, record.sourceRowSha256);
          await m.query(`INSERT INTO hr_payroll_legacy_snapshot_item(id,tenant_id,park_id,snapshot_id,item_version_id,legacy_column_name,value_type,is_source_null,raw_value,decimal_value,source_hash)
            VALUES($1,$2,$3,$4,$5,'U1','decimal',false,'1.0000',1.0000,$6)`, [valueId, scope.tenantId, scope.parkId, snapshotId, versionId, record.values[0]!.sourceHash]);
          await own("hr_payroll_legacy_snapshot_item", valueId, record.values[0]!.sourceHash);
        }
      }
    });
    const factFingerprint = async () => (await db.query(`WITH facts AS (
      SELECT 'batch' AS kind,to_jsonb(b) AS row FROM hr_payroll_legacy_batch b WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'book',to_jsonb(b) FROM hr_payroll_book b WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'period',to_jsonb(p) FROM hr_payroll_book_period p WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'definition',to_jsonb(d) FROM hr_payroll_item_definition d WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'item',to_jsonb(v) FROM hr_payroll_item_version v WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'formula',to_jsonb(f) FROM hr_payroll_formula_version f WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'snapshot',to_jsonb(s) FROM hr_payroll_legacy_snapshot s WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'value',to_jsonb(i) FROM hr_payroll_legacy_snapshot_item i WHERE tenant_id=$1 AND park_id=$2
      UNION ALL SELECT 'map',to_jsonb(m) FROM legacy_record_map m WHERE batch_id=$3
      UNION ALL SELECT 'receipt',to_jsonb(r) FROM hr_yuzhou_t4_followon_operation r WHERE operation_id=$4
      UNION ALL SELECT 'control',to_jsonb(c) FROM migration_batch c WHERE id=$3)
      SELECT count(*)::int AS count,encode(digest(jsonb_agg(row ORDER BY kind,row->>'id')::text,'sha256'),'hex') AS hash FROM facts`, [scope.tenantId, scope.parkId, controlId, operation]))[0];
    const original = await factFingerprint();
    const [{ id: bookId }] = await db.query("SELECT id FROM hr_payroll_book WHERE tenant_id=$1 AND park_id=$2 AND legacy_scheme=34", [scope.tenantId, scope.parkId]);
    const request = { legacyBatchId: batchId, bookId, periodMonth: "2026-07-01" };
    const beforePreview = await history.previewReconciliationSource(scope, actor, request);
    const frozen = await history.createReconciliationSource(scope, actor, { ...beforePreview, reason: "合成原始基线证据" });
    const altered = structuredClone(july);
    altered.books[0]!.records[0]!.values[0]!.decimalValue = "2.0000";
    const rejected = await registeredPreview(altered as unknown as Record<string, unknown>);
    await assert.rejects(service.commit(scope, actor, rejected.id), /T4_BASELINE_SOURCE_DIFFERS_REVIEW_REQUIRED/u);
    assert.deepEqual(await factFingerprint(), original);
    for (const variant of ["condition", "close", "roster", "catalog", "metadata"] as const) {
      const invalid = structuredClone(july);
      if (variant === "condition") invalid.books[0]!.formulas[0]!.rawCondition = "[U1]>100";
      if (variant === "close") invalid.books[0]!.closeState = 0;
      if (variant === "roster") invalid.books.pop();
      if (variant === "catalog") invalid.books[0]!.items[0]!.displayName = "其他项目";
      if (variant === "metadata") invalid.books[0]!.items[0]!.declarativeMetadata!.printWidth = 12;
      Object.assign(invalid, Object.fromEntries(Object.entries(yuzhouPayrollSourceHashInputs(invalid)).map(([key, value]) => [key, sha(canonicalJson(value))])));
      const staged = await registeredPreview(invalid as unknown as Record<string, unknown>);
      await assert.rejects(service.commit(scope, actor, staged.id), /T4_BASELINE_SOURCE_DIFFERS_REVIEW_REQUIRED/u);
      assert.deepEqual(await factFingerprint(), original);
    }
    const preview = await registeredPreview(july as unknown as Record<string, unknown>);
    auditFails = true;
    await assert.rejects(service.commit(scope, actor, preview.id), /SYNTHETIC_BASELINE_AUDIT_FAILURE/u);
    auditFails = false;
    assert.equal((await service.status(scope, actor, preview.id)).status, "previewed");
    assert.deepEqual(await factFingerprint(), original);
    const anchored = await service.commit(scope, actor, preview.id);
    assert.equal(anchored.legacyBatchId, batchId);
    assert.equal(anchored.sourceReferenceKind, "t4");
    assert.deepEqual(await history.previewReconciliationSource(scope, actor, request), beforePreview);
    assert.equal((await history.createReconciliationSource(scope, actor, { ...beforePreview, reason: "复用原始基线证据" })).id, frozen.id);
    await db.transaction("READ COMMITTED", m => lockCurrentPayrollSource(m, scope, frozen.id));
    const beforeSetup = await history.reconciliationSetup(scope, actor);
    assert.equal(beforeSetup.sourceBatches.length, 1);
    assert.ok(beforeSetup.frozenSources.some(s => s.id === frozen.id));
    const beforePeriods = await history.reconciliationSourcePeriods(scope, actor, { legacyBatchId: batchId, bookId, page: 1, pageSize: 50 });
    assert.deepEqual(beforePeriods.items.map(p => p.periodMonth), ["2026-08-01", "2026-07-01"]);
    const beforeTrialOptions = await trials.options(scope, trialActor, { legacyBatchId: batchId, month: "2026-07" });
    assert.equal(beforeTrialOptions.recordCount, 2);
    assert.ok(beforeTrialOptions.books.find(b => b.scheme === 34)!.sources.some(s => s.id === frozen.id));
    const nextMonth = await registeredPreview(august as unknown as Record<string, unknown>);
    assert.equal((await service.commit(scope, actor, nextMonth.id)).legacyBatchId, batchId);
    assert.deepEqual(await factFingerprint(), original, "two months reference one T4 batch without changing any original fact/map/receipt");
    assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_yuzhou_payroll_source_generation WHERE tenant_id=$1 AND park_id=$2 AND legacy_batch_id=$3", [scope.tenantId, scope.parkId, batchId]))[0].count, 2);
    const current = await service.head(scope, actor, { sourceInstance: july.sourceInstance, month: july.month });
    const updated = structuredClone(july);
    updated.expectedHeadVersion = current.version; updated.expectedHeadHash = current.headHash;
    updated.manifestId = "synthetic-revised-source"; updated.evidenceSha256 = sha("new source evidence");
    updated.books[0]!.records[0]!.values[0]!.decimalValue = "2.0000";
    updated.books[0]!.records[0]!.sourceRowSha256 = sha("synthetic revised row");
    updated.books[0]!.records[0]!.values[0]!.sourceHash = sha(`${updated.books[0]!.records[0]!.sourceRowSha256}U1`);
    const revisedPreview = await registeredPreview(updated as unknown as Record<string, unknown>);
    const revised = await service.commit(scope, actor, revisedPreview.id);
    assert.equal(revised.sourceReferenceKind, "payroll_source_v1");
    assert.notEqual(revised.legacyBatchId, batchId);
    assert.equal(revised.generation, 2);
    await assert.rejects(db.transaction("READ COMMITTED", m => lockCurrentPayrollSource(m, scope, frozen.id)), /superseded/u);
    await assert.rejects(history.previewReconciliationSource(scope, actor, request), /superseded/u);
    await assert.rejects(history.createReconciliationSource(scope, actor, { ...beforePreview, reason: "拒绝旧月来源" }), /superseded/u);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_source WHERE id=$1", [frozen.id]))[0].count, 1);
    const newRequest = { ...request, legacyBatchId: revised.legacyBatchId! };
    const newPreview = await history.previewReconciliationSource(scope, actor, newRequest);
    const newFrozen = await history.createReconciliationSource(scope, actor, { ...newPreview, reason: "合成修订来源" });
    const afterSetup = await history.reconciliationSetup(scope, actor);
    assert.equal(afterSetup.sourceBatches.length, 2, "T4 August and typed July remain available");
    assert.equal(afterSetup.sourceBatches.find(b => b.id === batchId)!.recordCount, 2, "T4 selected catalog count excludes superseded July");
    assert.ok(afterSetup.frozenSources.some(s => s.id === newFrozen.id));
    assert.ok(!afterSetup.frozenSources.some(s => s.id === frozen.id));
    const oldPeriods = await history.reconciliationSourcePeriods(scope, actor, { legacyBatchId: batchId, bookId, page: 1, pageSize: 50 });
    assert.deepEqual(oldPeriods.items.map(p => p.periodMonth), ["2026-08-01"]);
    const newPeriods = await history.reconciliationSourcePeriods(scope, actor, { legacyBatchId: revised.legacyBatchId!, bookId, page: 1, pageSize: 50 });
    assert.deepEqual(newPeriods.items.map(p => p.periodMonth), ["2026-07-01"]);
    const options = await trials.options(scope, trialActor, { legacyBatchId: revised.legacyBatchId!, month: "2026-07" });
    assert.equal(options.recordCount, 2);
    assert.equal(options.periods.filter(p => p.month === "2026-07").length, 1);
    assert.equal(options.periods.find(p => p.month === "2026-07")!.legacyBatchId, revised.legacyBatchId);
    assert.ok(options.books.find(b => b.scheme === 34)!.sources.some(s => s.id === newFrozen.id));
    if (process.env.HR_PAYROLL_SOURCE_FIXTURE_RESULT) writeFileSync(process.env.HR_PAYROLL_SOURCE_FIXTURE_RESULT,
      JSON.stringify({ scope, originalBatchId: batchId, currentBatchId: revised.legacyBatchId,
        oldFrozenId: frozen.id, newFrozenId: newFrozen.id, month: july.month, syntheticOnly: true }), { mode: 0o600 });
  } finally { await db.destroy(); }
});
