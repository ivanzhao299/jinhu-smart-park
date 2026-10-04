import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS, normalizeYuzhouRecordFields, planYuzhouRecordFields, type TenantParkScope, type YuzhouRecordSourceFacts, type YuzhouRecordSourceKind, type YuzhouIncrementalItem } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { originalExtendedRecord, certifyOriginalRecords, originalRecordSourceFacts, type OriginalExtendedRecord } from "./hr-yuzhou-record-baseline";
import { profileCanonical } from "./hr-yuzhou-profile-baseline";
import { createEmployeeRecordInTransaction, mutateEmployeeRecordInTransaction } from "./hr-record-transaction-write";

export type YuzhouPreparedRecordItem=Omit<YuzhouIncrementalItem,"domain"> & {domain:YuzhouRecordSourceKind};
const definitions={skill:{table:"hr_employee_skill",sourceTable:"dbo.knowhow"},credential:{table:"hr_employee_credential",sourceTable:"dbo.ticket"}} as const;
type Facts=YuzhouRecordSourceFacts & {employeeSourceKey?:string;employeeSourceTable?:string};
type Ledger={id:string;target_id:string;source_facts_encrypted:string;source_facts_sha256:string;baseline_encrypted:string;version:number};
const hash=(value:unknown)=>createHash("sha256").update(profileCanonical(value)).digest("hex");
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const invalid=():never=>{throw new ConflictException("RECORD_IMPORT_EVIDENCE_INVALID");};
const certificates=new WeakMap<EntityManager,Map<string,Promise<Map<string,Record<string,unknown>>>>>();
function decode(sensitive:PartySensitiveDataService,cipher:string):Record<string,unknown>{
  try{const raw=sensitive.decrypt(cipher);if(!raw)return invalid();const value:unknown=JSON.parse(raw);return object(value)?value:invalid();}catch{return invalid();}
}
function witness(original:OriginalExtendedRecord){return {version:1,proof:"original_t5_record_set_v1",kind:original.kind,operationId:original.operation_id,bindingSha256:original.binding_sha256};}
function business(kind:YuzhouRecordSourceKind,fields:Record<string,unknown>){const value={...fields};delete value.employeeSourceKey;delete value.employeeSourceTable;return normalizeYuzhouRecordFields(kind,value);}

async function target(manager:EntityManager,scope:TenantParkScope,kind:YuzhouRecordSourceKind,id:string,sensitive:PartySensitiveDataService){
  const table=definitions[kind].table;
  const rows=await manager.query(`SELECT to_jsonb(r) snapshot FROM ${table} r JOIN hr_employee e
    ON e.id=r.employee_id AND e.tenant_id=r.tenant_id AND e.park_id=r.park_id AND NOT e.is_deleted
    WHERE r.id=$1 AND r.tenant_id=$2 AND r.park_id=$3`,[id,scope.tenantId,scope.parkId]);
  if(rows.length!==1)return invalid();const row=rows[0].snapshot as Record<string,unknown>;
  if(!Number.isSafeInteger(row.version)||Number(row.version)<1)return invalid();
  let facts:YuzhouRecordSourceFacts;
  if(kind==="skill")facts={skillName:row.skill_name as string,legacyGrade:row.legacy_grade as string|null,note:row.note as string|null};
  else{const number=row.number_encrypted===null?null:sensitive.decrypt(String(row.number_encrypted));
    if(row.number_encrypted!==null&&number===null)return invalid();
    facts={credentialType:row.credential_type as string,credentialName:row.credential_name as string,credentialNumber:number,issuingAuthority:row.issuing_authority as string|null,acquiredDate:row.acquired_date as string|null,validTo:row.valid_to as string|null,note:row.note as string|null};}
  return {row,facts,version:Number(row.version),employeeId:String(row.employee_id),archived:row.is_deleted===true};
}

/** Called by the ordinary package transaction. No nested business transaction,
 * original operation replay, current-value baseline reset, or plaintext receipt. */
export async function executeYuzhouRecordItem(manager:EntityManager,scope:TenantParkScope,actor:JwtPrincipal,
  item:YuzhouPreparedRecordItem,sensitive:PartySensitiveDataService,
  employeeTarget:(key:string,table:string)=>Promise<string>,operationId?:string,stagedEmployee=false){
  if(!manager.queryRunner?.isTransactionActive)return invalid();
  if(!actor.isSuper&&!actor.permissions.includes("*")&&!actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_RECORD_MANAGE))throw new ForbiddenException();
  if(!Object.hasOwn(definitions,item.domain)||item.sourceTable!==definitions[item.domain].sourceTable||!/^sha256:[a-f0-9]{64}$/.test(item.sourceKey)||item.initialBaselineWitness||item.profileBaselineWitness||item.profileAliasAcceptance)throw new BadRequestException("RECORD_IMPORT_SOURCE_INVALID");
  const kind=item.domain,table=definitions[kind].table;
  const incoming=business(kind,item.fields);
  if(item.fields.employeeSourceTable!=="dbo.person"||typeof item.fields.employeeSourceKey!=="string"||!/^sha256:[a-f0-9]{64}$/.test(item.fields.employeeSourceKey))throw new BadRequestException("RECORD_IMPORT_EMPLOYEE_REQUIRED");
  const params=[scope.tenantId,scope.parkId,item.sourceTable,item.sourceKey];
  if(operationId)await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[profileCanonical([scope.tenantId,scope.parkId,"yuzhou-v10",kind,item.sourceTable,item.sourceKey])]);
  let prior=(await manager.query(`SELECT * FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2
    AND source_system='yuzhou-v10' AND domain=$5 AND source_table=$3 AND source_key=$4 ${operationId?"FOR UPDATE":""}`,[...params,kind]))[0] as Ledger|undefined;
  const original=await originalExtendedRecord(manager,scope,kind,item.sourceKey.slice(7),sensitive);
  if(!prior&&!original){
    const unresolved=await manager.query(`SELECT id FROM ${table} WHERE tenant_id=$1 AND park_id=$2 AND legacy_source_identity_sha256=$3`,[scope.tenantId,scope.parkId,item.sourceKey.slice(7)]);
    if(unresolved.length)return invalid(); // Never duplicate an uncertified historical target.
  }
  let source:Facts={},baseline:YuzhouRecordSourceFacts={},proof:Record<string,unknown>|undefined;
  if(prior){
    source=decode(sensitive,prior.source_facts_encrypted) as Facts;
    if(hash(source)!==prior.source_facts_sha256)return invalid();
    const saved=decode(sensitive,prior.baseline_encrypted);if(!object(saved.target))return invalid();baseline=saved.target as YuzhouRecordSourceFacts;
    const provenance=(await manager.query(`SELECT * FROM hr_incremental_${kind}_baseline WHERE item_id=$1`,[prior.id]))[0];
    if(original){
      if(!provenance||prior.target_id!==original.target_id||provenance.original_operation_id!==original.operation_id||provenance.original_source_id!==original.id||provenance.original_binding_sha256!==original.binding_sha256)return invalid();
      const retained=decode(sensitive,provenance.provenance_encrypted);
      if(hash(retained.witness)!==provenance.witness_sha256||profileCanonical(retained.witness)!==profileCanonical(witness(original))
        ||provenance.original_record_set_sha256!==original.owned_state[table]?.sha256
        ||provenance.original_receipt_set_sha256!==original.owned_state.receipts?.sha256)return invalid();
    }else if(provenance)return invalid();
  }else if(original){
    let cache=certificates.get(manager);if(!cache){cache=new Map();certificates.set(manager,cache);}
    let cert=cache.get(`${original.operation_id}:${kind}`);if(!cert){cert=certifyOriginalRecords(manager,original,scope,sensitive);cache.set(`${original.operation_id}:${kind}`,cert);}
    const originals=await cert,mapped=originalRecordSourceFacts(original,originals,sensitive);
    source={...mapped.fields,employeeSourceKey:original.employee_key,employeeSourceTable:"dbo.person"};baseline={...mapped.fields};
    proof={witness:witness(original),originalFields:mapped.fields,qualityPending:mapped.pendingFields,originalTarget:originals.get(original.target_id)};
  }
  if(prior&&(typeof source.employeeSourceKey!=="string"||!/^sha256:[a-f0-9]{64}$/.test(source.employeeSourceKey)||source.employeeSourceTable!=="dbo.person"))return invalid();
  const ownerChanged=!!((original&&item.fields.employeeSourceKey!==original.employee_key)||(prior&&source.employeeSourceKey!==item.fields.employeeSourceKey));
  const employeeId=original?original.employee_id:(!operationId&&!prior&&stagedEmployee?null:await employeeTarget(prior?source.employeeSourceKey!:item.fields.employeeSourceKey,"dbo.person"));
  let id=prior?.target_id??original?.target_id;
  const current=id?await target(manager,scope,kind,id,sensitive):undefined;
  if(current&&current.employeeId!==employeeId)return invalid();
  const fieldPlan=current?planYuzhouRecordFields(kind,incoming,source,current.facts,baseline,current.archived):undefined;
  const plan=ownerChanged&&fieldPlan?{...fieldPlan,action:"conflict" as const,conflictFields:[...fieldPlan.conflictFields,"employeeSourceKey"],writable:{}}:fieldPlan;
  if(!current&&(kind==="skill"?!incoming.skillName:(!incoming.credentialType||!incoming.credentialName)))throw new BadRequestException("RECORD_IMPORT_NAME_TYPE_REQUIRED");
  const action=plan?.action??"create",conflictFields=plan?.conflictFields??[];
  if(!operationId)return {domain:kind,sourceTable:item.sourceTable,sourceKey:item.sourceKey,fields:Object.keys(incoming).sort(),action,conflictFields};
  if(employeeId===null)return invalid();
  if(!prior&&original){
    const rows=await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id,baseline_encrypted)
      VALUES($1,$2,'yuzhou-v10',$3,$4,'${kind}','${table}',$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[...params,id,original.source_row_sha256,sensitive.encrypt(profileCanonical(source)),hash(source),current!.version,operationId,sensitive.encrypt(profileCanonical({fields:baseline,target:baseline}))]);prior=rows[0] as Ledger;
    await manager.query(`INSERT INTO hr_incremental_${kind}_baseline(item_id,operation_id,tenant_id,park_id,employee_id,record_id,original_operation_id,original_source_id,source_identity_sha256,original_source_row_sha256,original_record_set_sha256,original_receipt_set_sha256,original_binding_sha256,witness_sha256,provenance_encrypted,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[prior.id,operationId,scope.tenantId,scope.parkId,employeeId,id,original.operation_id,original.id,original.source_identity_sha256,original.source_row_sha256,original.owned_state[table]!.sha256,original.owned_state.receipts!.sha256,original.binding_sha256,hash(witness(original)),sensitive.encrypt(profileCanonical(proof)),actor.sub]);
  }
  if(plan?.action==="conflict")return revision(manager,operationId,prior!.id,item.rowDigest,"conflict",conflictFields,current!.version,current!.version);
  let latest=current;
  if(!id){const created=await createEmployeeRecordInTransaction(manager,scope,actor,employeeId,kind,incoming,sensitive);id=created.id;latest=await target(manager,scope,kind,id,sensitive);source={...latest.facts,employeeSourceKey:item.fields.employeeSourceKey,employeeSourceTable:"dbo.person"};baseline={...latest.facts};}
  else if(plan&&Object.keys(plan.writable).length){await mutateEmployeeRecordInTransaction(manager,scope,actor,employeeId,kind,id,{...plan.writable,expectedVersion:current!.version},"update",sensitive);latest=await target(manager,scope,kind,id,sensitive);}
  const accepted={...source,...incoming,employeeSourceKey:item.fields.employeeSourceKey,employeeSourceTable:"dbo.person"};
  const nextBaseline={...baseline,...Object.fromEntries((plan?.changedFields??Object.keys(incoming)).map(field=>[field,latest!.facts[field as keyof YuzhouRecordSourceFacts]]))};
  const cipher=sensitive.encrypt(profileCanonical({fields:accepted,target:nextBaseline}));
  if(prior)await manager.query(`UPDATE hr_incremental_import_item SET last_row_sha256=$2,source_facts_encrypted=$3,source_facts_sha256=$4,baseline_encrypted=$5,version=version+1,target_version=$6,last_operation_id=$7,update_time=now() WHERE id=$1`,[prior.id,item.rowDigest,sensitive.encrypt(profileCanonical(accepted)),hash(accepted),cipher,latest!.version,operationId]);
  else{prior=(await manager.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,target_version,last_operation_id,baseline_encrypted)
    VALUES($1,$2,'yuzhou-v10',$3,$4,'${kind}','${table}',$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[...params,id,item.rowDigest,sensitive.encrypt(profileCanonical(accepted)),hash(accepted),latest!.version,operationId,cipher]))[0] as Ledger;}
  return revision(manager,operationId,prior.id,item.rowDigest,action==="unchanged"?"unchanged":"applied",plan?.changedFields??Object.keys(incoming),current?.version??0,latest!.version);
}

async function revision(manager:EntityManager,operationId:string,itemId:string,digest:string,outcome:"applied"|"unchanged"|"conflict",fields:string[],beforeVersion:number,afterVersion:number){
  await manager.query(`INSERT INTO hr_incremental_import_revision(operation_id,item_id,revision_no,outcome,source_row_sha256,field_diff,before_receipt,after_receipt)
    VALUES($1,$2,(SELECT COALESCE(max(revision_no),0)+1 FROM hr_incremental_import_revision WHERE item_id=$2),$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,[operationId,itemId,outcome,digest,profileCanonical(fields.map(field=>({field}))),profileCanonical({version:beforeVersion}),profileCanonical({version:afterVersion})]);
  return outcome;
}
