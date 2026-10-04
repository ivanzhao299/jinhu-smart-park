import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import type { TenantParkScope, YuzhouIncrementalItem } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { DataScopeService } from "../data-scopes/data-scope.service";
import { originalReceipt } from "./hr-yuzhou-initial-baseline";

export const organizationColumns: Record<string, string> = {
  orgCode:"org_code", orgName:"org_name", orgType:"org_type", sortOrder:"sort_order", status:"status", remark:"remark",
  contactPhone:"contact_phone", plannedHeadcount:"planned_headcount", legacySourceId:"legacy_source_id",
  legacyHierarchyLevel:"legacy_hierarchy_level", legacyManagerReference:"legacy_manager_reference", parentSourceKey:"parent_id",
};
export const positionColumns: Record<string, string> = {
  positionCode:"position_code",positionName:"position_name",jobFamily:"job_family",jobLevel:"job_level",headcountLimit:"headcount_limit",
  status:"status",remark:"remark",authority:"authority",legacyDepartmentReference:"legacy_department_reference",
  legacyParentReference:"legacy_parent_reference",legacySourceId:"legacy_source_id",legacyUptoCode:"legacy_upto_code",
  positionManual:"position_manual",qualification:"qualification",responsibilities:"responsibilities",hierarchyLevel:"hierarchy_level",
  sortOrder:"sort_order",orgSourceKey:"org_id",parentPositionSourceKey:"reports_to_position_id",
};
export const incrementalTable = (domain:YuzhouIncrementalItem["domain"]) => {
  if(domain === "training_history")throw new BadRequestException("TRAINING_IMPORT_EXECUTOR_REQUIRED");
  return ({organization:"sys_org",position:"hr_position",employee:"hr_employee",profile:"hr_employee_profile",contract:"hr_contract",family:"hr_employee_family",skill:"hr_employee_skill",credential:"hr_employee_credential"})[domain];
};
export const isHierarchy = (domain:string) => domain === "organization" || domain === "position";

export async function assertOrgVisible(actor:JwtPrincipal, id:string|null, scopes?:DataScopeService) {
  if (actor.isSuper || actor.permissions.includes("*")) return;
  if (!scopes) throw new ForbiddenException("YUZHOU_ORGANIZATION_SCOPE_UNAVAILABLE");
  const filter = await scopes.buildScopeFilter(actor,"org");
  if (!filter.unrestricted && (!id || !filter.allowed_ids.includes(id))) throw new ForbiddenException("YUZHOU_ORGANIZATION_UNAVAILABLE");
}


async function authenticateHierarchyChain(manager:EntityManager,scope:TenantParkScope,operationId:string,identity:string,table:string,visiting=new Set<string>()):Promise<void> {
  if(visiting.has(identity)) throw new ConflictException("YUZHOU_ORIGINAL_HIERARCHY_CYCLE");
  visiting.add(identity);
  const receipt=await originalReceipt(manager,scope,operationId,"T0",identity);
  if(receipt.target_table!==table) throw new ConflictException("YUZHOU_DEPENDENCY_EVIDENCE_INVALID");
  const dependencies=await manager.query(`SELECT * FROM hr_yuzhou_production_import_record_dependency WHERE operation_id=$1 AND phase='T0' AND source_identity_sha256=$2 FOR SHARE`,[operationId,identity]);
  const allowed:Record<string,string>=table==="sys_org"?{parent_org:"sys_org"}:{org:"sys_org",parent_position:"hr_position"};
  if((table==="hr_position"&&dependencies.filter((d:{dependency_role:string})=>d.dependency_role==="org").length!==1)||dependencies.some((d:{dependency_role:string;expected_target_table:string;depends_on_phase:string})=>allowed[d.dependency_role]!==d.expected_target_table||d.depends_on_phase!=="T0")) throw new ConflictException("YUZHOU_DEPENDENCY_EVIDENCE_INVALID");
  for(const d of dependencies) await authenticateHierarchyChain(manager,scope,operationId,d.depends_on_source_identity_sha256,d.expected_target_table,visiting);
  visiting.delete(identity);
}

/** A source map is accepted only with its successful immutable owner chain. */
export async function sourceHierarchyTarget(manager:EntityManager, scope:TenantParkScope, actor:JwtPrincipal, domain:"organization"|"position", key:unknown, scopes?:DataScopeService) {
  if (typeof key !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(key)) throw new BadRequestException("YUZHOU_DEPENDENCY_KEY_INVALID");
  const table=incrementalTable(domain), sourceTable=domain==="organization"?"dbo.departmentcode":"dbo.job";
  const ledger=await manager.query(`SELECT i.target_id,b.original_operation_id FROM hr_incremental_import_item i LEFT JOIN hr_incremental_initial_baseline b ON b.item_id=i.id WHERE i.tenant_id=$1 AND i.park_id=$2 AND i.source_system='yuzhou-v10' AND i.source_table=$3 AND i.source_key=$4 AND i.domain=$5 AND i.target_table=$6 AND EXISTS (SELECT 1 FROM hr_incremental_import_revision r WHERE r.item_id=i.id AND r.outcome IN ('applied','unchanged')) FOR SHARE OF i`,[scope.tenantId,scope.parkId,sourceTable,key,domain,table]);
  let id=ledger[0]?.target_id;
  if (ledger.length>1) throw new ConflictException("YUZHOU_DEPENDENCY_AMBIGUOUS");
  if(id && ledger[0]?.original_operation_id) {
    const receipt=await originalReceipt(manager,scope,ledger[0].original_operation_id,"T0",key.slice(7));
    if(receipt.target_id!==id) throw new ConflictException("YUZHOU_DEPENDENCY_EVIDENCE_INVALID");
    await authenticateHierarchyChain(manager,scope,ledger[0].original_operation_id,key.slice(7),table);
  }
  if (!id) {
    const records=await manager.query(`SELECT r.operation_id FROM hr_yuzhou_production_import_record r JOIN legacy_record_map m ON m.source_system=r.source_system AND m.source_table=r.source_table AND m.source_pk_canonical=r.source_pk_canonical AND m.target_id=r.target_id WHERE r.source_system='yuzhou-v10' AND r.phase='T0' AND r.source_table=$1 AND r.source_identity_sha256=$2 AND r.target_table=$3 AND m.is_active=true`,[sourceTable,key.slice(7),table]);
    if (records.length!==1) throw new BadRequestException("YUZHOU_DEPENDENCY_UNAVAILABLE");
    const receipt=await originalReceipt(manager,scope,records[0].operation_id,"T0",key.slice(7));
    if(receipt.target_table!==table || receipt.source_table!==sourceTable) throw new ConflictException("YUZHOU_DEPENDENCY_EVIDENCE_INVALID");
    await authenticateHierarchyChain(manager,scope,records[0].operation_id,key.slice(7),table);
    id=receipt.target_id;
  }
  const rows=await manager.query(`SELECT id,${domain==="position"?"org_id,":""}status FROM ${table} WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status='enabled' FOR SHARE`,[id,scope.tenantId,scope.parkId]);
  if(rows.length!==1) throw new BadRequestException("YUZHOU_DEPENDENCY_UNAVAILABLE");
  await assertOrgVisible(actor,domain==="organization"?id:rows[0].org_id,scopes);
  return rows[0] as {id:string;org_id?:string};
}

/** Caller holds the ordinary organization hierarchy lock before these reads. */
export async function hierarchyFields(manager:EntityManager, scope:TenantParkScope, actor:JwtPrincipal, domain:YuzhouIncrementalItem["domain"], fields:Record<string,unknown>, scopes?:DataScopeService) {
  const result={...fields};
  for (const [field,dep] of [["parentSourceKey","organization"],["orgSourceKey","organization"],["parentPositionSourceKey","position"],["positionSourceKey","position"]] as const) {
    if (!(field in fields)) continue;
    result[field]=fields[field]===null?null:(await sourceHierarchyTarget(manager,scope,actor,dep,fields[field],scopes)).id;
  }
  if(domain==="employee" && result.positionSourceKey) {
    const rows=await manager.query(`SELECT org_id FROM hr_position WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status='enabled' FOR SHARE`,[result.positionSourceKey,scope.tenantId,scope.parkId]);
    if(rows[0]?.org_id!==result.orgSourceKey) throw new BadRequestException("YUZHOU_EMPLOYEE_POSITION_ORG_MISMATCH");
  }
  return result;
}

export async function validateHierarchyWrite(manager:EntityManager,scope:TenantParkScope,actor:JwtPrincipal,domain:"organization"|"position",id:string|null,fields:Record<string,unknown>,scopes?:DataScopeService) {
  const table=incrementalTable(domain),parentColumn=domain==="organization"?"parent_id":"reports_to_position_id";
  const parent=fields[domain==="organization"?"parentSourceKey":"parentPositionSourceKey"] as string|null;
  const org=domain==="organization"?id??parent:fields.orgSourceKey as string|null;
  await assertOrgVisible(actor,org,scopes);
  if(domain==="position") {
    const owner=await manager.query(`SELECT id FROM sys_org WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status='enabled' FOR SHARE`,[org,scope.tenantId,scope.parkId]);
    if(!owner[0]) throw new BadRequestException("YUZHOU_DEPENDENCY_UNAVAILABLE");
  }
  let cursor=parent;const visited=new Set<string>();
  while(cursor) {
    if(cursor===id||visited.has(cursor)) throw new BadRequestException("YUZHOU_HIERARCHY_CYCLE");
    visited.add(cursor);
    const rows=await manager.query(`SELECT ${parentColumn} AS parent,${domain==="position"?"org_id,":""}id FROM ${table} WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status='enabled' FOR SHARE`,[cursor,scope.tenantId,scope.parkId]);
    if(!rows[0]) throw new BadRequestException("YUZHOU_DEPENDENCY_UNAVAILABLE");
    await assertOrgVisible(actor,domain==="organization"?cursor:rows[0].org_id,scopes);
    cursor=rows[0].parent;
  }
  if(id&&fields.status!=="enabled") {
    const children=await manager.query(`SELECT 1 FROM ${table} WHERE ${parentColumn}=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false LIMIT 1`,[id,scope.tenantId,scope.parkId]);
    if(children.length) throw new ConflictException("YUZHOU_HIERARCHY_HAS_CHILDREN");
  }
}
