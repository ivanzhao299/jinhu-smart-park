import { registerSyntheticPayrollExtraction } from "./hr-yuzhou-payroll-source-extraction.fixture";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { canonicalJson, yuzhouPayrollSourceHashInputs, HR_PERMISSIONS, type YuzhouPayrollSourcePackage } from "@jinhu/shared";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { AuditService } from "../audit/audit.service";
import { HrYuzhouPayrollSourceService } from "./hr-yuzhou-payroll-source.service";
import { HrPayrollHistoryService } from "./hr-payroll-history.service";
import { lockCurrentPayrollSource } from "./hr-payroll-frozen-source";

const enabled = process.env.HR_PAYROLL_SOURCE_PG_REQUIRED === "1";
const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

test("monthly source reuses existing catalogs, appends changed versions and rolls back failed audits", { skip: !enabled }, async () => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.equal(process.env.POSTGRES_PORT, "15490");
  assert.match(process.env.POSTGRES_DB ?? "", /^jinhu_hr_migration_lab_core_payroll(?:fresh|upgrade)$/u);
  const db = new DataSource({ type: "postgres", host: "127.0.0.1", port: 15490,
    username: "postgres", password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
  await db.initialize();
  try {
    const scope = { tenantId: `source_${randomUUID()}`, parkId: `source_${randomUUID()}` };
    const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic_source_author", roles: [],
      permissions: ["hr:payroll:manage", "hr:payroll_reconciliation:review", "hr:payroll_detail:read"] };
    const employeeId = randomUUID();
    await db.query(`INSERT INTO hr_employee(id,tenant_id,park_id,employee_code,full_name,employment_status)
      VALUES($1,$2,$3,'SYNTHETIC-001','合成验证员工','preboarding')`, [employeeId, scope.tenantId, scope.parkId]);
    let rejectAudit = false;
    let holdAudit: (() => Promise<void>) | undefined;
    const audit = { recordOperationRequired: async (_metadata: unknown, manager: { query: DataSource["query"] }) => {
      assert.ok(manager, "required audit uses the source transaction");
      if (rejectAudit) throw new Error("SYNTHETIC_AUDIT_FAILURE");
      if (holdAudit) await holdAudit();
      await manager.query("SELECT 1");
    } } as unknown as AuditService;
    const service = new HrYuzhouPayrollSourceService(db,
      new PartySensitiveDataService(new ConfigService({ PARTY_DATA_ENCRYPTION_KEY: "synthetic-source-test-key-only-12345678901234567890" })), audit);
    const registeredPreview = async (value: Record<string, unknown>) => {
      await registerSyntheticPayrollExtraction(db, value as unknown as YuzhouPayrollSourcePackage);
      return service.preview(scope, actor, value);
    };
    function source(month: string, label: string, expectedHeadVersion = 0, expectedHeadHash: string | null = null): YuzhouPayrollSourcePackage {
      const books: YuzhouPayrollSourcePackage["books"] = [34, 35].map(scheme => ({
        scheme, bookName: "合成来源账套", closeState: 1, closeSourceHash: digest({ scheme, month }),
        items: ["U1", "U2"].map(itemCode => ({ legacyItemName: itemCode, itemCode, displayName: itemCode,
          valueType: "decimal", legacyItemType: "0", legacyAddOrSub: "0", itemCategory: "unclassified",
          decimalScale: 4, sortNo: 0, sourceHash: digest({ scheme, itemCode }) })),
        formulas: [{ legacyFormulaId: scheme * 100, itemCode: "U2", rawExpression: "[U1]", rawCondition: null,
          calculationOrder: 1, sourceHash: digest({ scheme, formula: 1 }) }],
        records: [{ sourcePersonIdentity: "SYNTHETIC-001", employeeMappingId: employeeId,
          sourceTable: `salary${scheme}`, sourceRowSha256: digest({ scheme, month, person: "synthetic" }),
          summary: { grossAmount: "100.0000", netAmount: "100.0000" },
          values: ["U1", "U2"].map(column => ({ column, valueType: "decimal", isSourceNull: false,
            decimalValue: "100.0000", sourceHash: digest({ scheme, month, column }) })) }],
      }));
      return rehash({ version: 1, sourceSystem: "yuzhou-v10", targetScope: { ...scope }, manifestId: label, sourceInstance: "synthetic-source",
        month, extractedAt: "2026-10-20T00:00:00Z", evidenceSha256: digest(label), expectedHeadVersion, expectedHeadHash,
        books, bookSetSha256: "", rosterSha256: "", catalogSha256: "" });
    }
    function rehash(pkg: YuzhouPayrollSourcePackage) {
      Object.assign(pkg, Object.fromEntries(Object.entries(yuzhouPayrollSourceHashInputs(pkg)).map(([key, value]) => [key, digest(value)])));
      return pkg;
    }
    async function commit(pkg: YuzhouPayrollSourcePackage) {
      const op = await registeredPreview(pkg as unknown as Record<string, unknown>);
      const result = await service.commit(scope, actor, op.id);
      assert.equal(result.status, "committed");
      return op.id;
    }
    async function counts() {
      const [row] = await db.query(`SELECT
        (SELECT count(*)::int FROM hr_payroll_book WHERE tenant_id=$1 AND park_id=$2) books,
        (SELECT count(*)::int FROM hr_payroll_book_period WHERE tenant_id=$1 AND park_id=$2) periods,
        (SELECT count(*)::int FROM hr_payroll_item_definition WHERE tenant_id=$1 AND park_id=$2) definitions,
        (SELECT count(*)::int FROM hr_payroll_item_version WHERE tenant_id=$1 AND park_id=$2) items,
        (SELECT count(*)::int FROM hr_payroll_formula_version WHERE tenant_id=$1 AND park_id=$2) formulas,
        (SELECT count(*)::int FROM hr_payroll_legacy_batch WHERE tenant_id=$1 AND park_id=$2) batches`, [scope.tenantId, scope.parkId]);
      return row;
    }
    function latch() {
      let release!: () => void;
      const ready = new Promise<void>(resolve => { release = resolve; });
      return { ready, release };
    }
    async function waitForFactLock(mode: "SHARE" | "SHARE ROW EXCLUSIVE") {
      for (let attempt = 0; attempt < 100; attempt++) {
        const [{ count }] = await db.query(`SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE 'LOCK TABLE hr_payroll_legacy_snapshot%' AND query LIKE $1`, [`%IN ${mode} MODE`]);
        if (count > 0) return;
        await delay(10);
      }
      assert.fail(`Expected actual ${mode} source fact lock wait`);
    }
    const first = source("2026-07", "first");
    assert.deepEqual(await service.head(scope, actor, { sourceInstance: first.sourceInstance, month: first.month }),
      { sourceInstance: first.sourceInstance, month: first.month, version: 0, headHash: null, operationId: null });
    rejectAudit = true;
    await assert.rejects(service.head(scope, actor, { sourceInstance: first.sourceInstance, month: first.month }), /SYNTHETIC_AUDIT_FAILURE/u);
    rejectAudit = false;
    const beforeRejected = await counts();
    await assert.rejects(registeredPreview({ ...first, targetScope: { ...scope, parkId: "foreign" } }), /TARGET_SCOPE_MISMATCH/u);
    assert.deepEqual(await counts(), beforeRejected);
    await assert.rejects(service.head(scope, { ...actor, permissions: [] }, { sourceInstance: first.sourceInstance, month: first.month }));
    await assert.rejects(service.head(scope, actor, { sourceInstance: first.sourceInstance, month: "2026-13" }));
    await assert.rejects(service.preview(scope, actor, first as unknown as Record<string, unknown>), /VERIFIED_EXTRACTION_REQUIRED/u);
    const id = await commit(first);
    for (const mutate of [
      (p: YuzhouPayrollSourcePackage) => { p.books.pop(); },
      (p: YuzhouPayrollSourcePackage) => { p.books[0]!.records[0]!.values.pop(); },
      (p: YuzhouPayrollSourcePackage) => { p.books[0]!.formulas = []; },
      (p: YuzhouPayrollSourcePackage) => { p.books[0]!.records[0]!.values[0]!.decimalValue = "2.0000"; },
    ]) {
      const unregistered = structuredClone(first); mutate(unregistered); rehash(unregistered);
      await assert.rejects(service.preview(scope, actor, unregistered as unknown as Record<string, unknown>), /VERIFIED_EXTRACTION_REQUIRED/u);
    }
    await assert.rejects(db.query("UPDATE hr_yuzhou_payroll_source_extraction SET record_count=record_count WHERE tenant_id=$1 AND park_id=$2", [scope.tenantId,scope.parkId]), /append-only/u);
    await assert.rejects(db.query("DELETE FROM hr_yuzhou_payroll_source_extraction WHERE tenant_id=$1 AND park_id=$2", [scope.tenantId,scope.parkId]), /append-only/u);
    const importedHead = await service.head(scope, actor, { sourceInstance: first.sourceInstance, month: first.month });
    assert.equal(importedHead.version, 1);
    assert.equal(importedHead.operationId, id);
    const importedStatus = await service.status(scope, actor, id);
    assert.equal(importedStatus.headHash, importedHead.headHash);
    assert.deepEqual(importedStatus.currentHead, importedHead);
    assert.equal(importedStatus.generation, 1);
    await assert.rejects(service.head(scope, actor, { sourceInstance: "another-instance", month: first.month }), /SOURCE_INSTANCE_MISMATCH/u);
    assert.deepEqual(await counts(), { books: 2, periods: 2, definitions: 4, items: 4, formulas: 2, batches: 1 });
    const history = new HrPayrollHistoryService(db, audit);
    const [{ legacy_batch_id: batchId }] = await db.query("SELECT legacy_batch_id FROM hr_yuzhou_payroll_source_generation WHERE operation_id=$1", [id]);
    const sourceBooks = await db.query("SELECT id FROM hr_payroll_book WHERE tenant_id=$1 AND park_id=$2 ORDER BY legacy_scheme", [scope.tenantId, scope.parkId]);
    const selection = { legacyBatchId: batchId, bookId: sourceBooks[0].id, periodMonth: "2026-07-01" };
    const sourcePreview = await history.previewReconciliationSource(scope, actor, selection);
    assert.equal(sourcePreview.snapshotCount, 1);
    assert.equal(sourcePreview.itemCount, 2);
    const freeze = { ...selection, ...sourcePreview, reason: "诊断候选来源冻结，未获业务确认" };
    const frozen = await history.createReconciliationSource(scope, actor, freeze);
    assert.equal((await history.createReconciliationSource(scope, actor, freeze)).id, frozen.id);
    await db.transaction("READ COMMITTED", async manager => {
      const locked = await lockCurrentPayrollSource(manager, scope, frozen.id);
      assert.equal(locked.sourceKind, "payroll_source_v1");
      assert.equal(locked.recordCount, 1);
      assert.equal(locked.itemCount, 2);
    });
    await assert.rejects(history.createReconciliationSource(scope, actor, { ...freeze, bindingSha256: digest("wrong binding") }));
    await assert.rejects(history.createReconciliationSource(scope, actor, { ...freeze, itemCount: 3 }));
    await assert.rejects(history.createReconciliationSource({ ...scope, parkId: "foreign" }, actor, freeze));
    const secondPreview = await history.previewReconciliationSource(scope, actor, { ...selection, bookId: sourceBooks[1].id });
    rejectAudit = true;
    await assert.rejects(history.createReconciliationSource(scope, actor, {
      ...selection, ...secondPreview, reason: "诊断候选审计失败回滚" }), /SYNTHETIC_AUDIT_FAILURE/u);
    rejectAudit = false;
    assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_source WHERE tenant_id=$1 AND park_id=$2", [scope.tenantId, scope.parkId]))[0].count, 1);
    const preparationActor = { ...actor, permissions: [...actor.permissions,
      HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_ATTENDANCE_READ, HR_PERMISSIONS.HR_ATTENDANCE_PAYROLL_INPUT_READ,
      HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ] };
    const cohort = await history.preparationCohort(scope, preparationActor, {
      legacyBatchId: batchId, periodMonth: "2026-07-01", page: 1, page_size: 50 });
    assert.equal(cohort.totals.recordCount, 2);
    assert.equal(cohort.totals.employeeCount, 1);
    assert.equal(cohort.totals.bookCount, 2);
    assert.equal(cohort.totals.itemCount, 4);
    assert.equal((await service.commit(scope, actor, id)).id, id);
    assert.equal((await registeredPreview(first as unknown as Record<string, unknown>)).id, id);
    assert.deepEqual(await counts(), { books: 2, periods: 2, definitions: 4, items: 4, formulas: 2, batches: 1 });
    const sameMonthNewManifest = { ...first, manifestId: "new-backup-unchanged-month", evidenceSha256: digest("new-backup"),
      extractedAt: "2026-10-21T00:00:00Z", expectedHeadVersion: importedHead.version, expectedHeadHash: importedHead.headHash };
    const removedBook = structuredClone(sameMonthNewManifest);
    removedBook.books.pop();
    await assert.rejects(registeredPreview(rehash(removedBook) as unknown as Record<string, unknown>), /SOURCE_ROSTER_REMOVAL_REQUIRES_PROOF/u);
    const removedPerson = structuredClone(sameMonthNewManifest);
    removedPerson.books[0]!.records = [];
    await assert.rejects(registeredPreview(rehash(removedPerson) as unknown as Record<string, unknown>), /YUZHOU_PAYROLL_SOURCE_PACKAGE_INVALID/u);
    await assert.rejects(registeredPreview({ ...sameMonthNewManifest, expectedHeadVersion: 0, expectedHeadHash: null }), /head changed/u);
    const beforeNoop = await counts();
    const [{ count: operationsBeforeNoop }] = await db.query("SELECT count(*)::int AS count FROM hr_yuzhou_payroll_source_operation WHERE tenant_id=$1 AND park_id=$2", [scope.tenantId, scope.parkId]);
    const unchanged = await registeredPreview(sameMonthNewManifest);
    assert.equal("outcome" in unchanged && unchanged.outcome, "unchanged");
    assert.equal(unchanged.id, id);
    assert.equal((await service.commit(scope, actor, unchanged.id)).id, id);
    assert.deepEqual(await counts(), beforeNoop, "changed backup evidence does not duplicate unchanged month facts");
    assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_yuzhou_payroll_source_operation WHERE tenant_id=$1 AND park_id=$2", [scope.tenantId, scope.parkId]))[0].count, operationsBeforeNoop);
    rejectAudit = true;
    await assert.rejects(registeredPreview(sameMonthNewManifest), /SYNTHETIC_AUDIT_FAILURE/u);
    rejectAudit = false;
    assert.deepEqual(await counts(), beforeNoop);
    const original = await db.query("SELECT to_jsonb(v) AS row FROM hr_payroll_item_version v WHERE tenant_id=$1 AND park_id=$2 ORDER BY id", [scope.tenantId, scope.parkId]);
    await commit(source("2026-08", "next-month"));
    assert.deepEqual(await counts(), { books: 2, periods: 4, definitions: 4, items: 4, formulas: 2, batches: 2 });
    const [head] = await db.query("SELECT version,head_hash FROM hr_yuzhou_payroll_source_head WHERE tenant_id=$1 AND park_id=$2 AND period_month='2026-07-01'", [scope.tenantId, scope.parkId]);
    const changed = source("2026-07", "item-revision", head.version, head.head_hash);
    changed.books[0]!.items[0]!.displayName = "新来源名称";
    changed.books[0]!.items[0]!.sourceHash = digest("revised item");
    const enteredAudit = latch(), releaseAudit = latch();
    holdAudit = async () => { enteredAudit.release(); await releaseAudit.ready; };
    const importing = commit(rehash(changed));
    await enteredAudit.ready;
    const readingDuringImport = db.transaction("READ COMMITTED", manager => lockCurrentPayrollSource(manager, scope, frozen.id))
      .then(() => ({ ok: true, message: "" }), error => ({ ok: false, message: error.message as string }));
    try { await waitForFactLock("SHARE"); } finally { releaseAudit.release(); }
    await importing;
    holdAudit = undefined;
    const blockedRead = await readingDuringImport;
    assert.equal(blockedRead.ok, false);
    assert.match(blockedRead.message, /superseded/u);
    assert.deepEqual(await counts(), { books: 2, periods: 4, definitions: 4, items: 5, formulas: 2, batches: 3 });
    await assert.rejects(db.transaction("READ COMMITTED", manager => lockCurrentPayrollSource(manager, scope, frozen.id)), /superseded/u);
    await assert.rejects(history.preparationCohort(scope, preparationActor, {
      legacyBatchId: batchId, periodMonth: "2026-07-01", page: 1, page_size: 50 }), /superseded/u);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM hr_payroll_reconciliation_source WHERE id=$1", [frozen.id]))[0].count, 1, "superseded evidence is retained");
    const retained = await db.query("SELECT to_jsonb(v) AS row FROM hr_payroll_item_version v WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) ORDER BY id", [scope.tenantId, scope.parkId, original.map((x: {row:{id:string}}) => x.row.id)]);
    assert.deepEqual(retained, original, "old version bytes remain unchanged");
    const oldFormulas = await db.query("SELECT to_jsonb(v) AS row FROM hr_payroll_formula_version v WHERE tenant_id=$1 AND park_id=$2 ORDER BY id", [scope.tenantId, scope.parkId]);
    const [revisedHead] = await db.query("SELECT version,head_hash FROM hr_yuzhou_payroll_source_head WHERE tenant_id=$1 AND park_id=$2 AND period_month='2026-07-01'", [scope.tenantId, scope.parkId]);
    const formulaChange = source("2026-07", "formula-revision", revisedHead.version, revisedHead.head_hash);
    formulaChange.books[0]!.formulas[0]!.rawExpression = "[U1]+1";
    formulaChange.books[0]!.formulas[0]!.sourceHash = digest("revised formula");
    await commit(rehash(formulaChange));
    assert.deepEqual(await counts(), { books: 2, periods: 4, definitions: 4, items: 5, formulas: 3, batches: 4 });
    assert.deepEqual(await db.query("SELECT to_jsonb(v) AS row FROM hr_payroll_formula_version v WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) ORDER BY id", [scope.tenantId, scope.parkId, oldFormulas.map((x: {row:{id:string}}) => x.row.id)]), oldFormulas);
    const parallel = [source("2026-10", "parallel-oct"), source("2026-11", "parallel-nov")];
    parallel.forEach((pkg, index) => {
      pkg.books[0]!.items[0]!.displayName = `并发版本${index}`;
      pkg.books[0]!.items[0]!.sourceHash = digest({ revision: index });
      rehash(pkg);
    });
    await Promise.all(parallel.map(commit));
    assert.deepEqual(await counts(), { books: 2, periods: 8, definitions: 4, items: 7, formulas: 3, batches: 6 });
    const versions = await db.query(`SELECT v.version_no FROM hr_payroll_item_version v
      JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id JOIN hr_payroll_book b ON b.id=d.book_id
      WHERE v.tenant_id=$1 AND v.park_id=$2 AND b.legacy_scheme=34 AND d.item_code='U1' ORDER BY v.version_no`, [scope.tenantId, scope.parkId]);
    assert.deepEqual(versions.map((row: {version_no:number}) => row.version_no), [1, 2, 3, 4]);
    const competing = [source("2026-12", "cas-one"), source("2026-12", "cas-two")];
    competing[1]!.books[0]!.records[0]!.values[0]!.decimalValue = "123.0000";
    competing[1]!.books[0]!.records[0]!.sourceRowSha256 = digest("changed cas row");
    const settled = await Promise.allSettled(competing.map(commit));
    assert.equal(settled.filter(result => result.status === "fulfilled").length, 1);
    const rejected = settled.find(result => result.status === "rejected") as PromiseRejectedResult;
    assert.match(rejected.reason.message, /head changed/u);
    assert.deepEqual(await counts(), { books: 2, periods: 10, definitions: 4, items: 7, formulas: 3, batches: 7 });
    const beforeFailure = await counts();
    const [{ legacy_batch_id: currentBatchId }] = await db.query(`SELECT g.legacy_batch_id FROM hr_yuzhou_payroll_source_generation g
      JOIN hr_yuzhou_payroll_source_head h ON h.operation_id=g.operation_id AND h.tenant_id=g.tenant_id AND h.park_id=g.park_id
      WHERE h.tenant_id=$1 AND h.park_id=$2 AND h.period_month='2026-07-01'`, [scope.tenantId, scope.parkId]);
    const currentPreview = await history.previewReconciliationSource(scope, actor, { ...selection, legacyBatchId: currentBatchId });
    const currentFrozen = await history.createReconciliationSource(scope, actor, { ...currentPreview, reason: "诊断候选并发读取" });
    const enteredReader = latch(), releaseReader = latch();
    const readingFirst = db.transaction("READ COMMITTED", async manager => {
      await lockCurrentPayrollSource(manager, scope, currentFrozen.id);
      enteredReader.release(); await releaseReader.ready;
    });
    await enteredReader.ready;
    rejectAudit = true;
    const failing = source("2026-09", "audit-rollback");
    const preview = await registeredPreview(failing as unknown as Record<string, unknown>);
    const failedImport = service.commit(scope, actor, preview.id)
      .then(() => "unexpected success", error => error.message as string);
    try { await waitForFactLock("SHARE ROW EXCLUSIVE"); } finally { releaseReader.release(); }
    await readingFirst;
    assert.match(await failedImport, /SYNTHETIC_AUDIT_FAILURE/u);
    assert.deepEqual(await counts(), beforeFailure, "failed audit rolls back new periods/batch/facts");
    assert.equal((await service.status(scope, actor, preview.id)).status, "previewed");
    rejectAudit = false;
    const metadataSource = source("2027-01", "declarative-metadata");
    for (const book of metadataSource.books) for (const [index, item] of book.items.entries()) {
      item.declarativeMetadata = { taxable: index === 0 ? true : null, printEnabled: true, enabled: index === 0,
        printWidth: 12, printWidthSourceHash: digest("print width"), taxFlag: index === 0 ? "1" : null,
        noDecimalFlag: "0", useFlag: index === 0 ? "1" : "0", legacyDecimalLength: 4,
        decimalLengthSourceHash: digest("decimal length"), legacyPrintReport: 1, printReportSourceHash: digest("print report"),
        itemTitle: "合成项目", longDescription: "仅用于属性接续验证", suppressDecimals: false, legacyMetadataReviewRequired: index !== 0 };
    }
    const metadataId = await commit(rehash(metadataSource));
    const metadataRows = async (operationId: string) => db.query(`SELECT b.legacy_scheme AS scheme,d.item_code AS code,v.id,
      jsonb_build_object('taxable',v.taxable,'printEnabled',v.print_enabled,'enabled',v.enabled,
        'printWidth',v.legacy_print_width,'printWidthSourceHash',v.legacy_print_width_hash,
        'taxFlag',v.legacy_tax_flag,'noDecimalFlag',v.legacy_no_decimal_flag,'useFlag',v.legacy_use_flag,
        'legacyDecimalLength',v.legacy_decimal_length,'decimalLengthSourceHash',v.legacy_decimal_length_hash,
        'legacyPrintReport',v.legacy_print_report,'printReportSourceHash',v.legacy_print_report_hash,
        'itemTitle',v.legacy_item_title,'longDescription',v.legacy_long_description,
        'suppressDecimals',v.suppress_decimals,'legacyMetadataReviewRequired',v.legacy_metadata_review_required) AS metadata
      FROM hr_yuzhou_payroll_source_ownership w JOIN hr_payroll_item_version v ON v.id=w.target_id AND v.tenant_id=w.tenant_id AND v.park_id=w.park_id
      JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id
      JOIN hr_payroll_book b ON b.id=d.book_id AND b.tenant_id=d.tenant_id AND b.park_id=d.park_id
      WHERE w.tenant_id=$1 AND w.park_id=$2 AND w.operation_id=$3 AND w.target_table='hr_payroll_item_version' ORDER BY b.legacy_scheme,d.item_code`, [scope.tenantId, scope.parkId, operationId]);
    const savedMetadata = await metadataRows(metadataId);
    assert.equal(savedMetadata.length, 4);
    for (const row of savedMetadata) assert.deepEqual(row.metadata,
      metadataSource.books.find(b => b.scheme === row.scheme)!.items.find(i => i.itemCode === row.code)!.declarativeMetadata);
    const metadataHead = await service.head(scope, actor, { sourceInstance: metadataSource.sourceInstance, month: metadataSource.month });
    const metadataRevision = structuredClone(metadataSource);
    metadataRevision.expectedHeadVersion = metadataHead.version; metadataRevision.expectedHeadHash = metadataHead.headHash;
    metadataRevision.manifestId = "declarative-metadata-revision";
    metadataRevision.books[0]!.items[0]!.declarativeMetadata!.printWidth = 24;
    metadataRevision.books[0]!.items[0]!.declarativeMetadata!.printWidthSourceHash = digest("revised width");
    metadataRevision.books[0]!.items[0]!.sourceHash = digest("revised item metadata");
    const revisionId = await commit(rehash(metadataRevision));
    const revisedMetadata = await metadataRows(revisionId);
    assert.equal(revisedMetadata[0].metadata.printWidth, 24);
    assert.notEqual(revisedMetadata[0].id, savedMetadata[0].id);
    assert.deepEqual(await metadataRows(metadataId), savedMetadata, "source metadata revision preserves the prior rich version bytes");
    const orphanSource = source("2027-02", "original orphan formula");
    orphanSource.books[0]!.formulas.push({ legacyFormulaId: 34999, itemCode: "ORIGINAL_ABSENT_ITEM", rawExpression: "1",
      rawCondition: "[U1]>0", calculationOrder: 2, sourceHash: digest("original orphan source") });
    orphanSource.books[0]!.items.push({ ...orphanSource.books[0]!.items[0]!,
      legacyItemName: "legacy_alias", itemCode: "EXACT_CODE", sourceHash: digest("alias item") });
    orphanSource.books[0]!.formulas.push({ legacyFormulaId: 35000, itemCode: "legacy_alias", rawExpression: "1",
      rawCondition: null, calculationOrder: 3, sourceHash: digest("alias is not target code") });
    const orphanOperation = await commit(rehash(orphanSource));
    const [orphan] = await db.query(`SELECT f.item_version_id,f.parse_status,f.raw_expression,f.raw_condition
      FROM hr_yuzhou_payroll_source_ownership w JOIN hr_payroll_formula_version f ON f.id=w.target_id AND f.tenant_id=w.tenant_id AND f.park_id=w.park_id
      WHERE w.tenant_id=$1 AND w.park_id=$2 AND w.operation_id=$3 AND w.target_table='hr_payroll_formula_version' AND f.legacy_formula_id=34999`, [scope.tenantId, scope.parkId, orphanOperation]);
    assert.deepEqual(orphan, { item_version_id: null, parse_status: "manual_review", raw_expression: "1", raw_condition: "[U1]>0" });
    const [aliasOrphan] = await db.query(`SELECT item_version_id FROM hr_payroll_formula_version
      WHERE tenant_id=$1 AND park_id=$2 AND legacy_formula_id=35000`, [scope.tenantId, scope.parkId]);
    assert.equal(aliasOrphan.item_version_id, null, "formula targets resolve exact item codes like the T4 baseline");
    const malformed = structuredClone(metadataRevision);
    malformed.books[0]!.items[0]!.declarativeMetadata!.legacyMetadataReviewRequired = false;
    malformed.books[0]!.items[0]!.declarativeMetadata!.taxable = null;
    await assert.rejects(registeredPreview(rehash(malformed) as unknown as Record<string, unknown>), /PACKAGE_INVALID/u);

  } finally { await db.destroy(); }
});
