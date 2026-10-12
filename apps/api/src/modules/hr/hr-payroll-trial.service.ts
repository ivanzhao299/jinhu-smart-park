import { lockCurrentPayrollSource, PAYROLL_SOURCE_TABLES } from "./hr-payroll-frozen-source";
import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { HR_PERMISSIONS, type PayrollTrialOptions, type PayrollTrialResult, type PayrollTrialRecord, type TenantParkScope } from "@jinhu/shared";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { HrPayrollFormalRunOptionsQueryDto } from "./dto/hr-payroll-formal-run.dto";
import { PayrollTrialDto, PayrollTrialOptionsDto } from "./dto/hr-payroll-trial.dto";
import { HrPayrollFormalInputService } from "./hr-payroll-formal-input.service";
import { HrPayrollFormalRunService } from "./hr-payroll-formal-run.service";
import { HR_PAYROLL_INSURANCE_REFERENCE_CODES } from "./hr-payroll-insurance-input";
import { comparePayrollTrialItems, payrollTrialDifference, type TrialSourceItem } from "./hr-payroll-trial-comparison";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const MAX_RECORDS = 5000, MAX_ITEMS = 200000, MAX_RESULT_LINES = 200000, MAX_BYTES = 16 * 1024 * 1024;
type Census = { id: string; bookId: string; employeeId: string | null; employeeCode: string | null; fullName: string | null; available: boolean; bookName: string; scheme: number };


@Injectable()
export class HrPayrollTrialService {
  constructor(private readonly db: DataSource, private readonly inputs: HrPayrollFormalInputService, private readonly runs: HrPayrollFormalRunService, private readonly audit: AuditService) {}
  private authority(scope: TenantParkScope, actor: JwtPrincipal, insurance = false) {
    const required = [HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ, HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE,
      ...(insurance ? [HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ] : [])];
    if (actor.tenantId !== scope.tenantId || actor.parkId !== scope.parkId || (!actor.isSuper && !actor.permissions.includes("*") && !required.every(permission => actor.permissions.includes(permission)))) throw new ForbiddenException("Payroll trial permission and current scope required");
  }
  private async validate<T extends object>(type: new () => T, value: T): Promise<T> {
    const dto = plainToInstance(type, value);
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) throw new BadRequestException("Invalid payroll trial selection");
    return dto;
  }
  private async budgets(manager: EntityManager) {
    await manager.query("SET LOCAL statement_timeout='15s'");
    await manager.query("SET LOCAL lock_timeout='2s'");
    await manager.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
  }
  private async receipt(manager: EntityManager, scope: TenantParkScope, batchId: string) {
    const rows = await manager.query(`SELECT b.id FROM hr_payroll_legacy_batch b
      JOIN hr_yuzhou_t4_followon_operation r ON r.operation_id=b.batch_code AND r.status='succeeded'
        AND r.binding->'targetScope'->>'tenantId'=b.tenant_id AND r.binding->'targetScope'->>'parkId'=b.park_id
        AND r.binding->'triple'->>'sourceSnapshotHash'=b.source_backup_hash::text
      JOIN migration_batch c ON c.run_id=r.operation_id AND c.t4_followon_operation_id=r.operation_id
        AND c.status='succeeded' AND c.target_database=current_database()
      WHERE b.id=$3 AND b.tenant_id=$1 AND b.park_id=$2 AND NOT b.is_deleted AND b.status='staged' AND b.published_at IS NULL
      FOR SHARE OF b,r,c`, [scope.tenantId, scope.parkId, batchId]);
    if (rows.length !== 1) throw new ConflictException("Select a staged payroll source with a succeeded current-database receipt");
  }
  private async census(manager: EntityManager, scope: TenantParkScope, batchId: string, month: string): Promise<Census[]> {
    const rows: Census[] = await manager.query(`SELECT s.id,p.book_id AS "bookId",s.employee_id AS "employeeId",e.employee_code AS "employeeCode",e.full_name AS "fullName",
      (NOT s.is_deleted AND NOT p.is_deleted AND NOT b.is_deleted AND e.id IS NOT NULL AND NOT e.is_deleted AND s.mapping_status='mapped' AND s.source_multiplicity=1) AS available,
      COALESCE(NULLIF(btrim(b.book_name),''),'工资账套 '||b.legacy_scheme) AS "bookName",b.legacy_scheme AS scheme
      FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p ON (p.id,p.tenant_id,p.park_id)=(s.book_period_id,s.tenant_id,s.park_id)
      JOIN hr_payroll_book b ON (b.id,b.tenant_id,b.park_id)=(p.book_id,p.tenant_id,p.park_id)
      LEFT JOIN hr_employee e ON (e.id,e.tenant_id,e.park_id)=(s.employee_id,s.tenant_id,s.park_id)
      WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.batch_id=$3 AND p.period_month=$4::date ORDER BY p.book_id,s.id LIMIT 5001`, [scope.tenantId, scope.parkId, batchId, `${month}-01`]);
    if (!rows.length || rows.length > MAX_RECORDS || new Set(rows.map(row => row.bookId)).size > 50) throw new ConflictException("Payroll month is empty or exceeds the complete comparison limit");
    const [{ count, bytes }] = await manager.query(`SELECT count(*)::int AS count,COALESCE(sum(octet_length(to_jsonb(i)::text)),0)::text AS bytes FROM hr_payroll_legacy_snapshot_item i WHERE tenant_id=$1 AND park_id=$2 AND snapshot_id=ANY($3::uuid[]) AND NOT is_deleted`, [scope.tenantId, scope.parkId, rows.map(row => row.id)]);
    if (count > MAX_ITEMS || BigInt(bytes) > BigInt(MAX_BYTES)) throw new ConflictException("Payroll source exceeds the complete item or payload limit");
    return rows;
  }
  private async recordAudit(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, action: string, metadata: Record<string, unknown>) {
    await this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, roleCodes: actor.roles,
      module: "人力资源管理", resource: "hr.payroll_trial", action, bizType: "hr_payroll_trial", bizId: null,
      beforeJson: null, afterJson: metadata, method: action === "读取全账套试算选项" ? "GET" : "POST", path: "/hr/payroll/trial-comparisons",
      success: true, result: "success", requestId: null }, manager);
  }
  async sourceOptions(scope: TenantParkScope, actor: JwtPrincipal, query: HrPayrollFormalRunOptionsQueryDto) {
    this.authority(scope, actor);
    return this.runs.options(scope, actor, query, true);
  }
  async options(scope: TenantParkScope, actor: JwtPrincipal, query: PayrollTrialOptionsDto): Promise<PayrollTrialOptions> {
    this.authority(scope, actor);
    const dto = await this.validate(PayrollTrialOptionsDto, query);
    if (!!dto.legacyBatchId !== !!dto.month) throw new BadRequestException("Select payroll source and month together");
    return this.db.transaction("REPEATABLE READ", async manager => {
      await this.budgets(manager);
      const periods: PayrollTrialOptions["periods"] = await manager.query(`SELECT b.id AS "legacyBatchId",b.batch_code AS "batchCode",to_char(p.period_month,'YYYY-MM') AS month,count(*)::int AS "recordCount"
        FROM hr_payroll_legacy_batch b JOIN hr_payroll_legacy_snapshot s ON (s.batch_id,s.tenant_id,s.park_id)=(b.id,b.tenant_id,b.park_id)
        JOIN hr_payroll_book_period p ON (p.id,p.tenant_id,p.park_id)=(s.book_period_id,s.tenant_id,s.park_id)
        WHERE b.tenant_id=$1 AND b.park_id=$2 AND NOT b.is_deleted AND b.status='staged' AND b.published_at IS NULL
        AND EXISTS(SELECT 1 FROM hr_yuzhou_t4_followon_operation r JOIN migration_batch c ON c.run_id=r.operation_id AND c.t4_followon_operation_id=r.operation_id AND c.status='succeeded' AND c.target_database=current_database()
          WHERE r.operation_id=b.batch_code AND r.status='succeeded' AND r.binding->'targetScope'->>'tenantId'=b.tenant_id AND r.binding->'targetScope'->>'parkId'=b.park_id AND r.binding->'triple'->>'sourceSnapshotHash'=b.source_backup_hash::text)
        GROUP BY b.id,b.batch_code,p.period_month ORDER BY p.period_month DESC,b.id LIMIT 501`, [scope.tenantId, scope.parkId]);
      if (periods.length > 500) throw new ConflictException("Payroll source period catalog exceeds the complete selection limit");
      const books: PayrollTrialOptions["books"] = [];
      let rows: Census[] = [];
      if (dto.legacyBatchId && dto.month) {
        await this.receipt(manager, scope, dto.legacyBatchId);
        rows = await this.census(manager, scope, dto.legacyBatchId, dto.month);
        for (const bookId of [...new Set(rows.map(row => row.bookId))].sort()) {
          const records = rows.filter(row => row.bookId === bookId), first = records[0]!;
          const sources: PayrollTrialOptions["books"][number]["sources"] = await manager.query(`SELECT id,source_sha256 AS "sourceHash",snapshot_count AS "recordCount",item_count AS "itemCount"
            FROM hr_payroll_reconciliation_source WHERE tenant_id=$1 AND park_id=$2 AND legacy_batch_id=$3 AND book_id=$4 AND period_month=$5::date ORDER BY created_at,id LIMIT 101`, [scope.tenantId, scope.parkId, dto.legacyBatchId, bookId, `${dto.month}-01`]);
          const inputs: PayrollTrialOptions["books"][number]["inputs"] = await manager.query(`SELECT i.id,i.version,i.revision_no AS "revisionNo",i.rule_version_id AS "ruleVersionId",s.display_name AS "ruleName",jsonb_array_length(i.employees) AS "employeeCount",v.definition
            FROM hr_payroll_rule_set s JOIN hr_payroll_formal_input i ON (i.rule_set_id,i.tenant_id,i.park_id)=(s.id,s.tenant_id,s.park_id)
            JOIN hr_payroll_period p ON (p.id,p.tenant_id,p.park_id)=(i.period_id,i.tenant_id,i.park_id)
            JOIN hr_payroll_rule_version v ON (v.id,v.tenant_id,v.park_id)=(i.rule_version_id,i.tenant_id,i.park_id)
            WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.source_book_id=$3 AND p.period_month=$4::date AND NOT p.is_deleted AND p.status='open'
              AND i.status='confirmed' AND i.correction_window_id IS NULL
              AND NOT EXISTS(SELECT 1 FROM hr_payroll_formal_input newer WHERE (newer.period_id,newer.rule_set_id,newer.tenant_id,newer.park_id)=(i.period_id,i.rule_set_id,i.tenant_id,i.park_id) AND newer.status='confirmed' AND newer.revision_no>i.revision_no)
            ORDER BY i.revision_no DESC,i.id LIMIT 101`, [scope.tenantId, scope.parkId, bookId, `${dto.month}-01`]);
          const items: PayrollTrialOptions["books"][number]["items"] = await manager.query(`SELECT v.id,d.item_code AS code,v.display_name AS name,v.version_no AS "versionNo",v.value_type AS "valueType"
            FROM hr_payroll_item_definition d JOIN hr_payroll_item_version v ON (v.item_definition_id,v.tenant_id,v.park_id)=(d.id,d.tenant_id,d.park_id)
            WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.book_id=$3 AND NOT d.is_deleted AND NOT v.is_deleted ORDER BY d.item_code,v.version_no,v.id LIMIT 2049`, [scope.tenantId, scope.parkId, bookId]);
          if (sources.length > 100 || inputs.length > 100 || items.length > 2048) throw new ConflictException("Payroll options exceed complete selection limits");
          books.push({ bookId, bookName: first.bookName, scheme: first.scheme, recordCount: records.length, employeeCount: new Set(records.map(row => row.employeeId).filter(Boolean)).size,
            unavailableCount: records.filter(row => !row.available).length, duplicateCount: records.length - new Set(records.map(row => row.employeeId)).size, sources, inputs, items });
        }
      }
      const result = { periods, legacyBatchId: dto.legacyBatchId ?? null, month: dto.month ?? null, recordCount: rows.length, employeeCount: new Set(rows.map(row => row.employeeId).filter(Boolean)).size, books };
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new ConflictException("Payroll options exceed response limit");
      await this.recordAudit(manager, scope, actor, "读取全账套试算选项", { bookCount: books.length, recordCount: rows.length });
      return result;
    });
  }
  async calculate(scope: TenantParkScope, actor: JwtPrincipal, value: PayrollTrialDto): Promise<PayrollTrialResult> {
    this.authority(scope, actor);
    const dto = await this.validate(PayrollTrialDto, value);
    if (dto.books.some(book => book.insuranceSources)) this.authority(scope, actor, true);
    if (new Set(dto.books.map(book => book.bookId)).size !== dto.books.length) throw new BadRequestException("Select each payroll book exactly once");
    try { return await this.db.transaction("READ COMMITTED", async manager => {
      await this.budgets(manager);
      const deadline = Date.now() + 30000;
      // Builder 000319 requires READ COMMITTED. SHARE locks prevent phantoms and preserve
      // the entire census, item catalog and record ownership until audit + result commit.
      await manager.query(`LOCK TABLE ${PAYROLL_SOURCE_TABLES} IN SHARE MODE`);
      await this.receipt(manager, scope, dto.legacyBatchId);
      const census = await this.census(manager, scope, dto.legacyBatchId, dto.month);
      const bookIds = [...new Set(census.map(row => row.bookId))].sort();
      if (JSON.stringify(bookIds) !== JSON.stringify(dto.books.map(book => book.bookId).sort())) throw new ConflictException("Select every payroll book in this source month; partial comparison is not complete");
      if (census.some(row => !row.available)) throw new ConflictException("Resolve unavailable, unmapped or multiple-origin payroll records before full comparison");
      const records: PayrollTrialRecord[] = [], evidence: PayrollTrialResult["evidence"] = [];
      for (const bookId of bookIds) {
        if (Date.now() > deadline) throw new ConflictException("Complete payroll trial exceeded its time budget");
        const selected = dto.books.find(book => book.bookId === bookId)!;
        const sourceRecords = census.filter(row => row.bookId === bookId);
        const employeeIds = sourceRecords.map(row => row.employeeId!);
        if (new Set(employeeIds).size !== employeeIds.length) throw new ConflictException("Duplicate employee payroll records within a book require source resolution");
        const sources: Array<{ id: string; sourceHash: string; bindingHash: string; snapshots: string; items: string }> = await manager.query(`SELECT id,source_sha256 AS "sourceHash",binding_sha256 AS "bindingHash",(frozen_input->'snapshots')::text AS snapshots,(frozen_input->'items')::text AS items
          FROM hr_payroll_reconciliation_source WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND legacy_batch_id=$4 AND book_id=$5 AND period_month=$6::date AND octet_length(frozen_input::text)<=$7 FOR SHARE`, [selected.reconciliationSourceId, scope.tenantId, scope.parkId, dto.legacyBatchId, bookId, `${dto.month}-01`, MAX_BYTES]);
        if (sources.length !== 1) throw new ConflictException("Choose a frozen source matching this book and month");
        const source = sources[0]!;
        await lockCurrentPayrollSource(manager, scope, source.id);
        const prepared = await this.inputs.lockConfirmedInput(manager, scope, actor, selected.inputId, selected.expectedInputVersion);
        const linked = await manager.query("SELECT source_book_id FROM hr_payroll_rule_set WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR SHARE", [prepared.rule.rule_set_id, scope.tenantId, scope.parkId]);
        if (prepared.period.month !== dto.month || prepared.period.correctionWindow || linked[0]?.source_book_id !== bookId) throw new ConflictException("Confirmed inputs must use this month's linked modern book rule");
        if (JSON.stringify([...employeeIds].sort()) !== JSON.stringify(prepared.input.employees.map(row => row.employeeId).sort())) throw new ConflictException("Confirmed input roster must cover every source record in this book exactly once");
        const ids = selected.mappings.map(row => row.sourceItemVersionId);
        const known = ids.length ? await manager.query(`SELECT v.id FROM hr_payroll_item_version v JOIN hr_payroll_item_definition d ON (d.id,d.tenant_id,d.park_id)=(v.item_definition_id,v.tenant_id,v.park_id)
          WHERE d.book_id=$1 AND v.tenant_id=$2 AND v.park_id=$3 AND v.id=ANY($4::uuid[]) AND NOT d.is_deleted AND NOT v.is_deleted`, [bookId, scope.tenantId, scope.parkId, ids]) : [];
        if (known.length !== ids.length) throw new BadRequestException("Mappings must select unique item versions belonging to this book");
        if (prepared.rule.definition_evidence.items.some(item => item.dependencies.some(dependency => dependency.startsWith("hr:") && HR_PAYROLL_INSURANCE_REFERENCE_CODES.has(dependency.slice(3))))) this.authority(scope, actor, true);
        const calculated = await this.runs.calculatePrepared(manager, scope, prepared, selected);
        const nets: Array<{ id: string; value: string | null }> = await manager.query(`SELECT x.id,x.net_amount::text AS value FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,net_amount numeric(20,4)) ORDER BY x.id`, [source.snapshots]);
        const oldItems: TrialSourceItem[] = await manager.query(`SELECT x.id,x.snapshot_id AS "snapshotId",x.item_version_id AS "itemVersionId",COALESCE(v.display_name,x.legacy_column_name) AS name,x.value_type AS "valueType",x.is_source_null AS "isSourceNull",CASE WHEN x.value_type='decimal' THEN x.decimal_value::text WHEN x.value_type='text' THEN x.text_value WHEN x.value_type='date' THEN to_char(x.date_value,'YYYY-MM-DD') WHEN x.value_type='unmapped' THEN x.raw_value ELSE NULL END AS value,(d.id IS NOT NULL AND v.id IS NOT NULL) AS known
          FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,snapshot_id uuid,item_version_id uuid,legacy_column_name text,raw_value text,value_type text,is_source_null boolean,decimal_value numeric(20,4),text_value text,date_value date)
          LEFT JOIN hr_payroll_item_version v ON v.id=x.item_version_id AND v.tenant_id=$2 AND v.park_id=$3 AND NOT v.is_deleted
          LEFT JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=$2 AND d.park_id=$3 AND d.book_id=$4 AND NOT d.is_deleted ORDER BY x.snapshot_id,x.id`, [source.items, scope.tenantId, scope.parkId, bookId]);
        const byEmployee = new Map(calculated.map(row => [row.employeeId, row.calculation]));
        const netById = new Map(nets.map(row => [row.id, row.value]));
        const itemsByRecord = new Map<string, TrialSourceItem[]>();
        for (const item of oldItems) { const group = itemsByRecord.get(item.snapshotId) ?? []; group.push(item); itemsByRecord.set(item.snapshotId, group); }
        for (const row of sourceRecords) {
          const calculation = byEmployee.get(row.employeeId!)!;
          if (!calculation || !netById.has(row.id)) throw new ConflictException("Incomplete frozen payroll record coverage");
          const sourceValue = netById.get(row.id)!;
          const difference = sourceValue === null ? null : payrollTrialDifference(calculation.netAmount, sourceValue);
          records.push({ bookId, bookName: row.bookName, sourceRecordId: row.id, employeeId: row.employeeId!, employeeCode: row.employeeCode!, fullName: row.fullName!,
            totals: { grossAmount: calculation.grossAmount, deductionAmount: calculation.deductionAmount, personalTax: calculation.personalTax, netAmount: calculation.netAmount },
            net: { modernValue: calculation.netAmount, sourceValue, difference, status: difference === null ? "missing_source" : difference === "0.0000" ? "equal" : "different" },
            lines: comparePayrollTrialItems(calculation, selected.mappings, itemsByRecord.get(row.id) ?? []) });
        }
        evidence.push({ bookId, sourceId: source.id, sourceHash: source.sourceHash, bindingHash: source.bindingHash, inputId: prepared.input.id, inputVersion: prepared.input.version,
          inputHash: prepared.input.snapshotSha256, ruleVersionId: prepared.rule.id, ruleHash: prepared.rule.definition_sha256, calculationHash: hash(calculated),
          calculationVersion: calculated[0]!.calculation.calculationVersion, formulaEngineVersion: calculated[0]!.calculation.formulaEngineVersion });
      }
      const lines = records.flatMap(row => row.lines);
      const selectionHash = hash({ ...dto, books: [...dto.books].sort((a, b) => a.bookId.localeCompare(b.bookId)) });
      const result: PayrollTrialResult = { kind: "calculate_only", month: dto.month, legacyBatchId: dto.legacyBatchId, complete: true, calculatedAt: new Date().toISOString(), recordCount: records.length, employeeCount: new Set(records.map(row => row.employeeId)).size,
        bookCount: bookIds.length, lineCount: lines.length, comparableLineCount: lines.filter(row => row.difference !== null).length, differentLineCount: lines.filter(row => row.status === "different").length,
        selectionHash, resultHash: hash({ selectionHash, evidence, records }), evidence, records };
      if (Date.now() > deadline || lines.length > MAX_RESULT_LINES || Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) throw new ConflictException("Complete payroll trial exceeds time or response limits; no partial result is returned");
      await this.recordAudit(manager, scope, actor, "全账套只算不发核对", { month: dto.month, bookCount: result.bookCount, recordCount: result.recordCount, employeeCount: result.employeeCount, selectionHash, resultHash: result.resultHash });
      if (Date.now() > deadline) throw new ConflictException("Complete payroll trial exceeded its time budget; audit and result are rolled back");
      return result;
    }); } catch (error) {
      const code = (error as { driverError?: { code?: string }; code?: string })?.driverError?.code ?? (error as { code?: string })?.code;
      if (["55P03", "40001", "40P01", "57014", "P0001"].includes(code ?? "")) throw new ConflictException("Payroll source changed or exceeded its lock budget; refresh the complete selection");
      throw error;
    }
  }
}
