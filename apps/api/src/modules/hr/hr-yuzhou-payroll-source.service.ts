import { findT4PayrollBaseline } from "./hr-yuzhou-payroll-source-baseline";
import { projectPayrollSource } from "./hr-yuzhou-payroll-source-projector";
import { PAYROLL_SOURCE_TABLES } from "./hr-payroll-frozen-source";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { canonicalJson, canonicalYuzhouPayrollSourcePackage, validateYuzhouPayrollSourcePackage, validateYuzhouPayrollSourceHashes, type TenantParkScope, type YuzhouPayrollSourcePackage } from "@jinhu/shared";
import { createHash } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { AuditService } from "../audit/audit.service";
const hash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
type Op = {
    id: string;
    status: string;
    payload_encrypted: string;
    package_sha256: string;
    expected_head_version: number;
    expected_head_hash: string | null;
    source_instance: string;
    period_month: string;
    record_count: number;
    value_count: number;
    book_count: number;
    generation: number | null;
    head_hash: string | null;
};
@Injectable()
export class HrYuzhouPayrollSourceService {
    constructor(private readonly db: DataSource, private readonly sensitive: PartySensitiveDataService, private readonly audit: AuditService) { }
    private authority(scope: TenantParkScope, actor: JwtPrincipal) {
        const required = ["hr:payroll:manage", "hr:payroll_reconciliation:review", "hr:payroll_detail:read"];
        if (actor.tenantId !== scope.tenantId || actor.parkId !== scope.parkId || (!actor.isSuper && !actor.permissions.includes("*") && !required.every(p => actor.permissions.includes(p))))
            throw new ForbiddenException("Payroll source import permission and current scope required");
    }
    private package(value: Record<string, unknown>) {
        try {
            const pkg = value as unknown as YuzhouPayrollSourcePackage;
            validateYuzhouPayrollSourcePackage(pkg);
            validateYuzhouPayrollSourceHashes(pkg, value => createHash("sha256").update(value).digest("hex"));
            return canonicalYuzhouPayrollSourcePackage(pkg);
        }
        catch {
            throw new BadRequestException("YUZHOU_PAYROLL_SOURCE_PACKAGE_INVALID");
        }
    }
    private targetScope(scope: TenantParkScope, pkg: YuzhouPayrollSourcePackage) {
        if (pkg.targetScope.tenantId !== scope.tenantId || pkg.targetScope.parkId !== scope.parkId)
            throw new ForbiddenException("YUZHOU_PAYROLL_SOURCE_TARGET_SCOPE_MISMATCH");
    }
    private async readHead(m: EntityManager | DataSource, scope: TenantParkScope, sourceInstance: string, month: string) {
        const [row] = await m.query(`SELECT version,head_hash,operation_id,source_instance FROM hr_yuzhou_payroll_source_head
            WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND period_month=$3::date`,
            [scope.tenantId, scope.parkId, `${month}-01`]);
        if (row && row.source_instance !== sourceInstance) throw new ConflictException("SOURCE_INSTANCE_MISMATCH");
        return { sourceInstance, month, version: row ? Number(row.version) : 0,
            headHash: row?.head_hash ?? null, operationId: row?.operation_id ?? null };
    }
    async head(scope: TenantParkScope, actor: JwtPrincipal, query: { sourceInstance: string; month: string }) {
        this.authority(scope, actor);
        if (typeof query.sourceInstance !== "string" || !query.sourceInstance.trim() || query.sourceInstance.length > 128
            || !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u.test(query.month))
            throw new BadRequestException("YUZHOU_PAYROLL_SOURCE_HEAD_QUERY_INVALID");
        return this.db.transaction(async m => {
            const result = await this.readHead(m, scope, query.sourceInstance, query.month);
            await this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, roleCodes: actor.roles,
                module: "人力资源管理", resource: "hr.yuzhou_payroll_source", action: "查询工资月来源当前版本",
                bizType: "hr_yuzhou_payroll_source", bizId: null, beforeJson: null,
                afterJson: { month: query.month, version: result.version }, method: "GET", path: "/hr/imports/yuzhou/payroll/head",
                success: true, result: "success", requestId: null }, m);
            return result;
        });
    }
    async preview(scope: TenantParkScope, actor: JwtPrincipal, value: Record<string, unknown>) {
        this.authority(scope, actor);
        const pkg = this.package(value), packageHash = hash(pkg), counts = { recordCount: pkg.books.reduce((n, b) => n + b.records.length, 0), valueCount: pkg.books.reduce((n, b) => n + b.records.reduce((m, r) => m + r.values.length, 0), 0), bookCount: pkg.books.length };
        this.targetScope(scope, pkg);
        return this.db.transaction(async (m) => {
            await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([scope.tenantId, scope.parkId, pkg.month])]);
            await this.verifyExtraction(m, scope, pkg);
            const existing = await m.query("SELECT id FROM hr_yuzhou_payroll_source_operation WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND package_sha256=$3", [scope.tenantId, scope.parkId, packageHash]);
            if (existing[0])
                return this.status(scope, actor, existing[0].id, m);
            const current = await this.readHead(m, scope, pkg.sourceInstance, pkg.month);
            if (current.version !== pkg.expectedHeadVersion || current.headHash !== pkg.expectedHeadHash)
                throw new ConflictException("Payroll source head changed; rebuild from the current complete month");
            if (current.operationId) {
                const previous = await this.predecessor(m, scope, current.operationId, pkg);
                const content = (p: YuzhouPayrollSourcePackage) => hash({ targetScope: p.targetScope,
                    sourceSystem: p.sourceSystem, sourceInstance: p.sourceInstance, month: p.month, books: p.books });
                if (content(previous) === content(pkg)) {
                    await this.verifyMappings(m, scope, pkg);
                    await this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, roleCodes: actor.roles,
                        module: "人力资源管理", resource: "hr.yuzhou_payroll_source", action: "复用未变化的工资月来源",
                        bizType: "hr_yuzhou_payroll_source", bizId: current.operationId, beforeJson: null,
                        afterJson: { submittedPackageSha256: packageHash, generation: current.version, ...counts },
                        method: "POST", path: "/hr/imports/yuzhou/payroll/preview", success: true, result: "success", requestId: null }, m);
                    return { ...await this.status(scope, actor, current.operationId, m), outcome: "unchanged" as const,
                        submittedPackageSha256: packageHash };
                }
            }
            await this.verifyMappings(m, scope, pkg);
            const [row] = await m.query(`INSERT INTO hr_yuzhou_payroll_source_operation(tenant_id,park_id,source_system,source_instance,period_month,manifest_id,package_sha256,payload_encrypted,status,expected_head_version,expected_head_hash,record_count,value_count,book_count,roster_sha256,catalog_sha256,book_set_sha256,created_by) VALUES($1,$2,'yuzhou-v10',$3,$4::date,$5,$6,$7,'previewed',$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`, [scope.tenantId, scope.parkId, pkg.sourceInstance, `${pkg.month}-01`, pkg.manifestId, packageHash, this.sensitive.encrypt(JSON.stringify(pkg)), pkg.expectedHeadVersion, pkg.expectedHeadHash, counts.recordCount, counts.valueCount, counts.bookCount, pkg.rosterSha256, pkg.catalogSha256, pkg.bookSetSha256, actor.sub]);
            return { id: row.id, status: "previewed", packageSha256: packageHash, ...counts };
        });
    }
    async commit(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
        this.authority(scope, actor);
        return this.db.transaction("READ COMMITTED", async (m) => {
            const op = await this.operation(m, scope, id, true);
            if (op.status !== 'previewed' && op.status !== 'committed')
                throw new ConflictException("Payroll source operation is not committable");
            const raw = this.sensitive.decrypt(op.payload_encrypted);
            if (!raw)
                throw new ConflictException("Payroll source staging payload cannot be read");
            const pkg = this.package(JSON.parse(raw));
            this.targetScope(scope, pkg);
            if (hash(pkg) !== op.package_sha256)
                throw new ConflictException("Payroll source package drift detected");
            await this.verifyExtraction(m, scope, pkg);
            if (op.status === 'committed') return this.status(scope, actor, id, m);
            // Original T4 validation takes SHARE locks. Serialize import writers
            // before head locks, so two baselines cannot deadlock upgrading their
            // own ROW EXCLUSIVE locks while freeze readers retain SHARE locks.
            await m.query(`LOCK TABLE ${PAYROLL_SOURCE_TABLES} IN SHARE ROW EXCLUSIVE MODE`);
            await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([scope.tenantId, scope.parkId, pkg.month])]);
            await this.readHead(m, scope, pkg.sourceInstance, pkg.month);
            await m.query("INSERT INTO hr_yuzhou_payroll_source_head(tenant_id,park_id,source_system,source_instance,period_month) VALUES($1,$2,'yuzhou-v10',$3,$4::date) ON CONFLICT DO NOTHING", [scope.tenantId, scope.parkId, pkg.sourceInstance, `${pkg.month}-01`]);
            const [head] = await m.query("SELECT version,head_hash,operation_id FROM hr_yuzhou_payroll_source_head WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND source_instance=$3 AND period_month=$4::date FOR UPDATE", [scope.tenantId, scope.parkId, pkg.sourceInstance, `${pkg.month}-01`]);
            if (Number(head.version) !== pkg.expectedHeadVersion || head.head_hash !== pkg.expectedHeadHash)
                throw new ConflictException("Payroll source head changed; rebuild from the current complete month");
            if (Number(head.version) > 0) {
                await this.predecessor(m, scope, head.operation_id, pkg);
            }
            await this.verifyMappings(m, scope, pkg);
            const generation = Number(head.version) + 1, headHash = hash({ previous: head.head_hash, generation, package: op.package_sha256, roster: pkg.rosterSha256, catalog: pkg.catalogSha256, books: pkg.bookSetSha256 });
            const baselineBatchId = Number(head.version) === 0 ? await findT4PayrollBaseline(m, scope, pkg) : null;
            const batchId = baselineBatchId ?? await projectPayrollSource(m, scope, actor.sub, pkg, id);
            await m.query("INSERT INTO hr_yuzhou_payroll_source_generation(tenant_id,park_id,operation_id,source_instance,period_month,generation,roster_sha256,catalog_sha256,book_set_sha256,record_count,value_count,book_count,legacy_batch_id) VALUES($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id", [scope.tenantId, scope.parkId, id, pkg.sourceInstance, `${pkg.month}-01`, generation, pkg.rosterSha256, pkg.catalogSha256, pkg.bookSetSha256, op.record_count, op.value_count, op.book_count, batchId]);
            await m.query("UPDATE hr_yuzhou_payroll_source_head SET version=$6,operation_id=$5,head_hash=$7,updated_at=now() WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND source_instance=$3 AND period_month=$4::date", [scope.tenantId, scope.parkId, pkg.sourceInstance, `${pkg.month}-01`, id, generation, headHash]);
            await m.query("UPDATE hr_yuzhou_payroll_source_operation SET status='committed',generation=$4,head_hash=$5,database_name=current_database(),database_oid=(SELECT oid FROM pg_database WHERE datname=current_database()),committed_by=$6,committed_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3", [id, scope.tenantId, scope.parkId, generation, headHash, actor.sub]);
            await this.audit.recordOperationRequired({ ...scope, userId: actor.sub, username: actor.username, roleCodes: actor.roles, module: "人力资源管理", resource: "hr.yuzhou_payroll_source", action: "提交玉舟完整工资月来源", bizType: "hr_yuzhou_payroll_source", bizId: id, beforeJson: null, afterJson: { generation, recordCount: op.record_count, valueCount: op.value_count, bookCount: op.book_count }, method: "POST", path: "/hr/imports/yuzhou/payroll/:id/commit", success: true, result: "success", requestId: null }, m);
            return this.status(scope, actor, id, m);
        });
    }
    private async verifyExtraction(m: EntityManager | DataSource, scope: TenantParkScope, pkg: YuzhouPayrollSourcePackage) {
        const records = pkg.books.reduce((count, book) => count + book.records.length, 0);
        const values = pkg.books.reduce((count, book) => count + book.records.reduce((n, row) => n + row.values.length, 0), 0);
        const rows = await m.query(`SELECT id FROM hr_yuzhou_payroll_source_extraction
            WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND source_instance=$3
              AND period_month=$4::date AND evidence_sha256=$5 AND books_sha256=$6
              AND book_set_sha256=$7 AND roster_sha256=$8 AND catalog_sha256=$9
              AND record_count=$10 AND value_count=$11 AND book_count=$12 LIMIT 1`,
            [scope.tenantId, scope.parkId, pkg.sourceInstance, `${pkg.month}-01`, pkg.evidenceSha256,
                hash(pkg.books), pkg.bookSetSha256, pkg.rosterSha256, pkg.catalogSha256, records, values, pkg.books.length]);
        if (rows.length !== 1) throw new ConflictException("PAYROLL_SOURCE_VERIFIED_EXTRACTION_REQUIRED");
    }
    private async predecessor(m: EntityManager | DataSource, scope: TenantParkScope, id: string, pkg: YuzhouPayrollSourcePackage) {
        const op = await this.operation(m, scope, id, false);
        const raw = this.sensitive.decrypt(op.payload_encrypted);
        if (!raw) throw new ConflictException("Payroll source current payload cannot be read");
        const previous = this.package(JSON.parse(raw));
        this.targetScope(scope, previous);
        if (op.status !== "committed" || hash(previous) !== op.package_sha256
            || previous.sourceInstance !== pkg.sourceInstance || previous.month !== pkg.month)
            throw new ConflictException("Payroll source current package drift detected");
        const nextKeys = new Set(pkg.books.flatMap(book => book.records.map(record => JSON.stringify([book.scheme, record.sourcePersonIdentity]))));
        const nextBooks = new Set(pkg.books.map(book => book.scheme));
        if (previous.books.some(book => !nextBooks.has(book.scheme) || book.records.some(record => !nextKeys.has(JSON.stringify([book.scheme, record.sourcePersonIdentity])))))
            throw new ConflictException("SOURCE_ROSTER_REMOVAL_REQUIRES_PROOF");
        return previous;
    }
    private async verifyMappings(m: EntityManager, scope: TenantParkScope, pkg: YuzhouPayrollSourcePackage) {
        const records = pkg.books.flatMap(b => b.records), ids = [...new Set(records.map(r => r.employeeMappingId))], mapped: Array<{
            id: string;
            employee_code: string;
        }> = ids.length ? await m.query("SELECT id,employee_code FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND NOT is_deleted FOR SHARE", [scope.tenantId, scope.parkId, ids]) : [], codes = new Map(mapped.map(row => [row.id, row.employee_code]));
        if (mapped.length !== ids.length || pkg.books.some(book => new Set(book.records.map(r => r.employeeMappingId)).size !== book.records.length) || records.some(r => codes.get(r.employeeMappingId) !== r.sourcePersonIdentity))
            throw new ConflictException("Payroll source mapping must prove exact current-scope source person to employee code ownership");
    }
    async status(scope: TenantParkScope, actor: JwtPrincipal, id: string, m: EntityManager | DataSource = this.db) {
        this.authority(scope, actor);
        const op = await this.operation(m, scope, id, false);
        const [reference] = await m.query(`SELECT generation.legacy_batch_id,batch.source_kind
            FROM hr_yuzhou_payroll_source_generation generation JOIN hr_payroll_legacy_batch batch
            ON (batch.id,batch.tenant_id,batch.park_id)=(generation.legacy_batch_id,generation.tenant_id,generation.park_id)
            WHERE generation.tenant_id=$1 AND generation.park_id=$2 AND generation.operation_id=$3`, [scope.tenantId, scope.parkId, id]);
        return { legacyBatchId: reference?.legacy_batch_id ?? null, sourceReferenceKind: reference?.source_kind ?? null, id: op.id, status: op.status, packageSha256: op.package_sha256, sourceInstance: op.source_instance, month: op.period_month, expectedHeadVersion: op.expected_head_version, expectedHeadHash: op.expected_head_hash, generation: op.generation, headHash: op.head_hash, currentHead: await this.readHead(m, scope, op.source_instance, op.period_month) };
    }
    private async operation(m: EntityManager | DataSource, scope: TenantParkScope, id: string, lock: boolean): Promise<Op> {
        const rows = await m.query(`SELECT id,status,payload_encrypted,package_sha256,expected_head_version,expected_head_hash,source_instance,to_char(period_month,'YYYY-MM') period_month,record_count,value_count,book_count,generation,head_hash FROM hr_yuzhou_payroll_source_operation WHERE id=$1 AND tenant_id=$2 AND park_id=$3 ${lock ? "FOR UPDATE" : ""}`, [id, scope.tenantId, scope.parkId]);
        if (rows.length !== 1)
            throw new NotFoundException("Payroll source operation not found");
        return rows[0] as Op;
    }
}
