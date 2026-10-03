import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { createHash } from "node:crypto";
import { isEmail, isUUID } from "class-validator";
import { canonicalYuzhouIncrementalPackage, HR_EMPLOYEE_STATUSES, HR_EMPLOYMENT_TYPES, HR_PERMISSIONS, YUZHOU_INCREMENTAL_CONTRACT_STATUSES, YUZHOU_INCREMENTAL_FIELDS, type YuzhouIncrementalItem } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

type ItemRow = { id: string; target_table: string | null; target_id: string | null; last_row_sha256: string; field_baseline: Record<string, unknown>; target_baseline: Record<string, unknown>; source_facts_encrypted: string; version: number; target_version: number };
type OperationRow = { id: string; status: string; package_sha256: string; source_system: string };
const json = (value: unknown) => JSON.stringify(value);
const canonicalJson = (value: unknown): string => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonicalJson).join(",")}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
const rowDigest = (item: YuzhouIncrementalItem) => createHash("sha256").update(canonicalJson({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: item.sourceUpdatedAt ?? null, fields: item.fields })).digest("hex");

@Injectable()
export class HrYuzhouIncrementalImportService {
  constructor(private readonly db: DataSource, private readonly sensitive: PartySensitiveDataService) {}

  async preview(scope: TenantParkScope, actor: JwtPrincipal, dto: PreviewYuzhouIncrementalImportDto) {
    this.validate(dto.items);
    const pkg = canonicalYuzhouIncrementalPackage(dto), packageHash = this.packageHash(pkg);
    return this.db.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [json([scope.tenantId, scope.parkId, dto.sourceSystem, packageHash])]);
      const existing = await manager.query(`SELECT id,status,package_sha256 FROM hr_incremental_import_operation WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND package_sha256=$4 FOR UPDATE`, [scope.tenantId, scope.parkId, dto.sourceSystem, packageHash]) as OperationRow[];
      this.requirePackagePermissions(actor, dto.items, "manage");
      if (existing[0]) return this.status(scope, actor, existing[0].id, manager);
      const plan = [];
      for (const item of pkg.items) plan.push(await this.previewItem(manager, scope, dto.sourceSystem, item));
      const rows = await manager.query(`INSERT INTO hr_incremental_import_operation(tenant_id,park_id,source_system,manifest_id,package_sha256,package_encrypted,status,item_count,created_by) VALUES($1,$2,$3,$4,$5,$6,'previewed',$7,$8) RETURNING id`, [scope.tenantId, scope.parkId, dto.sourceSystem, dto.manifestId, packageHash, this.sensitive.encrypt(json(pkg)), dto.items.length, actor.sub]) as Array<{ id: string }>;
      return { id: rows[0]!.id, status: "previewed", packageSha256: packageHash, itemCount: dto.items.length, supportedDomains: Object.keys(YUZHOU_INCREMENTAL_FIELDS), plan };
    });
  }

  async commit(scope: TenantParkScope, actor: JwtPrincipal, operationId: string) {
    const operation = (await this.db.query(`SELECT package_encrypted FROM hr_incremental_import_operation WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [operationId, scope.tenantId, scope.parkId]))[0] as { package_encrypted?: string } | undefined;
    if (!operation?.package_encrypted) throw new NotFoundException("Incremental import operation not found");
    const raw = this.sensitive.decrypt(operation.package_encrypted);
    if (!raw) throw new ConflictException("Incremental import staging payload cannot be read");
    return this.commitPackage(scope, actor, operationId, JSON.parse(raw) as PreviewYuzhouIncrementalImportDto);
  }

  private async commitPackage(scope: TenantParkScope, actor: JwtPrincipal, operationId: string, dto: PreviewYuzhouIncrementalImportDto) {
    this.validate(dto.items); const packageHash = this.packageHash(canonicalYuzhouIncrementalPackage(dto));
    try { return await this.db.transaction(async manager => {
      const operation = (await manager.query(`SELECT id,status,package_sha256,source_system FROM hr_incremental_import_operation WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE`, [operationId, scope.tenantId, scope.parkId]))[0] as OperationRow | undefined;
      if (!operation) throw new NotFoundException("Incremental import operation not found");
      if (operation.package_sha256 !== packageHash) throw new ConflictException("Incremental import package drift detected");
      this.requirePackagePermissions(actor, dto.items, "manage");
      if (operation.status === "committed" || operation.status === "conflicted") return this.status(scope, actor, operationId, manager);
      let applied = 0, unchanged = 0, conflicts = 0;
      for (const item of canonicalYuzhouIncrementalPackage(dto).items) {
        const outcome = await this.applyItem(manager, scope, actor, operation, item);
        if (outcome === "applied") applied++; else if (outcome === "unchanged") unchanged++; else conflicts++;
      }
      const status = conflicts ? "conflicted" : "committed";
      await manager.query(`UPDATE hr_incremental_import_operation SET status=$4,applied_count=$5,unchanged_count=$6,conflict_count=$7,committed_by=$8,committed_at=now(),cursor_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [operationId, scope.tenantId, scope.parkId, status, applied, unchanged, conflicts, actor.sub]);
      return this.status(scope, actor, operationId, manager);
    }); } catch (error) { if ((error as { code?: string }).code === "23505") throw new ConflictException("Incremental import target or source mapping already exists"); throw error; }
  }

  async status(scope: TenantParkScope, actor: JwtPrincipal, id: string, manager: EntityManager | DataSource = this.db) {
    const rows = await manager.query(`SELECT id,status,package_encrypted,package_sha256 AS "packageSha256",item_count AS "itemCount",applied_count AS "appliedCount",unchanged_count AS "unchangedCount",conflict_count AS "conflictCount",create_time AS "createdAt",committed_at AS "committedAt" FROM hr_incremental_import_operation WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [id, scope.tenantId, scope.parkId]);
    if (!rows[0]) throw new NotFoundException("Incremental import operation not found");
    const raw = this.sensitive.decrypt(String(rows[0].package_encrypted));
    if (!raw) throw new ConflictException("Incremental import staging payload cannot be read");
    this.requirePackagePermissions(actor, (JSON.parse(raw) as PreviewYuzhouIncrementalImportDto).items, "read");
    const revisions = await manager.query(`SELECT outcome,count(*)::int AS count FROM hr_incremental_import_revision WHERE operation_id=$1 GROUP BY outcome`, [id]);
    const result = { ...(rows[0] as Record<string, unknown>) };
    delete result.package_encrypted;
    return { ...result, revisions };
  }

  private async previewItem(manager: EntityManager, scope: TenantParkScope, sourceSystem: string, item: YuzhouIncrementalItem) {
    const source = [scope.tenantId, scope.parkId, sourceSystem, item.sourceTable, item.sourceKey];
    const prior = (await manager.query(`SELECT target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND source_table=$4 AND source_key=$5 AND domain=$6`, [...source, item.domain]))[0] as Pick<ItemRow, "target_id" | "last_row_sha256" | "field_baseline" | "target_baseline" | "source_facts_encrypted"> | undefined;
    let fields = this.normalizedFields(item);
    const base = () => ({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, fields: Object.keys(fields).sort() });
    if (prior && Object.keys(prior.field_baseline).length === 0 && Object.keys(prior.target_baseline).length === 0) return { ...base(), action: "conflict", conflictFields: ["INITIAL_FIELD_BASELINE_UNKNOWN"] };
    if (prior?.last_row_sha256 === item.rowDigest) return { ...base(), action: "unchanged", conflictFields: [] };
    if (!prior) {
      const mapped = await this.initialMap(manager, scope, sourceSystem, item);
      if (mapped) return { ...base(), action: "conflict", conflictFields: ["INITIAL_FIELD_BASELINE_UNKNOWN"] };
      return { ...base(), action: "create", conflictFields: [] };
    }
    const current = await this.readTarget(manager, scope, item.domain, prior.target_id!);
    if ("idNumberEncrypted" in fields && current.idNumberFingerprint === prior.target_baseline.idNumberFingerprint && fields.idNumberFingerprint === current.idNumberFingerprint) {
      delete fields.idNumberEncrypted; delete fields.idNumberMasked; delete fields.idNumberFingerprint;
    }
    const priorSource = JSON.parse(this.sensitive.decrypt(prior.source_facts_encrypted) || "{}") as Record<string, unknown>;
    const changedFields = Object.keys(fields).filter(field => json(fields[field]) !== json(this.normalizedFields({ ...item, fields: priorSource })[field]));
    const relationshipConflicts = this.relationshipConflicts(item, priorSource);
    // An unchanged source status must not undo or block a modern lifecycle change.
    // Actual source status revisions require the normal employment event workflow.
    const employmentConflict = item.domain === "employee" && changedFields.includes("employmentStatus");
    const stateConflict = item.domain === "contract" && (item.fields.contractStatus !== current.targetStatus || (current.targetStatus !== "draft" && changedFields.length > 0));
    const conflictFields = [...relationshipConflicts, ...(employmentConflict ? ["NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED"] : []), ...(stateConflict ? ["NORMAL_CONTRACT_WORKFLOW_REQUIRED"] : []), ...changedFields.filter(field => json(current[field]) !== json(prior.target_baseline[field]))];
    return { ...base(), action: conflictFields.length ? "conflict" : changedFields.length ? "update" : "unchanged", conflictFields };
  }

  private validate(items: YuzhouIncrementalItem[]) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.domain}:${item.sourceTable}:${item.sourceKey}`;
      if (seen.has(key)) throw new BadRequestException(`Duplicate source item: ${key}`); seen.add(key);
      if (!/^sha256:[a-f0-9]{64}$/u.test(item.sourceKey)) throw new BadRequestException("sourceKey must be canonical sha256:<sourceIdentity>");
      if (!/^[a-f0-9]{64}$/u.test(item.rowDigest) || item.rowDigest !== rowDigest(item)) throw new BadRequestException("rowDigest does not match the normalized source payload");
      const allowed = new Set(YUZHOU_INCREMENTAL_FIELDS[item.domain]);
      for (const field of Object.keys(item.fields)) if (!allowed.has(field)) throw new BadRequestException(`Unsupported ${item.domain} field: ${field}`);
      this.validateFieldValues(item);

    }
  }

  private validateFieldValues(item: YuzhouIncrementalItem) {
    const dates = new Set(["hireDate","dateOfBirth","startDate","endDate","probationEndDate"]);
    const limits: Record<string, number> = { employeeCode:64, fullName:100, employmentType:32, employmentStatus:32, workLocation:128, workMobile:32, workEmail:128, englishName:100, gender:32, personalMobile:32, personalEmail:128, address:500, idNumber:64, contractNo:64, contractStatus:16, workType:100, positionTitle:100 };
    for (const [field,value] of Object.entries(item.fields)) {
      if (value === null) {
        if (["employeeCode", "fullName", "employmentType", "employmentStatus", "contractNo", "startDate", "contractStatus", "contractTypeId", "employeeSourceKey", "employeeSourceTable"].includes(field)) throw new BadRequestException(`${field} cannot be null`);
        continue;
      }
      if (typeof value !== "string") throw new BadRequestException(`${field} must be a string or null`);
      if (limits[field] !== undefined && value.length > limits[field]) throw new BadRequestException(`${field} exceeds its maximum length`);
      if (dates.has(field) && (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)) throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
      if (["employeeCode", "fullName", "contractNo"].includes(field) && !value.trim()) throw new BadRequestException(`${field} cannot be empty`);
      if (["workEmail", "personalEmail"].includes(field) && !isEmail(value)) throw new BadRequestException(`${field} must be an email`);
      if (field === "contractTypeId" && !isUUID(value)) throw new BadRequestException("contractTypeId must be a UUID");
    }
    if (item.domain === "employee" && item.fields.employmentType !== undefined && !HR_EMPLOYMENT_TYPES.includes(item.fields.employmentType as typeof HR_EMPLOYMENT_TYPES[number])) throw new BadRequestException("employmentType must be an approved source-state mapping");
    if (item.domain === "employee" && item.fields.employmentStatus !== undefined && item.fields.employmentStatus !== null && !HR_EMPLOYEE_STATUSES.includes(item.fields.employmentStatus as typeof HR_EMPLOYEE_STATUSES[number])) throw new BadRequestException("employmentStatus must be an approved source-state mapping");
    if (item.domain === "contract" && item.fields.contractStatus !== undefined && item.fields.contractStatus !== null && !YUZHOU_INCREMENTAL_CONTRACT_STATUSES.includes(item.fields.contractStatus as typeof YUZHOU_INCREMENTAL_CONTRACT_STATUSES[number])) throw new BadRequestException("contractStatus must be an approved source-state mapping");
  }

  private async applyItem(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, operation: OperationRow, item: YuzhouIncrementalItem): Promise<"applied" | "unchanged" | "conflict"> {
    this.requireDomainPermission(actor, item.domain);
    const source = [scope.tenantId, scope.parkId, operation.source_system, item.sourceTable, item.sourceKey];
    const prior = (await manager.query(`SELECT id,target_table,target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted,version,target_version FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND source_table=$4 AND source_key=$5 AND domain=$6 FOR UPDATE`, [...source, item.domain]))[0] as ItemRow | undefined;
    if (prior && Object.keys(prior.field_baseline).length === 0 && Object.keys(prior.target_baseline).length === 0) return this.revision(manager, operation.id, prior.id, prior.version, "conflict", item.rowDigest, [{ code: "INITIAL_FIELD_BASELINE_UNKNOWN", sourceKey: item.sourceKey }], {}, {});
    if (prior && prior.last_row_sha256 === item.rowDigest) return this.revision(manager, operation.id, prior.id, prior.version, "unchanged", item.rowDigest, [], {}, {});
    if (!prior) {
      const baseline = await this.initialMap(manager, scope, operation.source_system, item);
      if (baseline) return this.bootstrapUnknownBaseline(manager, operation, item, source, baseline);
    }
    const target = prior ? { table: prior.target_table!, id: prior.target_id! } : await this.createTarget(manager, scope, actor, operation.source_system, item);
    const current = prior ? await this.readTarget(manager, scope, item.domain, target.id) : {};
    if (prior && item.domain === "contract" && item.fields.contractStatus !== current.targetStatus) return this.revision(manager, operation.id, prior.id, prior.version, "conflict", item.rowDigest, [{ field: "contractStatus", code: "NORMAL_CONTRACT_WORKFLOW_REQUIRED" }], prior.target_baseline, current);
    const fields = this.normalizedFields(item);
    // AES-GCM ciphertext is intentionally non-deterministic. Compare identity through
    // the protected fingerprint and do not write an identical sensitive value again.
    if (prior && "idNumberEncrypted" in fields && current.idNumberFingerprint === prior.target_baseline.idNumberFingerprint && fields.idNumberFingerprint === current.idNumberFingerprint) {
      delete fields.idNumberEncrypted; delete fields.idNumberMasked; delete fields.idNumberFingerprint;
    }
    const priorSource = prior ? JSON.parse(this.sensitive.decrypt(prior.source_facts_encrypted) || "{}") as Record<string, unknown> : {};
    const changedFields = prior ? Object.keys(fields).filter(field => json(fields[field]) !== json(this.normalizedFields({ ...item, fields: priorSource })[field])) : Object.keys(fields);
    const conflicts = prior ? [...this.relationshipConflicts(item, priorSource), ...(item.domain === "employee" && changedFields.includes("employmentStatus") ? ["NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED"] : []), ...(item.domain === "contract" && current.targetStatus !== "draft" && changedFields.length > 0 ? ["NORMAL_CONTRACT_WORKFLOW_REQUIRED"] : []), ...changedFields.filter(field => json(current[field]) !== json(prior.target_baseline[field]))] : [];
    if (conflicts.length) return this.revision(manager, operation.id, prior!.id, prior!.version, "conflict", item.rowDigest, conflicts.map(field => ({ field })), prior!.target_baseline, current);
    const writable = Object.fromEntries(changedFields.map(field => [field, fields[field]]));
    // Compare each source field against the current target projection above.
    // The write must use that same observed version: an unrelated legitimate
    // platform edit advances the aggregate version but is not a source-field
    // conflict and must not make the next independent source revision stale.
    const applied = !prior && item.domain === "contract" ? Object.keys(writable).map(field => ({ field })) : await this.writeTarget(manager, scope, actor, item.domain, target.id, writable, prior ? Number(current.targetVersion) : undefined);
    const latest = await this.readTarget(manager, scope, item.domain, target.id);
    const targetBaseline = prior ? { ...prior.target_baseline, ...Object.fromEntries(changedFields.map(field => [field, latest[field]])), targetVersion: latest.targetVersion } : latest;
    const encryptedFacts = this.sensitive.encrypt(json(item.fields));
    let itemId = prior?.id, version = (prior?.version ?? 0) + 1;
    if (prior) await manager.query(`UPDATE hr_incremental_import_item SET last_row_sha256=$2,field_baseline=$3::jsonb,target_baseline=$4::jsonb,source_facts_encrypted=$5,source_facts_sha256=$6,version=$7,target_version=$8,last_operation_id=$9,update_time=now() WHERE id=$1`, [prior.id, item.rowDigest, json(fields), json(targetBaseline), encryptedFacts, this.payloadHash(item.fields), version, Number(targetBaseline.targetVersion), operation.id]);
    else { const inserted = await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15) RETURNING id`, [...source, item.domain, target.table, target.id, item.rowDigest, json(fields), json(targetBaseline), encryptedFacts, this.payloadHash(item.fields), Number(targetBaseline.targetVersion), operation.id]); itemId = inserted[0]!.id; }
    return this.revision(manager, operation.id, itemId!, version, "applied", item.rowDigest, applied, current, targetBaseline);
  }

  private async initialMap(manager: EntityManager, scope: TenantParkScope, sourceSystem: string, item: YuzhouIncrementalItem) {
    const targetTable = item.domain === "employee" ? "hr_employee" : item.domain === "profile" ? "hr_employee_profile" : "hr_contract";
    const sourceIdentity = item.sourceKey.slice("sha256:".length);
    const rows = await manager.query(
      `SELECT map.target_table,map.target_id::text AS target_id
         FROM legacy_record_map map
         JOIN migration_batch batch ON batch.id=map.batch_id
        WHERE map.source_system=$1 AND map.source_table=$2
          AND map.source_pk_canonical=$3 AND map.source_identity_sha256=$4
          AND map.target_table=$5 AND map.mapping_status IN ('loaded','verified')
          AND map.is_active=true
        LIMIT 2`,
      [sourceSystem, item.sourceTable, item.sourceKey, sourceIdentity, targetTable]
    ) as Array<{ target_table: string; target_id: string | null }>;
    if (!rows[0]) return null;
    if (rows.length > 1 || !rows[0].target_id) throw new ConflictException("Initial legacy source map is ambiguous or incomplete");
    const current = await this.readTarget(manager, scope, item.domain, rows[0].target_id);
    return { table: rows[0].target_table, id: rows[0].target_id, current };
  }

  private async bootstrapUnknownBaseline(manager: EntityManager, operation: OperationRow, item: YuzhouIncrementalItem, source: unknown[], baseline: { table: string; id: string; current: Record<string, unknown> }) {
    // A map proves identity, not that today's target values equal the original
    // imported facts.  Persist the binding and source receipt, then require a
    // separately evidenced baseline before a later source revision can write.
    const encryptedFacts = this.sensitive.encrypt(json(item.fields));
    const inserted = await manager.query(
      `INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'{}'::jsonb,'{}'::jsonb,$10,$11,$12,$13) RETURNING id`,
      [...source, item.domain, baseline.table, baseline.id, item.rowDigest, encryptedFacts, this.payloadHash(item.fields), Number(baseline.current.targetVersion), operation.id]
    ) as Array<{ id: string }>;
    return this.revision(manager, operation.id, inserted[0]!.id, 1, "conflict", item.rowDigest,
      [{ code: "INITIAL_FIELD_BASELINE_UNKNOWN", sourceKey: item.sourceKey }], {}, baseline.current);
  }

  private relationshipConflicts(item: YuzhouIncrementalItem, priorSource: Record<string, unknown>) {
    return ["employeeSourceKey", "employeeSourceTable", "contractTypeId"].filter(field => field in item.fields && json(item.fields[field]) !== json(priorSource[field]));
  }

  private normalizedFields(item: YuzhouIncrementalItem) { const fields = { ...item.fields }; delete fields.employeeSourceKey; delete fields.employeeSourceTable; delete fields.contractTypeId; delete fields.contractStatus; if (item.domain === "profile" && fields.idNumber === null) { Object.assign(fields, { idNumberEncrypted:null, idNumberMasked:null, idNumberFingerprint:null }); delete fields.idNumber; } if (item.domain === "profile" && typeof fields.idNumber === "string") { const normalizedId = fields.idNumber.replace(/\s+/gu, "").toUpperCase(); if (!normalizedId || normalizedId.length > 64) throw new BadRequestException("idNumber is invalid"); const identity = this.sensitive.identityProfile(normalizedId); Object.assign(fields, { idNumberEncrypted: identity.encrypted, idNumberMasked: identity.masked, idNumberFingerprint: identity.hash }); delete fields.idNumber; } return fields; }
  private async createTarget(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, sourceSystem: string, item: YuzhouIncrementalItem) {
    const f = item.fields;
    if (item.domain === "employee") { this.required(f, "employeeCode", "fullName", "employmentStatus"); if (typeof f.employmentStatus !== "string" || !HR_EMPLOYEE_STATUSES.includes(f.employmentStatus as typeof HR_EMPLOYEE_STATUSES[number])) throw new BadRequestException("employmentStatus must be an approved source-state mapping"); const r = await manager.query(`INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,employment_type,employment_status,hire_date,work_location,work_mobile,work_email,create_by,update_by,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,1) RETURNING id`, [scope.tenantId,scope.parkId,f.employeeCode,f.fullName,f.employmentType ?? "full_time",f.employmentStatus,f.hireDate ?? null,f.workLocation ?? null,f.workMobile ?? null,f.workEmail ?? null,actor.sub]); return { table: "hr_employee", id: r[0]!.id }; }
    const employeeId = await this.employeeTarget(manager, scope, sourceSystem, String(f.employeeSourceKey), typeof f.employeeSourceTable === "string" ? f.employeeSourceTable : undefined);
    if (item.domain === "profile") { const r = await manager.query(`INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,create_by,update_by,version) VALUES($1,$2,$3,$4,$4,1) RETURNING id`, [scope.tenantId,scope.parkId,employeeId,actor.sub]); return { table: "hr_employee_profile", id: r[0]!.id }; }
    this.required(f, "contractTypeId", "contractStatus", "contractNo", "startDate"); if (typeof f.contractStatus !== "string" || !YUZHOU_INCREMENTAL_CONTRACT_STATUSES.includes(f.contractStatus as typeof YUZHOU_INCREMENTAL_CONTRACT_STATUSES[number])) throw new BadRequestException("contractStatus must be an approved source-state mapping"); await this.validateContractWrite(manager, scope, f, employeeId); if (f.contractStatus === "active") { const active = await manager.query(`SELECT 1 FROM hr_contract WHERE tenant_id=$1 AND park_id=$2 AND employee_id=$3 AND status='active' AND is_deleted=false LIMIT 1`, [scope.tenantId,scope.parkId,employeeId]); if (active[0]) throw new ConflictException("Employee already has an active contract"); } const types = await manager.query(`SELECT id FROM hr_contract_type WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status='enabled'`, [f.contractTypeId,scope.tenantId,scope.parkId]); if (!types[0]) throw new BadRequestException("Contract type is unavailable in current scope"); const r = await manager.query(`INSERT INTO hr_contract(tenant_id,park_id,employee_id,contract_type_id,contract_no,start_date,end_date,probation_end_date,work_type,position_title,status,is_historical_import,source_snapshot,create_by,update_by,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,jsonb_build_object('incrementalSourceState',$11::varchar),$12,$12,1) RETURNING id`, [scope.tenantId,scope.parkId,employeeId,f.contractTypeId,f.contractNo,f.startDate,f.endDate ?? null,f.probationEndDate ?? null,f.workType ?? null,f.positionTitle ?? null,f.contractStatus,actor.sub]); await this.appendIncrementalContractAction(manager,scope,r[0]!.id,actor.sub,"imported_source_created",null); return { table: "hr_contract", id: r[0]!.id };
  }
  private async employeeTarget(manager: EntityManager, scope: TenantParkScope, sourceSystem: string, sourceKey: string, sourceTable?: string) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(sourceKey)) throw new BadRequestException("employeeSourceKey must be canonical");
    const rows = await manager.query(`SELECT target_id FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND domain='employee' AND source_key=$4${sourceTable ? " AND source_table=$5" : ""} LIMIT 2`, sourceTable ? [scope.tenantId,scope.parkId,sourceSystem,sourceKey,sourceTable] : [scope.tenantId,scope.parkId,sourceSystem,sourceKey]);
    if (rows.length > 1) throw new ConflictException("Employee source dependency is ambiguous");
    let targetId = rows[0]?.target_id;
    if (!targetId) {
      if (!sourceTable) throw new BadRequestException("Employee source dependency is not available");
      const mapped = await manager.query(`SELECT target_id FROM legacy_record_map WHERE source_system=$1 AND source_table=$2 AND source_pk_canonical=$3 AND source_identity_sha256=$4 AND target_table='hr_employee' AND mapping_status IN ('loaded','verified') AND is_active=true LIMIT 2`, [sourceSystem,sourceTable,sourceKey,sourceKey.slice("sha256:".length)]);
      if (mapped.length > 1) throw new ConflictException("Employee legacy source map is ambiguous");
      targetId = mapped[0]?.target_id;
    }
    if (!targetId) throw new BadRequestException("Employee source dependency is not available");
    const employee = await manager.query(`SELECT id FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`, [targetId,scope.tenantId,scope.parkId]);
    if (!employee[0]) throw new BadRequestException("Employee source dependency is outside current scope or unavailable");
    return employee[0].id as string;
  }
  private async readTarget(manager: EntityManager, scope: TenantParkScope, domain: YuzhouIncrementalItem["domain"], id: string) { const table = domain === "employee" ? "hr_employee" : domain === "profile" ? "hr_employee_profile" : "hr_contract"; const dates = domain === "employee" ? ["hire_date"] : domain === "profile" ? ["date_of_birth"] : ["start_date", "end_date", "probation_end_date"]; const dateProjection = dates.map(column => `to_char(${column},'YYYY-MM-DD') AS ${column}`).join(","); const rows = await manager.query(`SELECT *,${dateProjection} FROM ${table} WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false`, [id,scope.tenantId,scope.parkId]); if (!rows[0]) throw new ConflictException("Incremental target no longer exists"); const row = rows[0] as Record<string, unknown>; const columns: Record<string,string> = { employeeCode:"employee_code",fullName:"full_name",employmentStatus:"employment_status",employmentType:"employment_type",hireDate:"hire_date",workLocation:"work_location",workMobile:"work_mobile",workEmail:"work_email",englishName:"english_name",gender:"gender",dateOfBirth:"date_of_birth",personalMobile:"personal_mobile",personalEmail:"personal_email",address:"address",idNumberEncrypted:"id_number_encrypted",idNumberMasked:"id_number_masked",idNumberFingerprint:"id_number_fingerprint",contractNo:"contract_no",startDate:"start_date",endDate:"end_date",probationEndDate:"probation_end_date",workType:"work_type",positionTitle:"position_title",targetVersion:"version",targetStatus:"status" }; return Object.fromEntries(Object.entries(columns).map(([field,column]) => [field,row[column]])); }
  private async writeTarget(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, domain: YuzhouIncrementalItem["domain"], id: string, fields: Record<string, unknown>, expectedVersion?: number) { if (!Object.keys(fields).length) return []; const current = await this.readTarget(manager, scope, domain, id); if (domain === "contract" && current.targetStatus !== "draft") throw new ConflictException("Only a draft contract can be updated by incremental import"); if (domain === "contract") await this.validateContractWrite(manager, scope, { ...current, ...fields }, undefined, id); const columns: Record<string, string> = { employeeCode:"employee_code",fullName:"full_name",employmentStatus:"employment_status",employmentType:"employment_type",hireDate:"hire_date",workLocation:"work_location",workMobile:"work_mobile",workEmail:"work_email",englishName:"english_name",gender:"gender",dateOfBirth:"date_of_birth",personalMobile:"personal_mobile",personalEmail:"personal_email",address:"address",idNumberEncrypted:"id_number_encrypted",idNumberMasked:"id_number_masked",idNumberFingerprint:"id_number_fingerprint",contractNo:"contract_no",startDate:"start_date",endDate:"end_date",probationEndDate:"probation_end_date",workType:"work_type",positionTitle:"position_title" }; const entries = Object.entries(fields); if (!entries.length) return []; const table = domain === "employee" ? "hr_employee" : domain === "profile" ? "hr_employee_profile" : "hr_contract"; const params: unknown[] = [id,scope.tenantId,scope.parkId,actor.sub]; const sets = entries.map(([key,value],index) => { params.push(value); return `${columns[key]}=$${index+5}`; }); const versionCheck = expectedVersion === undefined ? "" : ` AND version=$${params.push(expectedVersion)}`; const updated = await manager.query(`UPDATE ${table} SET ${sets.join(",")},update_by=$4,update_time=now(),version=version+1 WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false${versionCheck} RETURNING id,version`, params); const rows = Array.isArray(updated[0]) ? updated[0] : updated; if (!Array.isArray(rows) || !rows[0]?.id) throw new ConflictException("Incremental target changed concurrently"); if (domain === "contract") await this.appendIncrementalContractAction(manager,scope,id,actor.sub,"updated","draft"); return entries.map(([field]) => ({ field })); }
  private async validateContractWrite(manager: EntityManager, scope: TenantParkScope, fields: Record<string, unknown>, employeeId?: string, excludeId?: string) {
    const startDate = String(fields.startDate ?? ""), endDate = fields.endDate == null ? null : String(fields.endDate), probationEndDate = fields.probationEndDate == null ? null : String(fields.probationEndDate);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(startDate)) throw new BadRequestException("Contract start date is invalid");
    if (endDate && (!/^\d{4}-\d{2}-\d{2}$/u.test(endDate) || endDate < startDate)) throw new BadRequestException("Contract end date cannot precede start date");
    if (probationEndDate && (!/^\d{4}-\d{2}-\d{2}$/u.test(probationEndDate) || probationEndDate < startDate || (endDate && probationEndDate > endDate))) throw new BadRequestException("Probation end date must be within the contract term");
    const contractNo = String(fields.contractNo ?? "").trim(); if (!contractNo || contractNo.length > 64) throw new BadRequestException("Contract number is invalid");
    if (employeeId) { const employee = await manager.query(`SELECT id FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`, [employeeId, scope.tenantId, scope.parkId]); if (!employee[0]) throw new BadRequestException("Employee is unavailable in current scope"); }
    const duplicate = await manager.query(`SELECT 1 FROM hr_contract WHERE tenant_id=$1 AND park_id=$2 AND contract_no=$3 AND is_deleted=false${excludeId ? " AND id<>$4" : ""} LIMIT 1`, excludeId ? [scope.tenantId,scope.parkId,contractNo,excludeId] : [scope.tenantId,scope.parkId,contractNo]); if (duplicate[0]) throw new ConflictException("Contract number already exists");
  }
  private async appendIncrementalContractAction(manager: EntityManager, scope: TenantParkScope, contractId: string, actorId: string, action: "created" | "updated" | "imported_source_created", fromStatus: string | null) {
    const contract = (await manager.query(`SELECT contract_no,employee_id,contract_type_id,start_date,end_date,probation_end_date,status FROM hr_contract WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [contractId,scope.tenantId,scope.parkId]))[0] as Record<string, unknown> | undefined; if (!contract) throw new ConflictException("Contract action target is unavailable");
    await manager.query(`INSERT INTO hr_contract_action(tenant_id,park_id,contract_id,sequence_no,action,from_status,to_status,snapshot,actor_user_id,occurred_at,create_by,update_by,version) VALUES($1,$2,$3,(SELECT coalesce(max(sequence_no),0)+1 FROM hr_contract_action WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND contract_id=$3::uuid),$4,$5,$6,$7::jsonb,$8,now(),$8,$8,1)`, [scope.tenantId,scope.parkId,contractId,action,fromStatus,contract.status,json({contractNo:contract.contract_no,employeeId:contract.employee_id,contractTypeId:contract.contract_type_id,startDate:contract.start_date,endDate:contract.end_date,probationEndDate:contract.probation_end_date}),actorId]);
  }

  private requirePackagePermissions(actor: JwtPrincipal, items: readonly YuzhouIncrementalItem[], access: "read" | "manage") {
    for (const domain of new Set(items.map(item => item.domain))) this.requireDomainPermission(actor, domain, access);
  }
  private requireDomainPermission(actor: JwtPrincipal, domain: YuzhouIncrementalItem["domain"], access: "read" | "manage" = "manage") {
    const managePermission = domain === "employee" ? HR_PERMISSIONS.HR_EMPLOYEE_MANAGE : domain === "profile" ? HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE : HR_PERMISSIONS.HR_CONTRACT_MANAGE;
    const readPermission = domain === "employee" ? HR_PERMISSIONS.HR_EMPLOYEE_READ : domain === "profile" ? HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ : HR_PERMISSIONS.HR_CONTRACT_READ;
    const allowed = access === "manage" ? [managePermission] : [readPermission, managePermission];
    if (!actor.isSuper && !actor.permissions.includes("*") && !allowed.some(permission => actor.permissions.includes(permission))) throw new ForbiddenException(`${allowed[0]} permission is required`);
  }
  private payloadHash(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
  private async revision(manager: EntityManager, operationId: string, itemId: string, _revision: number, outcome: "applied"|"unchanged"|"conflict", digest: string, diff: unknown, before: unknown, after: unknown) { const rows = await manager.query(`SELECT coalesce(max(revision_no),0)+1 AS next_revision FROM hr_incremental_import_revision WHERE item_id=$1`, [itemId]) as Array<{next_revision:number}>; await manager.query(`INSERT INTO hr_incremental_import_revision(operation_id,item_id,revision_no,outcome,source_row_sha256,field_diff,before_receipt,after_receipt) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`, [operationId,itemId,Number(rows[0]!.next_revision),outcome,digest,json(diff),json(before),json(after)]); return outcome; }
  private required(fields: Record<string, unknown>, ...names: string[]) { for (const name of names) if (typeof fields[name] !== "string" || !String(fields[name]).trim()) throw new BadRequestException(`${name} is required`); }
  private packageHash(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
}
