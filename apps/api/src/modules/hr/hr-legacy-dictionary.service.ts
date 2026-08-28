import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PaginatedResult,TenantParkScope } from "@jinhu/shared";
import { DataSource,type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type {
  ApproveHrLegacyDictionaryDto,
  CreateHrLegacyDictionaryDraftDto,
  HrLegacyDictionaryItemInputDto,
  HrLegacyDictionaryListQueryDto,
  UpdateHrLegacyDictionaryItemDto,
} from "./dto/hr-legacy-dictionary.dto";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

type RawRow=Record<string,unknown>;

const targetContracts:Record<string,{domain:string;values:readonly string[]|null}>={
  employee_job_state:{domain:"employment_status",values:["active","probation","suspended","departed"]},
  employment_event_type:{domain:"employment_event_type",values:["start_probation","confirm_employment","transfer","suspend","depart","resume"]},
  employment_event_state:{domain:"migration_decision",values:["accepted"]},
  contract_type:{domain:"contract_type_code",values:null},
  contract_state:{domain:"contract_status",values:["draft","active","expired","terminated","cancelled"]},
};

export function legacyDictionarySourceKey(item:Pick<HrLegacyDictionaryItemInputDto,"sourceCode"|"sourceName"|"sourceValue">):string {
  return [item.sourceCode,item.sourceName,item.sourceValue].map(value=>value?.trim().toLocaleLowerCase("en-US")??"\u0000").join("\u0001");
}

export function validateLegacyDictionaryItems(dictionaryCode:string,items:readonly HrLegacyDictionaryItemInputDto[],sourceRowCount:number):void {
  if(items.length!==sourceRowCount)throw new BadRequestException("Dictionary item coverage must equal the signed source row count");
  const sourceKeys=new Set<string>(),identities=new Set<string>(),codes=new Set<string>(),names=new Set<string>(),values=new Set<string>();
  for(const item of items){
    if(!item.sourceCode?.trim()&&!item.sourceName?.trim()&&!item.sourceValue?.trim())throw new BadRequestException("Dictionary item source value is required");
    const key=legacyDictionarySourceKey(item);
    if(sourceKeys.has(key)||identities.has(item.sourceIdentitySha256))throw new ConflictException("Dictionary source values and identities must be unique");
    sourceKeys.add(key);identities.add(item.sourceIdentitySha256);
    for(const [value,set] of [[item.sourceCode,codes],[item.sourceName,names],[item.sourceValue,values]] as const){
      if(!value?.trim())continue;const normalized=value.trim().toLocaleLowerCase("en-US");
      if(set.has(normalized))throw new ConflictException("Dictionary source code, name and value must each be unique");set.add(normalized);
    }
    if(item.decision==="map"){
      const contract=targetContracts[dictionaryCode];
      if(!contract||item.targetDomain!==contract.domain||!item.targetValue?.trim())throw new BadRequestException("Dictionary target does not match its governed domain");
      if(contract.values&&!contract.values.includes(item.targetValue))throw new BadRequestException("Dictionary target value is not supported by the governed domain");
      if(dictionaryCode==="contract_type"&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(item.targetValue))throw new BadRequestException("Contract type target code is invalid");
    }else if(item.targetDomain!==undefined||item.targetValue!==undefined){
      throw new BadRequestException("Non-mapped dictionary items cannot declare a target");
    }
  }
}

@Injectable()
export class HrLegacyDictionaryService {
  constructor(private readonly dataSource:DataSource,private readonly auditService:AuditService){}

  async list(scope:TenantParkScope,actor:JwtPrincipal,query:HrLegacyDictionaryListQueryDto):Promise<PaginatedResult<RawRow>>{
    const values:unknown[]=[scope.tenantId,scope.parkId],conditions=["tenant_id=$1","park_id=$2","is_deleted=false"];
    if(query.dictionary_code){values.push(query.dictionary_code);conditions.push(`dictionary_code=$${values.length}`);}
    if(query.status){values.push(query.status);conditions.push(`status=$${values.length}`);}
    values.push(query.page_size,(query.page-1)*query.page_size);
    const rows=await this.dataSource.query(
      `SELECT id,dictionary_code AS "dictionaryCode",source_table AS "sourceTable",
        source_snapshot_sha256 AS "sourceSnapshotSha256",source_row_count AS "sourceRowCount",
        status,decision_note AS "decisionNote",approved_at AS "approvedAt",create_time AS "createdAt"
       FROM hr_legacy_dictionary_version WHERE ${conditions.join(" AND ")}
       ORDER BY create_time DESC,id DESC LIMIT $${values.length-1} OFFSET $${values.length}`,
      values,
    ) as RawRow[];
    const countRows=await this.dataSource.query(
      `SELECT count(*)::int total FROM hr_legacy_dictionary_version WHERE ${conditions.join(" AND ")}`,
      values.slice(0,values.length-2),
    ) as RawRow[];
    const total=Number(countRows[0]?.total??0);
    await recordHrSensitiveRead(this.auditService,scope,actor,{resource:"hr.legacy_dictionary",action:"读取玉舟迁移字典",bizType:"hr_legacy_dictionary_version",bizId:null,path:"/hr/legacy-dictionaries",fieldGroups:[],projection:"admin",itemCount:rows.length});
    return {items:rows,total,page:query.page,page_size:query.page_size};
  }

  async items(scope:TenantParkScope,actor:JwtPrincipal,id:string):Promise<RawRow[]>{
    const version=await this.version(scope,id);
    const rows=await this.dataSource.query(
      `SELECT id,source_code AS "sourceCode",source_name AS "sourceName",source_value AS "sourceValue",
        source_identity_sha256 AS "sourceIdentitySha256",source_row_sha256 AS "sourceRowSha256",
        decision,target_domain AS "targetDomain",target_value AS "targetValue",reason_code AS "reasonCode",
        review_note AS "reviewNote"
       FROM hr_legacy_dictionary_item
       WHERE tenant_id=$1 AND park_id=$2 AND version_id=$3 AND is_deleted=false
       ORDER BY create_time,id`,[scope.tenantId,scope.parkId,id],
    ) as RawRow[];
    await recordHrSensitiveRead(this.auditService,scope,actor,{resource:"hr.legacy_dictionary.item",action:"读取玉舟迁移字典项",bizType:"hr_legacy_dictionary_version",bizId:id,path:"/hr/legacy-dictionaries/:id/items",fieldGroups:[],projection:"admin",itemCount:rows.length});
    return rows.map(row=>({...row,dictionaryCode:version.dictionary_code}));
  }

  async createDraft(scope:TenantParkScope,actor:JwtPrincipal,dto:CreateHrLegacyDictionaryDraftDto):Promise<RawRow>{
    validateLegacyDictionaryItems(dto.dictionaryCode,dto.items,dto.sourceRowCount);
    try{return await this.dataSource.transaction(async manager=>{
      const versions=await manager.query(
        `INSERT INTO hr_legacy_dictionary_version(
           tenant_id,park_id,source_system,dictionary_code,source_table,source_snapshot_sha256,
           source_row_count,status,decision_note,create_by,update_by
         ) VALUES($1,$2,'yuzhou-v10',$3,$4,$5,$6,'draft',$7,$8,$8)
         RETURNING id,dictionary_code AS "dictionaryCode",source_snapshot_sha256 AS "sourceSnapshotSha256",
           source_row_count AS "sourceRowCount",status`,
        [scope.tenantId,scope.parkId,dto.dictionaryCode,dto.sourceTable,dto.sourceSnapshotSha256,dto.sourceRowCount,dto.decisionNote??null,actor.sub],
      ) as RawRow[];
      const version=versions[0]!;
      for(const item of dto.items)await this.insertItem(manager,scope,actor.sub,String(version.id),item);
      return version;
    });}catch(error){this.translateConflict(error);}
  }

  async updateItem(scope:TenantParkScope,actor:JwtPrincipal,versionId:string,itemId:string,dto:UpdateHrLegacyDictionaryItemDto):Promise<RawRow>{
    try{return await this.dataSource.transaction(async manager=>{
      const versionRows=await manager.query(
        "SELECT id,dictionary_code,status FROM hr_legacy_dictionary_version WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE",
        [versionId,scope.tenantId,scope.parkId],
      ) as RawRow[];
      const version=versionRows[0];if(!version)throw new NotFoundException("Legacy dictionary version not found");
      if(version.status!=="draft")throw new ConflictException("Approved legacy dictionary versions are immutable");
      const itemRows=await manager.query(
        `SELECT source_code AS "sourceCode",source_name AS "sourceName",source_value AS "sourceValue",
          source_identity_sha256 AS "sourceIdentitySha256",source_row_sha256 AS "sourceRowSha256"
         FROM hr_legacy_dictionary_item
         WHERE id=$1 AND version_id=$2 AND tenant_id=$3 AND park_id=$4 AND is_deleted=false FOR UPDATE`,
        [itemId,versionId,scope.tenantId,scope.parkId],
      ) as RawRow[];
      const source=itemRows[0];if(!source)throw new NotFoundException("Legacy dictionary item not found");
      const candidate={...source,...dto} as unknown as HrLegacyDictionaryItemInputDto;
      validateLegacyDictionaryItems(String(version.dictionary_code),[candidate],1);
      const updated=await manager.query(
        `UPDATE hr_legacy_dictionary_item SET decision=$1,target_domain=$2,target_value=$3,reason_code=$4,
           review_note=$5,update_by=$6,update_time=now(),version=version+1
         WHERE id=$7 AND version_id=$8 AND tenant_id=$9 AND park_id=$10
         RETURNING id,decision,target_domain AS "targetDomain",target_value AS "targetValue",reason_code AS "reasonCode",review_note AS "reviewNote"`,
        [dto.decision,dto.targetDomain??null,dto.targetValue??null,dto.reasonCode,dto.reviewNote??null,actor.sub,itemId,versionId,scope.tenantId,scope.parkId],
      ) as RawRow[];
      return updated[0]!;
    });}catch(error){this.translateConflict(error);}
  }

  async approve(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:ApproveHrLegacyDictionaryDto):Promise<RawRow>{
    try{return await this.dataSource.transaction(async manager=>{
      const versions=await manager.query(
        "SELECT * FROM hr_legacy_dictionary_version WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE",
        [id,scope.tenantId,scope.parkId],
      ) as RawRow[];
      const version=versions[0];if(!version)throw new NotFoundException("Legacy dictionary version not found");
      if(version.status!=="draft")throw new ConflictException("Legacy dictionary version is not a draft");
      if(version.source_snapshot_sha256!==dto.sourceSnapshotSha256)throw new ConflictException("Legacy dictionary source snapshot drifted");
      if(version.create_by===actor.sub||version.update_by===actor.sub)throw new ConflictException("Dictionary approval requires a different reviewer");
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`hr-legacy-dictionary:${scope.tenantId}:${scope.parkId}:${version.dictionary_code}`]);
      const itemRows=await manager.query(
        `SELECT source_code AS "sourceCode",source_name AS "sourceName",source_value AS "sourceValue",
          source_identity_sha256 AS "sourceIdentitySha256",source_row_sha256 AS "sourceRowSha256",
          decision,target_domain AS "targetDomain",target_value AS "targetValue",reason_code AS "reasonCode",
          review_note AS "reviewNote"
         FROM hr_legacy_dictionary_item
         WHERE tenant_id=$1 AND park_id=$2 AND version_id=$3 AND is_deleted=false FOR SHARE`,
        [scope.tenantId,scope.parkId,id],
      ) as unknown as HrLegacyDictionaryItemInputDto[];
      validateLegacyDictionaryItems(String(version.dictionary_code),itemRows,Number(version.source_row_count));
      await manager.query(
        `UPDATE hr_legacy_dictionary_version SET status='superseded',update_time=now(),version=version+1
         WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND dictionary_code=$3
           AND status='approved' AND is_deleted=false`,
        [scope.tenantId,scope.parkId,version.dictionary_code],
      );
      const approved=await manager.query(
        `UPDATE hr_legacy_dictionary_version SET status='approved',approved_by=$1,approved_at=now(),
           update_time=now(),version=version+1
         WHERE id=$2 AND tenant_id=$3 AND park_id=$4 AND status='draft'
         RETURNING id,dictionary_code AS "dictionaryCode",source_snapshot_sha256 AS "sourceSnapshotSha256",status,approved_at AS "approvedAt"`,
        [actor.sub,id,scope.tenantId,scope.parkId],
      ) as RawRow[];
      if(approved.length!==1)throw new ConflictException("Legacy dictionary approval changed concurrently");
      return approved[0]!;
    });}catch(error){this.translateConflict(error);}
  }

  private async version(scope:TenantParkScope,id:string):Promise<RawRow>{
    const rows=await this.dataSource.query(
      "SELECT id,dictionary_code,status FROM hr_legacy_dictionary_version WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false",
      [id,scope.tenantId,scope.parkId],
    ) as RawRow[];
    if(!rows[0])throw new NotFoundException("Legacy dictionary version not found");return rows[0];
  }

  private async insertItem(manager:EntityManager,scope:TenantParkScope,actorId:string,versionId:string,item:HrLegacyDictionaryItemInputDto):Promise<void>{
    await manager.query(
      `INSERT INTO hr_legacy_dictionary_item(
         tenant_id,park_id,version_id,source_code,source_name,source_value,source_identity_sha256,
         source_row_sha256,decision,target_domain,target_value,reason_code,review_note,create_by,update_by
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)`,
      [scope.tenantId,scope.parkId,versionId,item.sourceCode??null,item.sourceName??null,item.sourceValue??null,
       item.sourceIdentitySha256,item.sourceRowSha256,item.decision,item.targetDomain??null,item.targetValue??null,
       item.reasonCode,item.reviewNote??null,actorId],
    );
  }

  private translateConflict(error:unknown):never{
    const value=error as {code?:string;message?:string};
    if(value.code==="23505")throw new ConflictException("Legacy dictionary source or approval already exists");
    if(value.message?.includes("IMMUTABLE")||value.message?.includes("TRANSITION_INVALID"))throw new ConflictException("Approved legacy dictionary evidence is immutable");
    throw error;
  }
}
