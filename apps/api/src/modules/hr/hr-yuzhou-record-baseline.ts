import { ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { profileCanonical } from "./hr-yuzhou-profile-baseline";
import { recoverCertifiedOriginalRecordSet, type OriginalRecordSetCertificate, type OriginalRecordKind } from "./hr-record-original-set";
const definitions={skill:{table:"hr_employee_skill",sourceTable:"dbo.knowhow",domain:"knowhow"},credential:{table:"hr_employee_credential",sourceTable:"dbo.ticket",domain:"ticket"}} as const;
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const object=(v:unknown):v is Record<string,unknown>=>v!==null && typeof v==="object" && !Array.isArray(v);
const reject=(code="RECORD_ORIGINAL_EVIDENCE_INVALID"):never=>{throw new ConflictException(code);};
export type OriginalExtendedRecord={kind:OriginalRecordKind;id:string;operation_id:string;target_id:string;source_identity_sha256:string;source_row_sha256:string;encrypted_source:string;employee_id:string;owner_record_map_id:string;binding_sha256:string;binding:Record<string,unknown>;owned_state:Record<string,OriginalRecordSetCertificate>;employee_key:string;current:Record<string,unknown>;source:Record<string,unknown>};

/** Internal original receipt resolver, not an import endpoint or client attestation.
 * Soft deletion is included; its disposition is handled by the eventual planner. */
export async function originalExtendedRecord(manager:EntityManager, scope:TenantParkScope, kind:OriginalRecordKind, identity:string, sensitive:PartySensitiveDataService):Promise<OriginalExtendedRecord|null> {
  if(!manager.queryRunner?.isTransactionActive || !Object.hasOwn(definitions,kind) || !/^[a-f0-9]{64}$/u.test(identity)) return reject();
  const definition=definitions[kind];
  const candidates=await manager.query(`SELECT s.operation_id FROM hr_yuzhou_t5_followon_source s
    JOIN hr_yuzhou_t5_followon_projection_receipt r ON r.operation_id=s.operation_id AND r.source_identity_sha256=s.source_identity_sha256
    WHERE s.source_table=$1 AND s.source_identity_sha256=$2 AND r.target_table=$3 AND r.disposition='insert'`,[definition.sourceTable,identity,definition.table]) as Array<{operation_id:string}>;
  if(!candidates.length) return null;
  if(candidates.length!==1) return reject();
  // Rollback takes this operation FOR UPDATE before locking its target tables.
  const operations=await manager.query(`SELECT * FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1 FOR SHARE`,[candidates[0]!.operation_id]);
  const op=operations[0];
  if(!op || op.status!=="succeeded" || !op.finished_at || op.rolled_back_at || !object(op.binding) || sha(profileCanonical(op.binding))!==op.binding_sha256) return reject();
  const b=op.binding;
  if(!object(b.targetScope) || b.targetScope.tenantId!==scope.tenantId || b.targetScope.parkId!==scope.parkId || b.operationId!==op.operation_id || b.intent!=="APPEND_T5_FULL_HISTORY_ONCE" || !object(b.triple) || !object(b.parent) || !object(b.payrollParent)) return reject();
  if(op.parent_operation_id!==b.parent.operationId || op.payroll_operation_id!==b.payrollParent.operationId) return reject();
  // The proof route is reviewed against this exact original executed mapper.
  if(b.executionCodeSha!=="7c3df1c230bde74badbf414acae36030d5fe8709" || b.sourceMappingContractSha256!=="d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0") return reject("RECORD_ORIGINAL_MAPPER_UNSUPPORTED");
  const rows=await manager.query(`SELECT s.*,r.target_id::text,p.legacy_source_identity_sha256,p.legacy_source_row_sha256,
      m.source_pk_canonical AS employee_key,to_jsonb(p) AS current
    FROM hr_yuzhou_t5_followon_source s
    JOIN hr_yuzhou_t5_followon_projection_receipt r ON r.operation_id=s.operation_id AND r.source_identity_sha256=s.source_identity_sha256 AND r.source_row_sha256=s.source_row_sha256 AND r.target_table=$13 AND r.disposition='insert'
    JOIN hr_yuzhou_t5_followon_projection_receipt sr ON sr.operation_id=s.operation_id AND sr.source_identity_sha256=s.source_identity_sha256 AND sr.source_row_sha256=s.source_row_sha256 AND sr.target_table='hr_yuzhou_t5_followon_source' AND sr.target_id=s.id AND sr.disposition='insert'
    JOIN migration_batch batch ON batch.t5_followon_operation_id=s.operation_id AND batch.execution_context='t5_production_followon' AND batch.run_id=s.operation_id AND batch.status='succeeded' AND batch.target_database=current_database() AND batch.source_snapshot_sha256=$5 AND batch.tool_version=$6
    JOIN ${definition.table} p ON p.id=r.target_id AND p.employee_id=s.employee_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id
    JOIN legacy_record_map m ON m.id=s.owner_record_map_id AND m.target_id=s.employee_id AND m.target_table='hr_employee' AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.is_active AND m.mapping_status IN ('loaded','verified') AND m.source_pk_canonical='sha256:'||m.source_identity_sha256
    JOIN hr_yuzhou_production_import_projection_receipt pr ON pr.legacy_record_map_id=m.id AND pr.migration_batch_id=m.batch_id AND pr.phase='T0' AND pr.operation_id=$4 AND pr.source_identity_sha256=m.source_identity_sha256
    JOIN hr_yuzhou_production_import_record cr ON cr.operation_id=pr.operation_id AND cr.phase=pr.phase AND cr.source_identity_sha256=pr.source_identity_sha256 AND cr.source_row_sha256=m.source_row_sha256 AND cr.source_table=m.source_table AND cr.source_pk_canonical=m.source_pk_canonical AND cr.target_id=m.target_id AND cr.target_table=m.target_table AND cr.disposition='insert' AND cr.rollback_status='not_started' AND cr.rolled_back_at IS NULL
    JOIN hr_yuzhou_production_import_operation co ON co.operation_id=cr.operation_id AND co.status='succeeded' AND co.finished_at IS NOT NULL AND co.target_tenant_id=$2 AND co.target_park_id=$3 AND co.source_snapshot_sha256=$5 AND co.sealed_plan_sha256=$7 AND co.target_scope_sha256=$8
    JOIN hr_yuzhou_production_import_phase cp ON cp.operation_id=cr.operation_id AND cp.phase='T0' AND cp.status='succeeded'
    JOIN migration_batch cb ON cb.id=m.batch_id AND cb.status='succeeded' AND cb.execution_context='production_import' AND cb.target_database=current_database() AND cb.production_import_operation_id=co.operation_id AND cb.production_import_phase='T0' AND cb.source_snapshot_sha256=co.source_snapshot_sha256
    JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=$2 AND e.park_id=$3 AND NOT e.is_deleted
    JOIN hr_yuzhou_t4_followon_operation payroll ON payroll.operation_id=$9 AND payroll.parent_operation_id=co.operation_id AND payroll.status='succeeded' AND payroll.binding_sha256=$10
    WHERE s.operation_id=$1 AND s.tenant_id=$2 AND s.park_id=$3 AND s.source_table=$12 AND s.source_domain=$14 AND s.source_identity_sha256=$11 AND s.owner_status='mapped'
    FOR SHARE OF s,r,sr,batch,m,pr,cr,co,cp,cb,payroll,e`,[op.operation_id,scope.tenantId,scope.parkId,b.parent.operationId,b.triple.sourceSnapshotHash,`t5-followon-v1@${b.executionCodeSha}`,b.parent.sealedPlanSha256,b.targetScopeSha256,b.payrollParent.operationId,b.payrollParent.bindingSha256,identity,definition.sourceTable,definition.table,definition.domain]);
  if(rows.length!==1 || rows[0].legacy_source_identity_sha256!==identity || rows[0].legacy_source_row_sha256!==rows[0].source_row_sha256) return reject();
  const duplicates=await manager.query(`SELECT id FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table=$2 AND source_identity_sha256=$1 AND is_active`,[identity,definition.sourceTable]);
  if(duplicates.length) return reject();
  const ownerDuplicates=await manager.query(`SELECT id FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table='dbo.person' AND source_identity_sha256=$1 AND is_active`,[String(rows[0].employee_key).slice(7)]);
  if(ownerDuplicates.length!==1) return reject();
  const original={...rows[0],kind,binding:b,binding_sha256:op.binding_sha256,owned_state:op.owned_state,operation_id:op.operation_id} as OriginalExtendedRecord;
  original.source=authenticateRecordSource(original,sensitive);
  return original;
}

function authenticateRecordSource(original:OriginalExtendedRecord,sensitive:PartySensitiveDataService) {
  try {
    const raw=sensitive.decrypt(original.encrypted_source);
    if(!raw || raw.length>1024*1024) return reject();
    let source:unknown=JSON.parse(raw);
    if(!object(source)) return reject();
    if(sha(profileCanonical(source))!==original.source_row_sha256) {
      // Exact original T5 JSON transport decoding, followed by hash verification.
      const decode=(value:unknown):unknown=>typeof value==="string"?value.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/gu,t=>JSON.parse(`"${t}"`)):Array.isArray(value)?value.map(decode):object(value)?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)])):value;
      source=decode(source);
      if(!object(source) || sha(profileCanonical(source))!==original.source_row_sha256) return reject();
    }
    if(!Number.isInteger(source.id) || Number(source.id)<-2147483648 || Number(source.id)>2147483647
      || sha(`${definitions[original.kind].sourceTable}\0${source.id}`)!==original.source_identity_sha256
      || typeof source.person!=="string" || !source.person.trim()
      || sha(`dbo.person\0${source.person.trim()}`)!==original.employee_key.slice(7)) return reject();
    return source;
  } catch { return reject(); }
}

/** Call once per operation in an API transaction; no cross-request certificate cache.
 * The immutable original receipt set chooses IDs and owned_state, never the caller. */
export async function certifyOriginalRecords(manager:EntityManager,original:OriginalExtendedRecord,scope:TenantParkScope,sensitive:PartySensitiveDataService) {
  if(!manager.queryRunner?.isTransactionActive || !Object.hasOwn(definitions,original.kind)) return reject();
  const definition=definitions[original.kind];
  // Resolver already holds the operation lock; rollback uses the same order.
  await manager.query("SET LOCAL TIME ZONE 'Asia/Shanghai'");
  // Serialize first-acceptance certificates before upgrading to business writes.
  // Ordinary mutation takes ROW EXCLUSIVE before its row lock to avoid a cycle.
  await manager.query(`LOCK TABLE ${definition.table} IN SHARE ROW EXCLUSIVE MODE`);
  await manager.query(`LOCK TABLE ${definition.table}_change,hr_yuzhou_t5_followon_source,hr_yuzhou_t5_followon_projection_receipt IN SHARE MODE`);
  const receipts=(await manager.query(`SELECT count(*)::int AS count,
    encode(digest(COALESCE(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') AS sha256
    FROM (SELECT encode(digest(to_jsonb(r)::text,'sha256'),'hex') h
      FROM hr_yuzhou_t5_followon_projection_receipt r WHERE operation_id=$1) hashes`,[original.operation_id]))[0];
  if(!object(original.owned_state) || profileCanonical(receipts)!==profileCanonical(original.owned_state.receipts)
    || !original.owned_state[definition.table] || original.owned_state[definition.table]!.count<1) return reject("RECORD_ORIGINAL_RECEIPTS_CHANGED");
  const targets=await manager.query(`SELECT target_id::text AS id FROM hr_yuzhou_t5_followon_projection_receipt
    WHERE operation_id=$1 AND target_table=$2 AND disposition='insert'`,[original.operation_id,definition.table]) as Array<{id:string}>;
  const originals=await recoverCertifiedOriginalRecordSet(manager,scope,original.kind,targets.map(row=>row.id),original.owned_state[definition.table]!,sensitive);
  if(!originals.has(original.target_id)) return reject();
  return originals;
}

/** Reproduce only the reviewed original mapper and compare to the certified
 * original target. Unknown grade semantics/attachments never become facts. */
export function originalRecordSourceFacts(original:OriginalExtendedRecord,certified:Map<string,Record<string,unknown>>,sensitive:PartySensitiveDataService) {
  const target=certified.get(original.target_id);
  if(!target||!Object.hasOwn(definitions,original.kind))return reject();
  const source=original.source;
  const columns=original.kind==="skill"?["knowhow","grade","memo"]:["tickettype","ticket","ticketno","org","getdate","validdate","memo","ticketfilename"];
  for(const column of columns)if(!Object.hasOwn(source,column)||!(source[column]===null||typeof source[column]==="string")
    ||(typeof source[column]==="string"&&(/\p{Surrogate}/u.test(source[column])||source[column].includes("\0"))))return reject("RECORD_ORIGINAL_FIELD_INVALID");
  const text=(value:unknown)=>typeof value==="string"?value.trim()||null:null;
  const fields:Record<string,string|null>={},pendingFields:string[]=[];
  const pairs=original.kind==="skill"
    ?[["skillName","knowhow","skill_name"],["legacyGrade","grade","legacy_grade"],["note","memo","note"]]
    :[["credentialType","tickettype","credential_type"],["credentialName","ticket","credential_name"],["issuingAuthority","org","issuing_authority"],["note","memo","note"]];
  for(const [field,column,targetColumn] of pairs){
    const value=text(source[column!])??(field==="credentialType"?"legacy":null);
    if(["skillName","credentialName"].includes(field!)&&!value)return reject("RECORD_ORIGINAL_FIELD_INVALID");
    if(value!==target[targetColumn!])return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");
    fields[field!]=value;
  }
  if(original.kind==="skill"){
    if(target.proficiency!==null||target.acquired_date!==null)return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");
  }else{
    const date=(column:string,field:string)=>{
      const value=text(source[column]);if(value===null)return null;
      const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value),formatted=match?`${match[1]}-${match[2]}-${match[3]}`:null;
      const parsed=formatted?new Date(`${formatted}T00:00:00.000Z`):null;
      if(parsed&&Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===formatted&&!formatted!.startsWith("0000"))return formatted;
      pendingFields.push(field);return null;
    };
    const acquiredDate=date("getdate","acquiredDate");let validTo=date("validdate","validTo");
    if(acquiredDate&&validTo&&validTo<acquiredDate){validTo=null;pendingFields.push("validTo");}
    if(acquiredDate!==target.acquired_date||validTo!==target.valid_to)return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");
    fields.acquiredDate=acquiredDate;fields.validTo=validTo;
    const number=text(source.ticketno);
    if(number===null){if([target.number_encrypted,target.number_masked,target.number_fingerprint].some(v=>v!==null))return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");}
    else{try{if(sensitive.decrypt(String(target.number_encrypted))!==number||sensitive.mask(number)!==target.number_masked||sensitive.hash(number)!==target.number_fingerprint)return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");}catch{return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");}}
    fields.credentialNumber=number;
    const file=text(source.ticketfilename)?sha(String(source.ticketfilename)):null;
    if(file!==target.legacy_file_reference_sha256)return reject("RECORD_ORIGINAL_FIELD_INCOMPATIBLE");
    if(file!==null)pendingFields.push("attachmentAssociation");
  }
  return {fields,pendingFields};
}
