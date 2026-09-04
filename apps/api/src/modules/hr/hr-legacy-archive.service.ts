import { ForbiddenException,Injectable,NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS,type PaginatedResult,type TenantParkScope } from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { HrLegacyArchiveQueryDto } from "./dto/hr-legacy-archive.dto";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

type ArchiveAccess="park"|"managed_org_tree"|"self"|"none";
type RawRow=Record<string,unknown>;

export interface HrLegacyArchiveProjection {
  id:string;
  employeeId:string|null;
  mappingStatus:string;
  recordType:string;
  occurredOn:string|null;
  displayTitle:string;
  projection:Record<string,unknown>;
  hasSensitiveSource:boolean;
  sourceSystem?:string;
  sourceTable?:string;
  resolutionReasonCode?:string|null;
}

@Injectable()
export class HrLegacyArchiveService {
  constructor(private readonly dataSource:DataSource,private readonly auditService:AuditService){}

  async list(scope:TenantParkScope,actor:JwtPrincipal,query:HrLegacyArchiveQueryDto):Promise<PaginatedResult<HrLegacyArchiveProjection>> {
    return this.listInternal(scope,actor,query,false);
  }

  async listUnclaimed(scope:TenantParkScope,actor:JwtPrincipal,query:HrLegacyArchiveQueryDto):Promise<PaginatedResult<HrLegacyArchiveProjection>> {
    if(!this.has(actor,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_UNCLAIMED_READ))throw new ForbiddenException("Legacy unclaimed archive permission is required");
    return this.listInternal(scope,actor,query,true);
  }

  async detail(scope:TenantParkScope,actor:JwtPrincipal,id:string) {
    const access=this.resolveAccess(actor);
    if(access==="none")throw new NotFoundException("Legacy archive record not found");
    const params:unknown[]=[scope.tenantId,scope.parkId,id];
    const accessSql=this.accessSql(access,actor,params,"registry");
    const rows=await this.dataSource.query(
      `SELECT archive.id,registry.owner_employee_id AS "employeeId",registry.mapping_status AS "mappingStatus",
        registry.source_system AS "sourceSystem",registry.source_table AS "sourceTable",registry.resolution_reason_code AS "resolutionReasonCode",
        archive.record_type AS "recordType",archive.occurred_on AS "occurredOn",archive.display_title AS "displayTitle",
        archive.display_safe_projection AS "displaySafeProjection",
        archive.restricted_safe_projection||CASE WHEN source.record_payload IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('legacyFields',hr_legacy_archive_redact_source_fields(source.record_payload)) END AS "restrictedSafeProjection",
        archive.encrypted_source_object_ref IS NOT NULL AS "hasSensitiveSource"
       FROM hr_legacy_archive_record archive
       JOIN hr_legacy_identity_registry registry ON registry.id=archive.identity_registry_id
        AND registry.tenant_id=archive.tenant_id AND registry.park_id=archive.park_id AND registry.identity_kind='archive_record'
       LEFT JOIN hr_legacy_archive_materialization_batch materialization ON materialization.id=registry.materialization_batch_id
        AND materialization.tenant_id=registry.tenant_id AND materialization.park_id=registry.park_id
       LEFT JOIN hr_legacy_t5_record source ON source.import_batch_id=materialization.source_t5_import_batch_id
        AND source.tenant_id=registry.tenant_id AND source.park_id=registry.park_id
        AND source.source_table=registry.source_table AND source.source_identity_sha256=registry.source_identity_sha256
       WHERE archive.tenant_id=$1 AND archive.park_id=$2 AND archive.id=$3 ${accessSql}`,
      params,
    ) as RawRow[];
    if(!rows[0])throw new NotFoundException("Legacy archive record not found");
    const files=await this.dataSource.query(
      `SELECT logical.id,logical.logical_kind AS "logicalKind",logical.logical_name AS "logicalName",
        blob.media_type AS "mediaType",blob.size_bytes AS "sizeBytes",blob.availability,
        blob.content_sha256 AS "contentSha256"
       FROM hr_legacy_file_logical_record logical
       JOIN hr_legacy_identity_registry file_registry ON file_registry.id=logical.identity_registry_id
        AND file_registry.tenant_id=logical.tenant_id AND file_registry.park_id=logical.park_id AND file_registry.identity_kind='file_logical'
       JOIN hr_legacy_archive_record parent_archive ON parent_archive.id=logical.archive_record_id
        AND parent_archive.tenant_id=logical.tenant_id AND parent_archive.park_id=logical.park_id
       JOIN hr_legacy_identity_registry parent_registry ON parent_registry.id=parent_archive.identity_registry_id
        AND parent_registry.tenant_id=parent_archive.tenant_id AND parent_registry.park_id=parent_archive.park_id
        AND parent_registry.owner_employee_id IS NOT DISTINCT FROM file_registry.owner_employee_id
       LEFT JOIN hr_legacy_file_blob_object blob ON blob.id=logical.blob_object_id
        AND blob.tenant_id=logical.tenant_id AND blob.park_id=logical.park_id
       WHERE logical.tenant_id=$1 AND logical.park_id=$2 AND logical.archive_record_id=$3
       ORDER BY logical.display_order,logical.id`,
      [scope.tenantId,scope.parkId,id],
    ) as RawRow[];
    const canReadSensitive=this.has(actor,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SENSITIVE_READ);
    await this.audit(scope,actor,"读取旧系统资料详情","/hr/legacy-archive/:id",access,1,{bizId:id,includeLegacyProjection:canReadSensitive});
    return {...this.project(rows[0],canReadSensitive,{includeRestricted:true}),files:files.map(file=>this.projectFile(file,canReadSensitive))};
  }

  private async listInternal(scope:TenantParkScope,actor:JwtPrincipal,query:HrLegacyArchiveQueryDto,unclaimedOnly:boolean):Promise<PaginatedResult<HrLegacyArchiveProjection>> {
    const access=unclaimedOnly?"park":this.resolveAccess(actor);
    if(access==="none")return this.auditedEmpty(scope,actor,query,unclaimedOnly);
    const params:unknown[]=[scope.tenantId,scope.parkId];
    const predicates=["archive.tenant_id=$1","archive.park_id=$2"];
    if(unclaimedOnly)predicates.push("registry.owner_employee_id IS NULL","registry.mapping_status IN ('archive_only','quarantine')");
    else {
      const accessPredicate=this.accessSql(access,actor,params,"registry").replace(/^ AND /u,"");
      if(accessPredicate)predicates.push(accessPredicate);
    }
    if(query.status){params.push(query.status);predicates.push(`registry.mapping_status=$${params.length}`);}
    if(query.record_type){params.push(query.record_type);predicates.push(`archive.record_type=$${params.length}`);}
    if(query.employee_id){params.push(query.employee_id);predicates.push(`registry.owner_employee_id=$${params.length}`);}
    if(query.keyword){params.push(`%${query.keyword}%`);predicates.push(`archive.display_title ILIKE $${params.length}`);}
    params.push(query.page_size,(query.page-1)*query.page_size);
    const rows=await this.dataSource.query(
      `SELECT archive.id,registry.owner_employee_id AS "employeeId",registry.mapping_status AS "mappingStatus",
        registry.source_system AS "sourceSystem",registry.source_table AS "sourceTable",registry.resolution_reason_code AS "resolutionReasonCode",
        archive.record_type AS "recordType",archive.occurred_on AS "occurredOn",archive.display_title AS "displayTitle",
        archive.display_safe_projection AS "displaySafeProjection",
        archive.encrypted_source_object_ref IS NOT NULL AS "hasSensitiveSource",count(*) OVER() AS "totalCount"
       FROM hr_legacy_archive_record archive
       JOIN hr_legacy_identity_registry registry ON registry.id=archive.identity_registry_id
        AND registry.tenant_id=archive.tenant_id AND registry.park_id=archive.park_id AND registry.identity_kind='archive_record'
       WHERE ${predicates.join(" AND ")}
       ORDER BY archive.occurred_on DESC NULLS LAST,archive.id
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params,
    ) as RawRow[];
    const canReadSensitive=this.has(actor,HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SENSITIVE_READ);
    const items=rows.map(row=>this.project(row,canReadSensitive,{includeRestricted:false}));
    const total=rows[0]?Number(rows[0].totalCount):0;
    await this.audit(scope,actor,unclaimedOnly?"读取待认领旧档案":"读取旧系统资料",unclaimedOnly?"/hr/legacy-archive/unclaimed":"/hr/legacy-archive",access,items.length);
    return {items,total,page:query.page,page_size:query.page_size};
  }

  private accessSql(access:ArchiveAccess,actor:JwtPrincipal,params:unknown[],alias:string):string {
    if(access==="park")return "";
    if(access==="managed_org_tree"){
      params.push(actor.sub);
      const actorIndex=params.length;
      return ` AND ${alias}.owner_employee_id IN (
        WITH RECURSIVE managed_org AS (
          SELECT id FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND leader_user_id=$${actorIndex} AND is_deleted=false AND status='enabled'
          UNION
          SELECT child.id FROM sys_org child JOIN managed_org parent ON child.parent_id=parent.id
          WHERE child.tenant_id=$1 AND child.park_id=$2 AND child.is_deleted=false AND child.status='enabled'
        ) SELECT employee.id FROM hr_employee employee
          WHERE employee.tenant_id=$1 AND employee.park_id=$2 AND employee.primary_org_id IN(SELECT id FROM managed_org) AND employee.is_deleted=false
        UNION SELECT self_employee.id FROM hr_employee self_employee
          WHERE self_employee.tenant_id=$1 AND self_employee.park_id=$2 AND self_employee.user_id=$${actorIndex} AND self_employee.is_deleted=false
      )`;
    }
    params.push(actor.sub);
    return ` AND ${alias}.owner_employee_id=(SELECT employee.id FROM hr_employee employee WHERE employee.tenant_id=$1 AND employee.park_id=$2 AND employee.user_id=$${params.length} AND employee.is_deleted=false)`;
  }

  private resolveAccess(actor:JwtPrincipal):ArchiveAccess {
    if(actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_READ))return "park";
    if(actor.permissions.includes(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_TEAM_READ))return "managed_org_tree";
    if(actor.permissions.includes(HR_PERMISSIONS.HR_LEGACY_ARCHIVE_SELF_READ))return "self";
    return "none";
  }

  private project(row:RawRow,canReadSensitive:boolean,{includeRestricted}:{includeRestricted:boolean}):HrLegacyArchiveProjection {
    const publicProjection=this.object(row.displaySafeProjection);
    const restricted=canReadSensitive&&includeRestricted?this.object(row.restrictedSafeProjection):{};
    const base:HrLegacyArchiveProjection={
      id:String(row.id),employeeId:row.employeeId?String(row.employeeId):null,mappingStatus:String(row.mappingStatus),
      recordType:String(row.recordType),occurredOn:row.occurredOn?String(row.occurredOn).slice(0,10):null,
      displayTitle:String(row.displayTitle),projection:{...publicProjection,...restricted},hasSensitiveSource:Boolean(row.hasSensitiveSource),
    };
    return canReadSensitive?{...base,sourceSystem:String(row.sourceSystem),sourceTable:String(row.sourceTable),resolutionReasonCode:row.resolutionReasonCode?String(row.resolutionReasonCode):null}:base;
  }

  private projectFile(row:RawRow,canReadSensitive:boolean) {
    const base={id:String(row.id),logicalKind:String(row.logicalKind),logicalName:String(row.logicalName),mediaType:row.mediaType?String(row.mediaType):null,sizeBytes:row.sizeBytes?String(row.sizeBytes):null,availability:row.availability?String(row.availability):"missing"};
    return canReadSensitive&&row.contentSha256?{...base,contentFingerprint:String(row.contentSha256)}:base;
  }

  private object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
  private has(actor:JwtPrincipal,permission:string){return Boolean(actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(permission));}
  private async audit(scope:TenantParkScope,actor:JwtPrincipal,action:string,path:string,projection:ArchiveAccess,itemCount:number,options:{bizId?:string;includeLegacyProjection?:boolean}={}){
    await recordHrSensitiveRead(this.auditService,scope,actor,{resource:"hr.legacy_archive",action,bizType:"hr_legacy_archive_record",bizId:options.bizId,path,fieldGroups:options.includeLegacyProjection?["identity","attachment","legacy_projection"]:["identity","attachment"],projection:projection==="none"?"metadata":projection,itemCount});
  }
  private async auditedEmpty(scope:TenantParkScope,actor:JwtPrincipal,query:HrLegacyArchiveQueryDto,unclaimedOnly:boolean){
    await this.audit(scope,actor,unclaimedOnly?"读取待认领旧档案":"读取旧系统资料",unclaimedOnly?"/hr/legacy-archive/unclaimed":"/hr/legacy-archive","none",0);
    return {items:[],total:0,page:query.page,page_size:query.page_size};
  }
}
