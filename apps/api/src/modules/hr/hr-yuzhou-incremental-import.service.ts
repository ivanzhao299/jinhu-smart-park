import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";
import { createHash } from "node:crypto";
import { isEmail, isUUID } from "class-validator";
import { SYSTEM_PERMISSIONS, canonicalYuzhouIncrementalPackage, HR_EMPLOYEE_STATUSES, HR_EMPLOYMENT_TYPES, HR_PERMISSIONS, YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE, YUZHOU_INCREMENTAL_CONTRACT_STATUSES, YUZHOU_INCREMENTAL_FIELDS, type YuzhouIncrementalItem, type YuzhouInitialBaselineWitness } from "@jinhu/shared";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import type { PreviewYuzhouIncrementalImportDto } from "./dto/yuzhou-incremental-import.dto";

import { executeYuzhouFamilyItem } from "./hr-yuzhou-family-executor";
import { executeYuzhouTrainingItem } from "./hr-yuzhou-training-executor";
import { normalizeTrainingHistoryFacts } from "./hr-yuzhou-training-transaction";
import { executeYuzhouInsurancePolicyItem } from "./hr-yuzhou-insurance-policy-executor";
import { normalizeInsurancePolicyFacts } from "./hr-yuzhou-insurance-policy-transaction";
import { AuditService } from "../audit/audit.service";
import { executeYuzhouRecordItem } from "./hr-yuzhou-record-executor";
import { normalizeYuzhouRecordFields } from "@jinhu/shared";
import { normalizeYuzhouFamilyFields } from "@jinhu/shared";
import { originalProfile, originalProfileAliasProof, certifyOriginalProfiles, profileWitnessHash, profileCanonical } from "./hr-yuzhou-profile-baseline";
import { initialWitnessHash, verifyYuzhouInitialBaseline } from "./hr-yuzhou-initial-baseline";

import { DataScopeRuleEntity } from "../data-scopes/entities/data-scope-rule.entity";
import { RoleDataScopeEntity } from "../data-scopes/entities/role-data-scope.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { lockOrgHierarchy } from "../orgs/org-hierarchy-lock";
import { assertOrgVisible, hierarchyFields, incrementalTable, isHierarchy, organizationColumns, positionColumns, sourceHierarchyTarget, validateHierarchyWrite } from "./hr-yuzhou-organization";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

type ItemRow = { id: string; target_table: string | null; target_id: string | null; last_row_sha256: string; field_baseline: Record<string, unknown>; target_baseline: Record<string, unknown>; source_facts_encrypted: string; version: number; target_version: number; baseline_encrypted?: string | null; initial_anchor?: boolean; alias_fields?: string[]; alias_conflicts?: string[]; alias_proof?: Record<string,unknown>; alias_original_version?: number };
type OperationRow = { id: string; status: string; package_sha256: string; source_system: string };
const json = (value: unknown) => JSON.stringify(value);
const canonicalJson = (value: unknown): string => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value)
    ? `[${value.map(canonicalJson).join(",")}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
const rowDigest = (item: YuzhouIncrementalItem) => createHash("sha256").update(canonicalJson({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: item.sourceUpdatedAt ?? null, fields: item.fields, ...(item.profileAliasAcceptance ? {profileAliasAcceptance:item.profileAliasAcceptance} : {}) })).digest("hex");

@Injectable()
export class HrYuzhouIncrementalImportService {
  constructor(private readonly db: DataSource, private readonly sensitive: PartySensitiveDataService, @Optional() private readonly dataScopes?: DataScopeService, @Optional() private readonly audit?: AuditService) {}

  async preview(scope: TenantParkScope, actor: JwtPrincipal, dto: PreviewYuzhouIncrementalImportDto) {
    this.validate(dto.items);
    const pkg = this.canonicalPackage(dto), packageHash = this.packageHash(pkg);
    return this.db.transaction(async manager => {
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [json([scope.tenantId, scope.parkId, dto.sourceSystem, packageHash])]);
      const existing = await manager.query(`SELECT id,status,package_sha256 FROM hr_incremental_import_operation WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND package_sha256=$4 FOR UPDATE`, [scope.tenantId, scope.parkId, dto.sourceSystem, packageHash]) as OperationRow[];
      this.requirePackagePermissions(actor, dto.items, "manage");
      if (existing[0]) return this.status(scope, actor, existing[0].id, manager);
      await this.prepareHierarchy(manager,scope,actor,pkg.items);
      const plan = [];
      for (const item of pkg.items) plan.push(await this.previewItem(manager, scope, dto.sourceSystem, item, actor, pkg.items));
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
    this.validate(dto.items); const packageHash = this.packageHash(this.canonicalPackage(dto));
    try { return await this.db.transaction(async manager => {
      const operation = (await manager.query(`SELECT id,status,package_sha256,source_system FROM hr_incremental_import_operation WHERE id=$1 AND tenant_id=$2 AND park_id=$3 FOR UPDATE`, [operationId, scope.tenantId, scope.parkId]))[0] as OperationRow | undefined;
      if (!operation) throw new NotFoundException("Incremental import operation not found");
      if (operation.package_sha256 !== packageHash) throw new ConflictException("Incremental import package drift detected");
      this.requirePackagePermissions(actor, dto.items, "manage");
      if (operation.status === "committed" || operation.status === "conflicted") return this.status(scope, actor, operationId, manager);
      await this.prepareHierarchy(manager,scope,actor,dto.items);
      let applied = 0, unchanged = 0, conflicts = 0;
      for (const item of this.canonicalPackage(dto).items) {
        const outcome = await this.applyItem(manager, scope, actor, operation, item);
        if (outcome === "applied") applied++; else if (outcome === "unchanged") unchanged++; else conflicts++;
      }
      const status = conflicts ? "conflicted" : "committed";
      await manager.query(`UPDATE hr_incremental_import_operation SET status=$4,applied_count=$5,unchanged_count=$6,conflict_count=$7,committed_by=$8,committed_at=now(),cursor_at=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3`, [operationId, scope.tenantId, scope.parkId, status, applied, unchanged, conflicts, actor.sub]);
      return this.status(scope, actor, operationId, manager);
    }); } catch (error) { if ((error as { code?: string }).code === "23505") throw new ConflictException("Incremental import target or source mapping already exists"); throw error; }
  }

  async status(scope: TenantParkScope, actor: JwtPrincipal, id: string, manager: EntityManager | DataSource = this.db): Promise<Record<string,unknown>> {
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

  private async previewItem(manager: EntityManager, scope: TenantParkScope, sourceSystem: string, item: YuzhouIncrementalItem, actor: JwtPrincipal, staged:readonly YuzhouIncrementalItem[] = []) {
    if(item.domain === "insurance_policy") {
      if(!this.audit) throw new ConflictException("INSURANCE_POLICY_IMPORT_AUDIT_UNAVAILABLE");
      return executeYuzhouInsurancePolicyItem(manager,scope,actor,{...item,domain:item.domain},this.sensitive,this.audit);
    }
    if(item.domain === "training_history") return executeYuzhouTrainingItem(manager,scope,actor,{...item,domain:item.domain},this.sensitive,(key,table)=>this.employeeTarget(manager,scope,sourceSystem,key,table),undefined,staged.some(row=>row.domain==="employee"&&row.sourceTable===item.fields.employeeSourceTable&&row.sourceKey===item.fields.employeeSourceKey));
    if(item.domain === "skill" || item.domain === "credential") return executeYuzhouRecordItem(manager,scope,actor,{...item,domain:item.domain},this.sensitive,(key,table)=>this.employeeTarget(manager,scope,sourceSystem,key,table),undefined,staged.some(row=>row.domain==="employee"&&row.sourceTable===item.fields.employeeSourceTable&&row.sourceKey===item.fields.employeeSourceKey));
    if(item.domain === "family") return executeYuzhouFamilyItem(manager,scope,actor,item,this.sensitive,(key,table)=>this.employeeTarget(manager,scope,sourceSystem,key,table),undefined,staged.some(row=>row.domain==="employee"&&row.sourceTable===item.fields.employeeSourceTable&&row.sourceKey===item.fields.employeeSourceKey));
    const source = [scope.tenantId, scope.parkId, sourceSystem, item.sourceTable, item.sourceKey];
    let prior = (await manager.query(`SELECT id,target_table,target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted,version,target_version,baseline_encrypted FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND source_table=$4 AND source_key=$5 AND domain=$6`, [...source, item.domain]))[0] as ItemRow | undefined;
    prior = await this.resolveProfileBaseline(manager, scope, item, prior);
    prior = await this.resolveInitialBaseline(manager, scope, sourceSystem, item, prior);
    const current = prior ? await this.readTarget(manager, scope, item.domain, prior.target_id!) : {};
    if (prior && isHierarchy(item.domain)) await assertOrgVisible(actor,item.domain === "organization" ? prior.target_id! : current.orgSourceKey as string,this.scopes(manager));
    let fields = this.normalizedFields(item);
    const base = () => ({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, fields: Object.keys(fields).sort() });
    if (prior && Object.keys(prior.field_baseline).length === 0 && Object.keys(prior.target_baseline).length === 0) return { ...base(), action: "conflict", conflictFields: ["INITIAL_FIELD_BASELINE_UNKNOWN"] };
    if (prior?.last_row_sha256 === item.rowDigest) return { ...base(), action: "unchanged", conflictFields: [] };
    if (!prior) {
      const mapped = await this.initialMap(manager, scope, sourceSystem, item);
      if (mapped) return { ...base(), action: "conflict", conflictFields: ["INITIAL_FIELD_BASELINE_UNKNOWN"] };
      this.requireNewEmployeeOrganization(item);
      return { ...base(), action: "create", conflictFields: [] };
    }
    if ("idNumberEncrypted" in fields && current.idNumberFingerprint === prior.target_baseline.idNumberFingerprint && fields.idNumberFingerprint === current.idNumberFingerprint) {
      delete fields.idNumberEncrypted; delete fields.idNumberMasked; delete fields.idNumberFingerprint;
    }
    const priorSource = JSON.parse(this.sensitive.decrypt(prior.source_facts_encrypted) || "{}") as Record<string, unknown>;
    const changedFields = [...new Set([...this.changedSourceFields(item, fields, priorSource), ...(prior.alias_fields ?? [])])];
    const relationshipConflicts = this.relationshipConflicts(item, priorSource);
    // An unchanged source status must not undo or block a modern lifecycle change.
    // Actual source status revisions require the normal employment event workflow.
    const employmentConflict = item.domain === "employee" && changedFields.includes("employmentStatus");
    const stateConflict = item.domain === "contract" && (("contractStatus" in item.fields && item.fields.contractStatus !== priorSource.contractStatus) || (current.targetStatus !== "draft" && changedFields.length > 0));
    const conflictFields = [...this.aliasHistoryConflicts(prior,current), ...(prior.alias_conflicts ?? []), ...this.unknownProfileFields(item, priorSource, prior.target_baseline), ...relationshipConflicts, ...(employmentConflict ? ["NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED"] : []), ...(stateConflict ? ["NORMAL_CONTRACT_WORKFLOW_REQUIRED"] : []), ...changedFields.filter(field => this.targetFieldChanged(field,current,prior.target_baseline))];
    return { ...base(), action: conflictFields.length ? "conflict" : changedFields.length ? "update" : "unchanged", conflictFields };
  }

  private validate(items: YuzhouIncrementalItem[]) {
    const seen = new Set<string>();
    for (const item of items) {
      if(item.insurancePolicyBaselineWitness !== undefined && item.domain !== "insurance_policy") throw new BadRequestException("INSURANCE_POLICY_BASELINE_DOMAIN_INVALID");
      const alias=item.profileAliasAcceptance;
      if(alias !== undefined && (!alias || item.domain!=="profile" || item.sourceTable!=="dbo.person.core_residue" || item.profileBaselineWitness || item.initialBaselineWitness
        || Object.keys(alias).sort().join(",")!=="bindingSha256,fields,operationId,proof,version" || alias.version!==1 || alias.proof!=="original_t5_alias_fields_v1"
        || !/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(alias.operationId) || !/^[a-f0-9]{64}$/u.test(alias.bindingSha256)
        || !Array.isArray(alias.fields) || !alias.fields.length || new Set(alias.fields).size!==alias.fields.length
        || Object.keys(item.fields).sort().join(",")!==[...alias.fields].sort().join(",")
        || alias.fields.some(f=>!["nativePlace","degree"].includes(f)||!Object.prototype.hasOwnProperty.call(item.fields,f)))) throw new BadRequestException("PROFILE_ALIAS_ACCEPTANCE_INVALID");
      const key = `${item.domain}:${item.sourceTable}:${item.sourceKey}`;
      if (seen.has(key)) throw new BadRequestException(`Duplicate source item: ${key}`); seen.add(key);
      if (!/^sha256:[a-f0-9]{64}$/u.test(item.sourceKey)) throw new BadRequestException("sourceKey must be canonical sha256:<sourceIdentity>");
      if (!/^[a-f0-9]{64}$/u.test(item.rowDigest) || item.rowDigest !== rowDigest(item)) throw new BadRequestException("rowDigest does not match the normalized source payload");
      if (!YUZHOU_INCREMENTAL_FIELDS[item.domain]) throw new BadRequestException("Unsupported incremental domain");
      if (isHierarchy(item.domain) && item.sourceTable !== (item.domain === "organization" ? "dbo.departmentcode" : "dbo.job")) throw new BadRequestException("YUZHOU_SOURCE_TABLE_INVALID");
      if (item.domain === "employee" && "positionSourceKey" in item.fields && !("orgSourceKey" in item.fields)) throw new BadRequestException("YUZHOU_EMPLOYEE_ORG_REQUIRED");
      const allowed = new Set(YUZHOU_INCREMENTAL_FIELDS[item.domain]);
      for (const field of Object.keys(item.fields)) if (!allowed.has(field)) throw new BadRequestException(`Unsupported ${item.domain} field: ${field}`);
      this.validateFieldValues(item);

    }
  }

  private validateFieldValues(item: YuzhouIncrementalItem) {
    if(item.domain === "insurance_policy") {
      if(item.initialBaselineWitness || item.profileBaselineWitness || item.profileAliasAcceptance || item.sourceTable!=="dbo.insure_method") throw new BadRequestException("INSURANCE_POLICY_IMPORT_SOURCE_INVALID");
      normalizeInsurancePolicyFacts(item.fields);
      return;
    }
    if(item.domain === "training_history") {
      if(item.initialBaselineWitness || item.profileBaselineWitness || item.profileAliasAcceptance || item.sourceTable!=="dbo.trainhis" || item.fields.employeeSourceTable!=="dbo.person" || typeof item.fields.employeeSourceKey!=="string" || !/^sha256:[a-f0-9]{64}$/u.test(item.fields.employeeSourceKey)) throw new BadRequestException("TRAINING_IMPORT_SOURCE_INVALID");
      const fields={...item.fields};delete fields.employeeSourceKey;delete fields.employeeSourceTable;
      normalizeTrainingHistoryFacts(fields);
      return;
    }
    if(item.domain === "skill" || item.domain === "credential") {
      const fields={...item.fields};delete fields.employeeSourceKey;delete fields.employeeSourceTable;
      try{normalizeYuzhouRecordFields(item.domain,fields);}catch{throw new BadRequestException("RECORD_IMPORT_FIELDS_INVALID");}
      return;
    }
    if(item.domain === "family") {
      const fields={...item.fields};delete fields.employeeSourceKey;delete fields.employeeSourceTable;
      try{normalizeYuzhouFamilyFields(fields);}catch{throw new BadRequestException("FAMILY_IMPORT_FIELDS_INVALID");}
      return;
    }
    const dates = new Set(["hireDate","dateOfBirth","startDate","endDate","probationEndDate"]);
    const limits: Record<string, number> = { orgCode:64,orgName:100,orgType:32,positionCode:64,positionName:100,jobFamily:64,jobLevel:32,contactPhone:50,legacyManagerReference:10,authority:1024,legacyUptoCode:30,positionManual:256,qualification:1024,responsibilities:1024,legacyParentReference:30,legacyDepartmentReference:30,remark:500,employeeCode:64, fullName:100, employmentType:32, employmentStatus:32, workLocation:128, workMobile:32, workEmail:128, englishName:100, gender:32, personalMobile:32, personalEmail:128, address:500, idNumber:64, nativePlace:128, degree:64, contractNo:64, contractStatus:16, workType:100, positionTitle:100 };
    for (const [field,value] of Object.entries(item.fields)) {
      if (["sortOrder","plannedHeadcount","legacySourceId","legacyHierarchyLevel","headcountLimit","hierarchyLevel"].includes(field)) { if ((value===null&&field==="sortOrder") || (value !== null && (!Number.isSafeInteger(value) || Number(value)<(["sortOrder","headcountLimit","legacySourceId"].includes(field)?-2147483648:0) || Number(value)>(["hierarchyLevel","legacyHierarchyLevel"].includes(field)?32767:2147483647)))) throw new BadRequestException("YUZHOU_INTEGER_FIELD_INVALID"); continue; }
      if (value === null) {
        if (["orgCode","orgName","orgType","positionCode","positionName","status","orgSourceKey","sortOrder","employeeCode", "fullName", "employmentType", "employmentStatus", "contractNo", "startDate", "contractStatus", "contractTypeId", "employeeSourceKey", "employeeSourceTable"].includes(field)) throw new BadRequestException(`${field} cannot be null`);
        continue;
      }
      if (field.endsWith("SourceKey") && (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value))) throw new BadRequestException("YUZHOU_DEPENDENCY_KEY_INVALID");
      if (typeof value !== "string") throw new BadRequestException(`${field} must be a string or null`);
      if (["nativePlace","degree"].includes(field) && (value.includes("\0") || /\p{Surrogate}/u.test(value))) throw new BadRequestException("PROFILE_ALIAS_FIELD_INVALID");
      if (limits[field] !== undefined && value.length > limits[field]) throw new BadRequestException(`${field} exceeds its maximum length`);
      if (dates.has(field) && (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value)) throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
      if (["orgCode","orgName","positionCode","positionName","employeeCode", "fullName", "contractNo"].includes(field) && !value.trim()) throw new BadRequestException(`${field} cannot be empty`);
      if (["workEmail", "personalEmail"].includes(field) && !isEmail(value)) throw new BadRequestException(`${field} must be an email`);
      if (field === "contractTypeId" && !isUUID(value)) throw new BadRequestException("contractTypeId must be a UUID");
    }
    if (isHierarchy(item.domain) && item.fields.status !== undefined && !["enabled","disabled"].includes(String(item.fields.status))) throw new BadRequestException("YUZHOU_HIERARCHY_STATUS_INVALID");
    if (item.domain === "organization" && item.fields.orgType !== undefined && !["company","department","group","team"].includes(String(item.fields.orgType))) throw new BadRequestException("YUZHOU_ORG_TYPE_INVALID");
    if (item.domain === "employee" && item.fields.employmentType !== undefined && !HR_EMPLOYMENT_TYPES.includes(item.fields.employmentType as typeof HR_EMPLOYMENT_TYPES[number])) throw new BadRequestException("employmentType must be an approved source-state mapping");
    if (item.domain === "employee" && item.fields.employmentStatus !== undefined && item.fields.employmentStatus !== null && !HR_EMPLOYEE_STATUSES.includes(item.fields.employmentStatus as typeof HR_EMPLOYEE_STATUSES[number])) throw new BadRequestException("employmentStatus must be an approved source-state mapping");
    if (item.domain === "contract" && item.fields.contractStatus !== undefined && item.fields.contractStatus !== null && !YUZHOU_INCREMENTAL_CONTRACT_STATUSES.includes(item.fields.contractStatus as typeof YUZHOU_INCREMENTAL_CONTRACT_STATUSES[number])) throw new BadRequestException("contractStatus must be an approved source-state mapping");
  }

  private async applyItem(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, operation: OperationRow, item: YuzhouIncrementalItem): Promise<"applied" | "unchanged" | "conflict"> {
    this.requireDomainPermission(actor, item.domain);
    if(item.domain === "insurance_policy") {
      if(!this.audit) throw new ConflictException("INSURANCE_POLICY_IMPORT_AUDIT_UNAVAILABLE");
      const outcome=await executeYuzhouInsurancePolicyItem(manager,scope,actor,{...item,domain:item.domain},this.sensitive,this.audit,operation.id);
      if(typeof outcome!=="string") throw new ConflictException("INSURANCE_POLICY_IMPORT_OUTCOME_INVALID");
      return outcome;
    }
    if(item.domain === "training_history") {
      const outcome=await executeYuzhouTrainingItem(manager,scope,actor,{...item,domain:item.domain},this.sensitive,(key,table)=>this.employeeTarget(manager,scope,operation.source_system,key,table),operation.id);
      if(typeof outcome!=="string")throw new ConflictException("TRAINING_IMPORT_OUTCOME_INVALID");
      return outcome;
    }
    if(item.domain === "skill" || item.domain === "credential") {
      const outcome=await executeYuzhouRecordItem(manager,scope,actor,{...item,domain:item.domain},this.sensitive,(key,table)=>this.employeeTarget(manager,scope,operation.source_system,key,table),operation.id);
      if(typeof outcome!=="string")throw new ConflictException("RECORD_IMPORT_OUTCOME_INVALID");
      return outcome;
    }
    if(item.domain === "family") {
      const outcome=await executeYuzhouFamilyItem(manager,scope,actor,item,this.sensitive,(key,table)=>this.employeeTarget(manager,scope,operation.source_system,key,table),operation.id);
      if(typeof outcome!=="string")throw new ConflictException("FAMILY_IMPORT_OUTCOME_INVALID");
      return outcome;
    }
    const source = [scope.tenantId, scope.parkId, operation.source_system, item.sourceTable, item.sourceKey];
    await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [json([...source, item.domain])]);
    let prior = (await manager.query(`SELECT id,target_table,target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted,version,target_version,baseline_encrypted FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system=$3 AND source_table=$4 AND source_key=$5 AND domain=$6 FOR UPDATE`, [...source, item.domain]))[0] as ItemRow | undefined;
    prior = await this.resolveProfileBaseline(manager, scope, item, prior, { operation, actor });
    prior = await this.resolveInitialBaseline(manager, scope, operation.source_system, item, prior, { operation, actor });
    const current = prior ? await this.readTarget(manager, scope, item.domain, prior.target_id!) : {};
    if (prior && isHierarchy(item.domain)) await assertOrgVisible(actor,item.domain === "organization" ? prior.target_id! : current.orgSourceKey as string,this.scopes(manager));
    if (prior && Object.keys(prior.field_baseline).length === 0 && Object.keys(prior.target_baseline).length === 0) return this.revision(manager, operation.id, prior.id, prior.version, "conflict", item.rowDigest, [{ code: "INITIAL_FIELD_BASELINE_UNKNOWN", sourceKey: item.sourceKey }], {}, {});
    if (prior && prior.last_row_sha256 === item.rowDigest) return this.revision(manager, operation.id, prior.id, prior.version, "unchanged", item.rowDigest, [], {}, {});
    if (!prior) {
      const baseline = await this.initialMap(manager, scope, operation.source_system, item);
      if (baseline) return this.bootstrapUnknownBaseline(manager, operation, item, source, baseline);
    }
    const target = prior ? { table: prior.target_table!, id: prior.target_id! } : await this.createTarget(manager, scope, actor, operation.source_system, item);
    const fields = this.normalizedFields(item);
    // AES-GCM ciphertext is intentionally non-deterministic. Compare identity through
    // the protected fingerprint and do not write an identical sensitive value again.
    if (prior && "idNumberEncrypted" in fields && current.idNumberFingerprint === prior.target_baseline.idNumberFingerprint && fields.idNumberFingerprint === current.idNumberFingerprint) {
      delete fields.idNumberEncrypted; delete fields.idNumberMasked; delete fields.idNumberFingerprint;
    }
    const priorSource = prior ? JSON.parse(this.sensitive.decrypt(prior.source_facts_encrypted) || "{}") as Record<string, unknown> : {};
    const changedFields = prior ? [...new Set([...this.changedSourceFields(item, fields, priorSource), ...(prior.alias_fields ?? [])])] : Object.keys(fields);
    const conflicts = prior ? [...this.aliasHistoryConflicts(prior,current), ...(prior.alias_conflicts ?? []), ...this.unknownProfileFields(item, priorSource, prior.target_baseline), ...this.relationshipConflicts(item, priorSource), ...(item.domain === "employee" && changedFields.includes("employmentStatus") ? ["NORMAL_EMPLOYMENT_WORKFLOW_REQUIRED"] : []), ...(item.domain === "contract" && (("contractStatus" in item.fields && item.fields.contractStatus !== priorSource.contractStatus) || (current.targetStatus !== "draft" && changedFields.length > 0)) ? ["NORMAL_CONTRACT_WORKFLOW_REQUIRED"] : []), ...changedFields.filter(field => this.targetFieldChanged(field,current,prior.target_baseline))] : [];
    if (conflicts.length) return this.revision(manager, operation.id, prior!.id, prior!.version, "conflict", item.rowDigest, conflicts.map(field => ({ field })), prior!.target_baseline, current);
    const writable = Object.fromEntries(changedFields.map(field => [field, fields[field]]));
    // Compare each source field against the current target projection above.
    // The write must use that same observed version: an unrelated legitimate
    // platform edit advances the aggregate version but is not a source-field
    // conflict and must not make the next independent source revision stale.
    const applied = !prior && (item.domain === "contract" || isHierarchy(item.domain)) ? Object.keys(writable).map(field => ({ field })) : await this.writeTarget(manager, scope, actor, item.domain, target.id, writable, prior ? Number(current.targetVersion) : undefined);
    const latest = await this.readTarget(manager, scope, item.domain, target.id);
    const targetBaseline = prior ? { ...prior.target_baseline, ...Object.fromEntries(changedFields.map(field => [field, latest[field]])), targetVersion: latest.targetVersion } : latest;
    const acceptedFields = { ...prior?.field_baseline, ...fields };
    const encryptedFacts = this.sensitive.encrypt(json({ ...priorSource, ...item.fields }));
    let itemId = prior?.id, version = (prior?.version ?? 0) + 1;
    const encryptedBaseline = prior?.initial_anchor || isHierarchy(item.domain);
    if (prior) await manager.query(`UPDATE hr_incremental_import_item SET last_row_sha256=$2,field_baseline=$3::jsonb,target_baseline=$4::jsonb,source_facts_encrypted=$5,source_facts_sha256=$6,version=$7,target_version=$8,last_operation_id=$9,baseline_encrypted=$10,update_time=now() WHERE id=$1`, [prior.id, item.rowDigest, json(encryptedBaseline ? {} : acceptedFields), json(encryptedBaseline ? {} : targetBaseline), encryptedFacts, this.payloadHash({ ...priorSource, ...item.fields }), version, Number(targetBaseline.targetVersion), operation.id, encryptedBaseline ? this.sensitive.encrypt(json({ fields:acceptedFields, target:targetBaseline })) : null]);
    else { const inserted = await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,field_baseline,target_baseline,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id,baseline_encrypted) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16) RETURNING id`, [...source, item.domain, target.table, target.id, item.rowDigest, json(encryptedBaseline?{}:fields), json(encryptedBaseline?{}:targetBaseline), encryptedFacts, this.payloadHash(item.fields), Number(targetBaseline.targetVersion), operation.id, encryptedBaseline?this.sensitive.encrypt(json({fields,target:targetBaseline})):null]); itemId = inserted[0]!.id; }
    return this.revision(manager, operation.id, itemId!, version, prior && changedFields.length === 0 ? "unchanged" : "applied", item.rowDigest, [...applied, ...(prior?.alias_proof ? [prior.alias_proof] : [])], current, targetBaseline);
  }

  private aliasHistoryConflicts(prior:ItemRow,current:Record<string,unknown>) {
    // Aggregate versions cannot distinguish an unrelated edit from an alias
    // edit followed by clearing. Fail closed until field history can prove it.
    return prior.alias_fields?.length && Number(current.targetVersion)!==prior.alias_original_version ? ["PROFILE_ALIAS_TARGET_HISTORY_CHANGED"] : [];
  }

  private unknownProfileFields(item:YuzhouIncrementalItem, priorSource:Record<string,unknown>, baseline:Record<string,unknown>) {
    if(item.domain!=="profile" || item.sourceTable!=="dbo.person.core_residue") return [];
    // A full current-target snapshot does not prove that a field was accepted
    // from this source. Missing source facts (including explicit incoming null)
    // require an independently evidenced first-field acceptance, never a reset.
    const unknown=Object.keys(item.fields).filter(field=>!["employeeSourceKey","employeeSourceTable"].includes(field)
      && (!Object.prototype.hasOwnProperty.call(priorSource,field) || !Object.prototype.hasOwnProperty.call(baseline,field==="idNumber"?"idNumberFingerprint":field)));
    return unknown.length ? ["INITIAL_FIELD_BASELINE_UNKNOWN",...unknown] : [];
  }

  private targetFieldChanged(field:string,current:Record<string,unknown>,baseline:Record<string,unknown>) {
    if(["idNumberEncrypted","idNumberMasked","idNumberFingerprint"].includes(field)) return json(current.idNumberFingerprint)!==json(baseline.idNumberFingerprint);
    return json(current[field])!==json(baseline[field]);
  }

  private changedSourceFields(item:YuzhouIncrementalItem, fields:Record<string,unknown>, priorSource:Record<string,unknown>) {
    const old=this.normalizedFields({...item,fields:priorSource});
    const identityUnchanged = json(fields.idNumberFingerprint)===json(old.idNumberFingerprint);
    return Object.keys(fields).filter(field => !(identityUnchanged && ["idNumberEncrypted","idNumberMasked","idNumberFingerprint"].includes(field)) && json(fields[field])!==json(old[field]));
  }

  private async resolveProfileBaseline(manager:EntityManager, scope:TenantParkScope, item:YuzhouIncrementalItem, prior:ItemRow|undefined, commit?:{operation:OperationRow;actor:JwtPrincipal}):Promise<ItemRow|undefined> {
    if(item.domain!=="profile" || item.sourceTable!=="dbo.person.core_residue") {
      if(item.profileBaselineWitness) throw new BadRequestException("PROFILE_BASELINE_SOURCE_INVALID");
      return prior;
    }
    const saved=prior ? (await manager.query(`SELECT * FROM hr_incremental_profile_baseline WHERE item_id=$1`,[prior.id]))[0] : undefined;
    if(saved) {
      const raw=this.sensitive.decrypt(saved.provenance_encrypted);
      if(!raw) throw new ConflictException("PROFILE_BASELINE_PROVENANCE_INVALID");
      const provenance=JSON.parse(raw) as Record<string,unknown> & {witness:NonNullable<YuzhouIncrementalItem["profileBaselineWitness"]>};
      if(profileWitnessHash(provenance.witness)!==saved.witness_sha256 || (item.profileBaselineWitness && profileWitnessHash(item.profileBaselineWitness)!==saved.witness_sha256)) throw new ConflictException("PROFILE_BASELINE_ALREADY_ANCHORED");
      const original=await originalProfile(manager,scope,item);
      if(!original || original.operation_id!==saved.original_operation_id || original.target_id!==prior!.target_id || original.binding_sha256!==provenance.witness.bindingSha256) throw new ConflictException("PROFILE_BASELINE_BINDING_MISMATCH");
      const decoded=this.sensitive.decrypt(prior!.baseline_encrypted ?? null);
      if(!decoded) throw new ConflictException("PROFILE_BASELINE_PROVENANCE_INVALID");
      const baseline=JSON.parse(decoded) as {fields:Record<string,unknown>;target:Record<string,unknown>};
      let resolved:ItemRow={...prior!,field_baseline:baseline.fields,target_baseline:baseline.target,initial_anchor:true};
      if(item.profileAliasAcceptance) {
        const acceptance=item.profileAliasAcceptance;
        if(acceptance.operationId!==original.operation_id||acceptance.bindingSha256!==original.binding_sha256) throw new ConflictException("PROFILE_ALIAS_BINDING_MISMATCH");
        const certificate=provenance.certificate as Record<string,unknown>|undefined;
        if(!certificate || profileCanonical(certificate.profiles)!==profileCanonical(original.owned_state.hr_employee_profile)
          || profileCanonical(certificate.receipts)!==profileCanonical(original.owned_state.receipts)
          || (certificate.profiles as {sha256?:string})?.sha256!==saved.original_profile_set_sha256
          || (certificate.receipts as {sha256?:string})?.sha256!==saved.original_receipt_set_sha256) throw new ConflictException("PROFILE_ALIAS_PROVENANCE_INVALID");
        const priorSource=JSON.parse(this.sensitive.decrypt(prior!.source_facts_encrypted)||"{}") as Record<string,unknown>;
        const missing=acceptance.fields.filter(field=>!Object.prototype.hasOwnProperty.call(priorSource,field));
        if(missing.length) {
          const proof=originalProfileAliasProof(original,provenance,this.sensitive,missing);
          const conflicts=missing.flatMap(field=>proof.target[field]!==null?["PROFILE_ALIAS_ORIGINAL_TARGET_NOT_EMPTY",field]:json(item.fields[field])!==json(proof.source[field])?["PROFILE_ALIAS_ORIGINAL_SOURCE_CHANGED",field]:[]);
          resolved={...resolved,source_facts_encrypted:this.sensitive.encrypt(json({...priorSource,...proof.source})),target_baseline:{...baseline.target,...proof.target},alias_fields:missing,alias_conflicts:conflicts,alias_original_version:proof.targetVersion,
            alias_proof:{code:"PROFILE_ALIAS_FIELDS_ACCEPTED",proof:acceptance.proof,fields:missing,originalOperationId:original.operation_id,bindingSha256:original.binding_sha256,sourceRowSha256:proof.sourceRowSha256}};
        }
      }
      return resolved;
    }
    if(item.profileAliasAcceptance) throw new ConflictException("PROFILE_ALIAS_ORIGINAL_BASELINE_REQUIRED");
    if(!item.profileBaselineWitness) return prior;
    if(item.initialBaselineWitness || Object.keys(item.fields).length) throw new BadRequestException("PROFILE_BASELINE_ONLY_REQUIRED");
    const witness=item.profileBaselineWitness,witnessSha=profileWitnessHash(witness);
    if(prior) {
      const accepted=await manager.query(`SELECT 1 FROM hr_incremental_import_revision WHERE item_id=$1 AND outcome IN ('applied','unchanged') LIMIT 1`,[prior.id]);
      if(accepted.length) throw new ConflictException("PROFILE_BASELINE_ALREADY_KNOWN");
    }
    const original=await originalProfile(manager,scope,item);
    if(!original || original.operation_id!==witness.operationId || original.binding_sha256!==witness.bindingSha256 || (prior && prior.target_id!==original.target_id)) throw new ConflictException("PROFILE_BASELINE_BINDING_MISMATCH");
    const proof=await certifyOriginalProfiles(manager,original,scope,this.sensitive);
    const fields=this.normalizedFields({...item,fields:proof.source}),target=proof.target;
    if(commit) {
      if(!prior) prior=(await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id) VALUES($1,$2,'yuzhou-v10',$3,$4,'profile','hr_employee_profile',$5,$6,$7,$8,$9,$10) RETURNING *`,[scope.tenantId,scope.parkId,item.sourceTable,item.sourceKey,original.target_id,original.source_row_sha256,this.sensitive.encrypt(json(proof.source)),this.payloadHash(proof.source),Number(target.targetVersion),commit.operation.id]))[0] as ItemRow;
      await manager.query(`INSERT INTO hr_incremental_profile_baseline(item_id,operation_id,original_operation_id,source_identity_sha256,original_profile_set_sha256,original_receipt_set_sha256,witness_sha256,provenance_encrypted,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[prior!.id,commit.operation.id,original.operation_id,original.source_identity_sha256,proof.certificate.profiles.sha256,proof.certificate.receipts.sha256,witnessSha,this.sensitive.encrypt(profileCanonical({witness,...proof})),commit.actor.sub]);
    }
    return {id:prior?.id??"",target_id:original.target_id,target_table:"hr_employee_profile",last_row_sha256:"",field_baseline:fields,target_baseline:target,source_facts_encrypted:this.sensitive.encrypt(json(proof.source)),version:prior?.version??0,target_version:Number(target.targetVersion),initial_anchor:true};
  }

  private async resolveInitialBaseline(manager: EntityManager, scope: TenantParkScope, sourceSystem: string, item: YuzhouIncrementalItem, prior: ItemRow | undefined, commit?: { operation: OperationRow; actor: JwtPrincipal }): Promise<ItemRow | undefined> {
    if (item.domain === "profile") {
      if (item.initialBaselineWitness) throw new BadRequestException("INITIAL_BASELINE_PROFILE_PROOF_UNAVAILABLE");
      return prior;
    }
    if (prior?.baseline_encrypted) {
      const decoded = this.sensitive.decrypt(prior.baseline_encrypted);
      if (!decoded) throw new ConflictException("Initial baseline cannot be decrypted");
      const baseline = JSON.parse(decoded) as { fields: Record<string, unknown>; target: Record<string, unknown> };
      prior = { ...prior, field_baseline:baseline.fields,target_baseline:baseline.target,initial_anchor:true };
    }
    const unknown = !prior || (Object.keys(prior.field_baseline).length === 0 && Object.keys(prior.target_baseline).length === 0);
    if (!unknown && !item.initialBaselineWitness && !prior?.initial_anchor) return prior;
    const saved = prior ? (await manager.query(`SELECT witness_sha256,provenance_encrypted FROM hr_incremental_initial_baseline WHERE item_id=$1`, [prior.id]))[0] as { witness_sha256:string; provenance_encrypted:string } | undefined : undefined;
    if (!unknown) {
      if (!saved && !item.initialBaselineWitness && isHierarchy(item.domain)) return prior;
      if (!saved || (item.initialBaselineWitness && saved.witness_sha256 !== initialWitnessHash(item.initialBaselineWitness))) throw new ConflictException("INITIAL_BASELINE_ALREADY_KNOWN");
      const savedRaw = this.sensitive.decrypt(saved.provenance_encrypted);
      if (!savedRaw) throw new ConflictException("Initial provenance cannot be decrypted");
      const savedWitness = (JSON.parse(savedRaw) as { witness:YuzhouInitialBaselineWitness }).witness;
      if (initialWitnessHash(savedWitness) !== saved.witness_sha256) throw new ConflictException("Initial provenance hash mismatch");
      const verified = await verifyYuzhouInitialBaseline(manager,scope,item,savedWitness);
      if (prior!.target_id !== savedWitness.targetId || prior!.target_table !== verified.receipt.target_table) throw new ConflictException("INITIAL_BASELINE_BINDING_MISMATCH");
      if(item.domain === "employee") {
        const source=JSON.parse(this.sensitive.decrypt(prior!.source_facts_encrypted)||"{}") as Record<string,unknown>;
        for(const field of ["orgSourceKey","positionSourceKey"]) if(!(field in source)) source[field]=verified.source[field];
        return {...prior!,source_facts_encrypted:this.sensitive.encrypt(json(source))};
      }
      return prior;
    }
    const retained = saved ? this.sensitive.decrypt(saved.provenance_encrypted) : null;
    if (saved && !retained) throw new ConflictException("Initial provenance cannot be decrypted");
    const witness = item.initialBaselineWitness ?? (retained ? (JSON.parse(retained) as { witness:YuzhouInitialBaselineWitness }).witness : undefined);
    if (!witness) return prior;
    if (saved && saved.witness_sha256 !== initialWitnessHash(witness)) throw new ConflictException("INITIAL_BASELINE_ALREADY_ANCHORED");
    const baseline = await verifyYuzhouInitialBaseline(manager,scope,item,witness);
    if (sourceSystem !== "yuzhou-v10" || (prior && (prior.target_id !== witness.targetId || prior.target_table !== baseline.receipt.target_table))) throw new ConflictException("INITIAL_BASELINE_BINDING_MISMATCH");
    const current = await this.readTarget(manager,scope,item.domain,witness.targetId);
    if (prior) {
      const accepted = await manager.query(`SELECT 1 FROM hr_incremental_import_revision WHERE item_id=$1 AND outcome IN ('applied','unchanged') LIMIT 1`, [prior.id]);
      if (accepted[0]) throw new ConflictException("INITIAL_BASELINE_ALREADY_KNOWN");
    }
    if (commit && !prior) {
      const inserted = await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [scope.tenantId,scope.parkId,sourceSystem,item.sourceTable,item.sourceKey,item.domain,baseline.receipt.target_table,witness.targetId,baseline.receipt.source_row_sha256,this.sensitive.encrypt(json(baseline.source)),this.payloadHash(baseline.source),Number(current.targetVersion),commit.operation.id]);
      prior = inserted[0] as ItemRow;
    }
    if (commit && !saved) await manager.query(`INSERT INTO hr_incremental_initial_baseline(item_id,operation_id,original_operation_id,original_phase,source_identity_sha256,target_after_sha256,witness_sha256,provenance_encrypted,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [prior!.id,commit.operation.id,witness.operationId,witness.phase,baseline.receipt.source_identity_sha256,baseline.receipt.target_after_sha256,baseline.witnessSha256,this.sensitive.encrypt(json({ witness, source:baseline.source, target:baseline.target })),commit.actor.sub]);
    // This ephemeral state is original evidence, never a snapshot of today's fields.
    return { id:prior?.id ?? "",target_id:witness.targetId,target_table:baseline.receipt.target_table,last_row_sha256:"",field_baseline:baseline.target,target_baseline:baseline.target,source_facts_encrypted:this.sensitive.encrypt(json(baseline.source)),version:prior?.version ?? 0,target_version:Number(current.targetVersion),initial_anchor:true };
  }

  private async initialMap(manager: EntityManager, scope: TenantParkScope, sourceSystem: string, item: YuzhouIncrementalItem) {
    if (item.domain === "profile" && item.sourceTable === "dbo.person.core_residue") {
      const original = await originalProfile(manager,scope,item);
      if (original) return { table:"hr_employee_profile",id:original.target_id,current:await this.readTarget(manager,scope,item.domain,original.target_id) };
    }
    const targetTable = incrementalTable(item.domain);
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
    if (!rows[0]) {
      if(isHierarchy(item.domain)) {
        const historical=await manager.query(`SELECT 1 FROM legacy_record_map WHERE source_system=$1 AND source_table=$2 AND source_pk_canonical=$3 UNION ALL SELECT 1 FROM hr_yuzhou_production_import_record WHERE source_system=$1 AND source_table=$2 AND source_pk_canonical=$3 LIMIT 1`,[sourceSystem,item.sourceTable,item.sourceKey]);
        if(historical.length) throw new ConflictException("YUZHOU_ORIGINAL_SOURCE_INACTIVE");
      }
      return null;
    }
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
    if (item.domain === "employee" && ["orgSourceKey","positionSourceKey"].some(field=>field in item.fields && json(item.fields[field])!==json(priorSource[field]))) return ["NORMAL_JOB_CHANGE_WORKFLOW_REQUIRED"];
    return ["employeeSourceKey", "employeeSourceTable", "contractTypeId", "orgCode", "positionCode"].filter(field => field in item.fields && json(item.fields[field]) !== json(priorSource[field]));
  }

  private requireNewEmployeeOrganization(item: YuzhouIncrementalItem) {
    // Unassigned preboarding is valid in ordinary employee creation. Existing
    // imported records/replays retain their authenticated historical baseline.
    if (item.domain === "employee" && item.fields.employmentStatus !== "preboarding" && !item.fields.orgSourceKey) throw new BadRequestException("YUZHOU_EMPLOYEE_ORG_REQUIRED");
  }

  private normalizedFields(item: YuzhouIncrementalItem) { const fields = { ...item.fields }; if(item.domain === "employee") { delete fields.orgSourceKey; delete fields.positionSourceKey; } delete fields.employeeSourceKey; delete fields.employeeSourceTable; delete fields.contractTypeId; delete fields.contractStatus; if (item.domain === "profile" && fields.idNumber === null) { Object.assign(fields, { idNumberEncrypted:null, idNumberMasked:null, idNumberFingerprint:null }); delete fields.idNumber; } if (item.domain === "profile" && typeof fields.idNumber === "string") { const normalizedId = fields.idNumber.replace(/\s+/gu, "").toUpperCase(); if (!normalizedId || normalizedId.length > 64) throw new BadRequestException("idNumber is invalid"); const identity = this.sensitive.identityProfile(normalizedId); Object.assign(fields, { idNumberEncrypted: identity.encrypted, idNumberMasked: identity.masked, idNumberFingerprint: identity.hash }); delete fields.idNumber; } return fields; }
  private async createTarget(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, sourceSystem: string, item: YuzhouIncrementalItem) {
    const f = item.fields;
    if (item.domain === "organization" || item.domain === "position") {
      this.required(f,...(item.domain === "organization" ? ["orgCode","orgName","orgType","status"] : ["positionCode","positionName","orgSourceKey","status"]));
      const resolved=await hierarchyFields(manager,scope,actor,item.domain,f,this.scopes(manager));
      await validateHierarchyWrite(manager,scope,actor,item.domain,null,resolved,this.scopes(manager));
      const columns=item.domain === "organization" ? organizationColumns : positionColumns;
      const entries=Object.entries(resolved),table=incrementalTable(item.domain);
      const inserted=await manager.query(`INSERT INTO ${table}(tenant_id,park_id,create_by,update_by,version,${entries.map(([key])=>columns[key]).join(",")}) VALUES($1,$2,$3,$3,1,${entries.map((_,i)=>`$${i+4}`).join(",")}) RETURNING id`,[scope.tenantId,scope.parkId,actor.sub,...entries.map(([,value])=>value)]);
      return {table,id:inserted[0].id as string};
    }
    if (item.domain === "employee") { this.requireNewEmployeeOrganization(item); this.required(f, "employeeCode", "fullName", "employmentStatus"); if (typeof f.employmentStatus !== "string" || !HR_EMPLOYEE_STATUSES.includes(f.employmentStatus as typeof HR_EMPLOYEE_STATUSES[number])) throw new BadRequestException("employmentStatus must be an approved source-state mapping"); const assignment = "orgSourceKey" in f ? await hierarchyFields(manager,scope,actor,item.domain,{orgSourceKey:f.orgSourceKey,positionSourceKey:f.positionSourceKey??null},this.scopes(manager)) : {}; if("orgSourceKey" in f && !assignment.orgSourceKey) throw new BadRequestException("YUZHOU_EMPLOYEE_ORG_REQUIRED"); const r = await manager.query(`INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,employment_type,employment_status,hire_date,work_location,work_mobile,work_email,create_by,update_by,version,primary_org_id,position_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,1,$12,$13) RETURNING id`, [scope.tenantId,scope.parkId,f.employeeCode,f.fullName,f.employmentType ?? "full_time",f.employmentStatus,f.hireDate ?? null,f.workLocation ?? null,f.workMobile ?? null,f.workEmail ?? null,actor.sub,assignment.orgSourceKey??null,assignment.positionSourceKey??null]); return { table: "hr_employee", id: r[0]!.id }; }
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
  private async readTarget(manager: EntityManager, scope: TenantParkScope, domain: YuzhouIncrementalItem["domain"], id: string) { const table = incrementalTable(domain); const dates = isHierarchy(domain) ? [] : domain === "employee" ? ["hire_date"] : domain === "profile" ? ["date_of_birth"] : ["start_date", "end_date", "probation_end_date"]; const dateProjection = dates.map(column => `to_char(${column},'YYYY-MM-DD') AS ${column}`).join(","); const rows = await manager.query(`SELECT *${dateProjection ? `,${dateProjection}` : ""} FROM ${table} WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false`, [id,scope.tenantId,scope.parkId]); if (!rows[0]) throw new ConflictException("Incremental target no longer exists"); const row = rows[0] as Record<string, unknown>; const columns: Record<string,string> = { ...(domain === "organization" ? organizationColumns : domain === "position" ? positionColumns : {}),employeeCode:"employee_code",fullName:"full_name",employmentStatus:"employment_status",employmentType:"employment_type",hireDate:"hire_date",workLocation:"work_location",workMobile:"work_mobile",workEmail:"work_email",englishName:"english_name",gender:"gender",dateOfBirth:"date_of_birth",personalMobile:"personal_mobile",personalEmail:"personal_email",address:"address",nativePlace:"native_place",degree:"degree",idNumberEncrypted:"id_number_encrypted",idNumberMasked:"id_number_masked",idNumberFingerprint:"id_number_fingerprint",contractNo:"contract_no",startDate:"start_date",endDate:"end_date",probationEndDate:"probation_end_date",workType:"work_type",positionTitle:"position_title",targetVersion:"version",targetStatus:"status" }; return Object.fromEntries(Object.entries(columns).map(([field,column]) => [field,row[column]])); }
  private async writeTarget(manager: EntityManager, scope: TenantParkScope, actor: JwtPrincipal, domain: YuzhouIncrementalItem["domain"], id: string, fields: Record<string, unknown>, expectedVersion?: number) { if (!Object.keys(fields).length) return []; const current = await this.readTarget(manager, scope, domain, id); if (domain === "contract" && current.targetStatus !== "draft") throw new ConflictException("Only a draft contract can be updated by incremental import"); if (domain === "contract") await this.validateContractWrite(manager, scope, { ...current, ...fields }, undefined, id); if(domain === "organization" || domain === "position") { fields=await hierarchyFields(manager,scope,actor,domain,fields,this.scopes(manager)); await validateHierarchyWrite(manager,scope,actor,domain,id,{...current,...fields},this.scopes(manager)); } const columns: Record<string, string> = { ...(domain === "organization" ? organizationColumns : domain === "position" ? positionColumns : {}),employeeCode:"employee_code",fullName:"full_name",employmentStatus:"employment_status",employmentType:"employment_type",hireDate:"hire_date",workLocation:"work_location",workMobile:"work_mobile",workEmail:"work_email",englishName:"english_name",gender:"gender",dateOfBirth:"date_of_birth",personalMobile:"personal_mobile",personalEmail:"personal_email",address:"address",nativePlace:"native_place",degree:"degree",idNumberEncrypted:"id_number_encrypted",idNumberMasked:"id_number_masked",idNumberFingerprint:"id_number_fingerprint",contractNo:"contract_no",startDate:"start_date",endDate:"end_date",probationEndDate:"probation_end_date",workType:"work_type",positionTitle:"position_title" }; const entries = Object.entries(fields); if (!entries.length) return []; const table = incrementalTable(domain); const params: unknown[] = [id,scope.tenantId,scope.parkId,actor.sub]; const sets = entries.map(([key,value],index) => { params.push(value); return `${columns[key]}=$${index+5}`; }); const versionCheck = expectedVersion === undefined ? "" : ` AND version=$${params.push(expectedVersion)}`; const updated = await manager.query(`UPDATE ${table} SET ${sets.join(",")},update_by=$4,update_time=now(),version=version+1 WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false${versionCheck} RETURNING id,version`, params); const rows = typeormQueryRows<{id:string;version:number}>(updated); if (rows.length !== 1 || !rows[0]?.id || (expectedVersion!==undefined && rows[0].version!==expectedVersion+1)) throw new ConflictException("Incremental target changed concurrently"); if (domain === "contract") await this.appendIncrementalContractAction(manager,scope,id,actor.sub,"updated","draft"); return entries.map(([field]) => ({ field })); }
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

  private scopes(manager:EntityManager) {
    return this.dataScopes instanceof DataScopeService ? new DataScopeService(manager.getRepository(DataScopeRuleEntity),manager.getRepository(RoleDataScopeEntity),manager.getRepository(RoleEntity),manager.getRepository(UserRoleEntity)) : this.dataScopes;
  }

  private async prepareHierarchy(manager:EntityManager,scope:TenantParkScope,actor:JwtPrincipal,items:readonly YuzhouIncrementalItem[]) {
    if(!items.some(item=>isHierarchy(item.domain)||"orgSourceKey" in item.fields||"positionSourceKey" in item.fields)) return;
    await lockOrgHierarchy(manager,scope);
    const staged=new Map(items.map(item=>[`${item.domain}:${item.sourceKey}`,item]));
    const checked=new Set<string>();
    const inspect=async(item:YuzhouIncrementalItem):Promise<void>=>{
      const key=`${item.domain}:${item.sourceKey}`; if(checked.has(key)) return; checked.add(key);
      const ledger=(await manager.query(`SELECT target_id,source_facts_encrypted FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND domain=$3 AND source_table=$4 AND source_key=$5`,[scope.tenantId,scope.parkId,item.domain,item.sourceTable,item.sourceKey]))[0];
      // Probe source-binding metadata only until the exact action is authorized.
      // Target rows, original witnesses and parent visibility must not leak first.
      if(item.domain === "organization" && !actor.isSuper && !actor.permissions.includes("*")) {
        const existing=ledger || item.initialBaselineWitness || (await manager.query(`SELECT 1 FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table=$1 AND source_pk_canonical=$2 AND target_table='sys_org' UNION ALL SELECT 1 FROM hr_yuzhou_production_import_record WHERE source_system='yuzhou-v10' AND source_table=$1 AND source_pk_canonical=$2 AND target_table='sys_org' LIMIT 1`,[item.sourceTable,item.sourceKey]))[0];
        if(!actor.permissions.includes(existing ? SYSTEM_PERMISSIONS.ORG_UPDATE : SYSTEM_PERMISSIONS.ORG_CREATE)) throw new ForbiddenException("YUZHOU_ORGANIZATION_ACTION_PERMISSION_REQUIRED");
      }
      const oldSource=ledger?JSON.parse(this.sensitive.decrypt(ledger.source_facts_encrypted)||"{}") as Record<string,unknown>:item.initialBaselineWitness?(await verifyYuzhouInitialBaseline(manager,scope,item,item.initialBaselineWitness)).source:{};
      if(ledger&&isHierarchy(item.domain)) { const current=await this.readTarget(manager,scope,item.domain,ledger.target_id); await assertOrgVisible(actor,item.domain==="organization"?ledger.target_id:current.orgSourceKey as string,this.scopes(manager)); }
      for(const [field,domain] of [["parentSourceKey","organization"],["orgSourceKey","organization"],["parentPositionSourceKey","position"],["positionSourceKey","position"]] as const) {
        if(item.domain === "employee" && (ledger || item.initialBaselineWitness)) continue;
        const value=item.fields[field]; if(value===undefined||value===null||json(value)===json(oldSource[field])) continue;
        const dependency=staged.get(`${domain}:${value}`);
        if(dependency) { if(dependency.fields.status === "disabled") throw new BadRequestException("YUZHOU_DEPENDENCY_UNAVAILABLE"); await inspect(dependency); }
        else await sourceHierarchyTarget(manager,scope,actor,domain,value,this.scopes(manager));
      }
      if(isHierarchy(item.domain)) {
        const map=await this.initialMap(manager,scope,"yuzhou-v10",item);
        if(map) await assertOrgVisible(actor,item.domain==="organization"?map.id:map.current.orgSourceKey as string,this.scopes(manager));
        else if(!ledger&&item.domain==="organization"&&!item.fields.parentSourceKey) await assertOrgVisible(actor,null,this.scopes(manager));
      }
    };
    for(const item of items) await inspect(item);
  }

  private requirePackagePermissions(actor: JwtPrincipal, items: readonly YuzhouIncrementalItem[], access: "read" | "manage") {
    for (const domain of new Set(items.map(item => item.domain))) this.requireDomainPermission(actor, domain, access);
  }
  private requireDomainPermission(actor: JwtPrincipal, domain: YuzhouIncrementalItem["domain"], access: "read" | "manage" = "manage") {
    if(domain === "insurance_policy") {
      const required=access==="manage" ? YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE : YUZHOU_INSURANCE_POLICY_IMPORT_MANAGE.slice(0,2);
      if(!actor.isSuper && !actor.permissions.includes("*") && required.some(p=>!actor.permissions.includes(p))) throw new ForbiddenException("INSURANCE_POLICY_IMPORT_PERMISSION_REQUIRED");
      return;
    }
    if(domain === "training_history") {
      const manages=[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE,HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE];
      const allowed=manages.every(p=>actor.permissions.includes(p)) || (access==="read" && actor.permissions.includes(HR_PERMISSIONS.HR_TRAINING_READ));
      if(!actor.isSuper && !actor.permissions.includes("*") && !allowed)throw new ForbiddenException("TRAINING_IMPORT_PERMISSION_REQUIRED");
      return;
    }
    if(domain === "organization") { const required=access === "manage" ? [SYSTEM_PERMISSIONS.ORG_CREATE,SYSTEM_PERMISSIONS.ORG_UPDATE] : [SYSTEM_PERMISSIONS.ORG_LIST,SYSTEM_PERMISSIONS.ORG_UPDATE,SYSTEM_PERMISSIONS.ORG_CREATE]; if(!actor.isSuper && !actor.permissions.includes("*") && required.every(p=>!actor.permissions.includes(p))) throw new ForbiddenException("YUZHOU_ORGANIZATION_PERMISSION_REQUIRED"); return; }
    const managePermission = ["family","skill","credential"].includes(domain) ? HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE : domain === "position" ? HR_PERMISSIONS.HR_POSITION_MANAGE : domain === "employee" ? HR_PERMISSIONS.HR_EMPLOYEE_MANAGE : domain === "profile" ? HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE : HR_PERMISSIONS.HR_CONTRACT_MANAGE;
    const readPermission = domain === "skill" ? HR_PERMISSIONS.HR_EMPLOYEE_RECORD_READ : domain === "credential" ? HR_PERMISSIONS.HR_EMPLOYEE_CREDENTIAL_READ : domain === "family" ? HR_PERMISSIONS.HR_EMPLOYEE_FAMILY_READ : domain === "position" ? HR_PERMISSIONS.HR_POSITION_READ : domain === "employee" ? HR_PERMISSIONS.HR_EMPLOYEE_READ : domain === "profile" ? HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_READ : HR_PERMISSIONS.HR_CONTRACT_READ;
    const allowed = access === "manage" ? [managePermission] : [readPermission, managePermission];
    if (!actor.isSuper && !actor.permissions.includes("*") && !allowed.some(permission => actor.permissions.includes(permission))) throw new ForbiddenException(`${allowed[0]} permission is required`);
  }
  private payloadHash(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
  private async revision(manager: EntityManager, operationId: string, itemId: string, _revision: number, outcome: "applied"|"unchanged"|"conflict", digest: string, diff: unknown, before: unknown, after: unknown) { const rows = await manager.query(`SELECT coalesce(max(revision_no),0)+1 AS next_revision FROM hr_incremental_import_revision WHERE item_id=$1`, [itemId]) as Array<{next_revision:number}>; await manager.query(`INSERT INTO hr_incremental_import_revision(operation_id,item_id,revision_no,outcome,source_row_sha256,field_diff,before_receipt,after_receipt) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb)`, [operationId,itemId,Number(rows[0]!.next_revision),outcome,digest,json(diff),json({ encrypted:this.sensitive.encrypt(json(before)) }),json({ encrypted:this.sensitive.encrypt(json(after)) })]); return outcome; }
  private required(fields: Record<string, unknown>, ...names: string[]) { for (const name of names) if (typeof fields[name] !== "string" || !String(fields[name]).trim()) throw new BadRequestException(`${name} is required`); }
  private canonicalPackage(dto: PreviewYuzhouIncrementalImportDto) {
    try { return canonicalYuzhouIncrementalPackage(dto); }
    catch (error) {
      if (error instanceof Error && ["YUZHOU_SOURCE_DEPENDENCY_CYCLE","YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE"].includes(error.message)) throw new BadRequestException(error.message);
      throw error;
    }
  }
  private packageHash(value: unknown) { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
}
