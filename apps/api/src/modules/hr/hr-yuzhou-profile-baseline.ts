import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import type { TenantParkScope, YuzhouIncrementalItem, YuzhouProfileBaselineWitness } from "@jinhu/shared";
import { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
const setCertificates=new WeakMap<EntityManager,Map<string,Promise<{profiles:{count:number;sha256:string};receipts:{count:number;sha256:string}}>>>();
const sha = (text:string) => createHash("sha256").update(text).digest("hex");
export const profileCanonical = (value:unknown):string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(profileCanonical).join(",")}]` : `{${Object.keys(value as Record<string,unknown>).sort().map(key=>`${JSON.stringify(key)}:${profileCanonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
const reject = (code="PROFILE_ORIGINAL_EVIDENCE_INVALID"):never => { throw new ConflictException(code); };
const object = (v:unknown):v is Record<string,unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export function profileWitnessHash(w:YuzhouProfileBaselineWitness) {
  if(Object.keys(w).sort().join(",")!=="bindingSha256,operationId,proof,version" || w.version!==1 || w.proof!=="original_t5_whole_set_v1" || !/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(w.operationId) || !/^[a-f0-9]{64}$/u.test(w.bindingSha256)) throw new BadRequestException("PROFILE_BASELINE_WITNESS_INVALID");
  return sha(profileCanonical({version:w.version,proof:w.proof,operationId:w.operationId,bindingSha256:w.bindingSha256}));
}
export type OriginalProfile = { operation_id:string; target_id:string; source_identity_sha256:string; source_row_sha256:string; encrypted_source:string; employee_id:string; owner_record_map_id:string; binding_sha256:string; binding:Record<string,unknown>; owned_state:Record<string,{count:number;sha256:string}>; employee_key:string; original:Record<string,unknown> };

/** Exact receipt identity proof. Never interprets current target values as original facts. */
export async function originalProfile(manager:EntityManager, scope:TenantParkScope, item:YuzhouIncrementalItem):Promise<OriginalProfile|null> {
  if(item.domain!=="profile" || item.sourceTable!=="dbo.person.core_residue") return null;
  const identity=item.sourceKey.slice(7);
  const candidates=await manager.query(`SELECT s.operation_id FROM hr_yuzhou_t5_followon_source s
    JOIN hr_yuzhou_t5_followon_projection_receipt r ON r.operation_id=s.operation_id AND r.source_identity_sha256=s.source_identity_sha256
    WHERE s.source_table=$1 AND s.source_identity_sha256=$2 AND r.target_table='hr_employee_profile' AND r.disposition='insert'`,[item.sourceTable,identity]) as Array<{operation_id:string}>;
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
  if(b.executionCodeSha!=="7c3df1c230bde74badbf414acae36030d5fe8709" || b.sourceMappingContractSha256!=="d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0") return reject("PROFILE_ORIGINAL_MAPPER_UNSUPPORTED");
  const rows=await manager.query(`SELECT s.*,r.target_id::text,p.legacy_source_identity_sha256,p.legacy_source_row_sha256,
      m.source_pk_canonical AS employee_key,to_jsonb(p) AS original
    FROM hr_yuzhou_t5_followon_source s
    JOIN hr_yuzhou_t5_followon_projection_receipt r ON r.operation_id=s.operation_id AND r.source_identity_sha256=s.source_identity_sha256 AND r.source_row_sha256=s.source_row_sha256 AND r.target_table='hr_employee_profile' AND r.disposition='insert'
    JOIN hr_yuzhou_t5_followon_projection_receipt sr ON sr.operation_id=s.operation_id AND sr.source_identity_sha256=s.source_identity_sha256 AND sr.source_row_sha256=s.source_row_sha256 AND sr.target_table='hr_yuzhou_t5_followon_source' AND sr.target_id=s.id AND sr.disposition='insert'
    JOIN migration_batch batch ON batch.t5_followon_operation_id=s.operation_id AND batch.execution_context='t5_production_followon' AND batch.run_id=s.operation_id AND batch.status='succeeded' AND batch.target_database=current_database() AND batch.source_snapshot_sha256=$5 AND batch.tool_version=$6
    JOIN hr_employee_profile p ON p.id=r.target_id AND p.employee_id=s.employee_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id AND NOT p.is_deleted
    JOIN legacy_record_map m ON m.id=s.owner_record_map_id AND m.target_id=s.employee_id AND m.target_table='hr_employee' AND m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.is_active AND m.mapping_status IN ('loaded','verified') AND m.source_pk_canonical='sha256:'||m.source_identity_sha256
    JOIN hr_yuzhou_production_import_projection_receipt pr ON pr.legacy_record_map_id=m.id AND pr.migration_batch_id=m.batch_id AND pr.phase='T0' AND pr.operation_id=$4 AND pr.source_identity_sha256=m.source_identity_sha256
    JOIN hr_yuzhou_production_import_record cr ON cr.operation_id=pr.operation_id AND cr.phase=pr.phase AND cr.source_identity_sha256=pr.source_identity_sha256 AND cr.source_row_sha256=m.source_row_sha256 AND cr.source_table=m.source_table AND cr.source_pk_canonical=m.source_pk_canonical AND cr.target_id=m.target_id AND cr.target_table=m.target_table AND cr.disposition='insert' AND cr.rollback_status='not_started' AND cr.rolled_back_at IS NULL
    JOIN hr_yuzhou_production_import_operation co ON co.operation_id=cr.operation_id AND co.status='succeeded' AND co.finished_at IS NOT NULL AND co.target_tenant_id=$2 AND co.target_park_id=$3 AND co.source_snapshot_sha256=$5 AND co.sealed_plan_sha256=$7 AND co.target_scope_sha256=$8
    JOIN hr_yuzhou_production_import_phase cp ON cp.operation_id=cr.operation_id AND cp.phase='T0' AND cp.status='succeeded'
    JOIN migration_batch cb ON cb.id=m.batch_id AND cb.status='succeeded' AND cb.execution_context='production_import' AND cb.target_database=current_database() AND cb.production_import_operation_id=co.operation_id AND cb.production_import_phase='T0' AND cb.source_snapshot_sha256=co.source_snapshot_sha256
    JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=$2 AND e.park_id=$3 AND NOT e.is_deleted
    JOIN hr_yuzhou_t4_followon_operation payroll ON payroll.operation_id=$9 AND payroll.parent_operation_id=co.operation_id AND payroll.status='succeeded' AND payroll.binding_sha256=$10
    WHERE s.operation_id=$1 AND s.tenant_id=$2 AND s.park_id=$3 AND s.source_table='dbo.person.core_residue' AND s.source_domain='person_core' AND s.source_identity_sha256=$11 AND s.owner_status='mapped'
    FOR SHARE OF s,r,sr,batch,m,pr,cr,co,cp,cb,payroll,e`,[op.operation_id,scope.tenantId,scope.parkId,b.parent.operationId,b.triple.sourceSnapshotHash,`t5-followon-v1@${b.executionCodeSha}`,b.parent.sealedPlanSha256,b.targetScopeSha256,b.payrollParent.operationId,b.payrollParent.bindingSha256,identity]);
  if(rows.length!==1 || rows[0].legacy_source_identity_sha256!==identity || rows[0].legacy_source_row_sha256!==rows[0].source_row_sha256) return reject();
  const duplicates=await manager.query(`SELECT id FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table='dbo.person.core_residue' AND source_identity_sha256=$1 AND is_active`,[identity]);
  if(duplicates.length) return reject();
  const ownerDuplicates=await manager.query(`SELECT id FROM legacy_record_map WHERE source_system='yuzhou-v10' AND source_table='dbo.person' AND source_identity_sha256=$1 AND is_active`,[String(rows[0].employee_key).slice(7)]);
  if(ownerDuplicates.length!==1) return reject();
  return {...rows[0],binding:b,binding_sha256:op.binding_sha256,owned_state:op.owned_state,operation_id:op.operation_id} as OriginalProfile;
}

/** Whole original set certificate, computed inside the transaction before any extraction. */
export async function certifyOriginalProfiles(manager:EntityManager, original:OriginalProfile, scope:TenantParkScope, sensitive:PartySensitiveDataService) {
  await manager.query(`SET LOCAL TIME ZONE 'Asia/Shanghai'`);
  await manager.query(`LOCK TABLE hr_employee_profile,hr_yuzhou_t5_followon_source,hr_yuzhou_t5_followon_projection_receipt IN SHARE MODE`);
  const aggregate=async(table:"hr_employee_profile"|"receipts")=>{
    const q=table==="receipts" ? `SELECT to_jsonb(r)::text AS text FROM hr_yuzhou_t5_followon_projection_receipt r WHERE r.operation_id=$1` : `SELECT to_jsonb(p)::text AS text FROM hr_employee_profile p JOIN hr_yuzhou_t5_followon_projection_receipt r ON r.target_id=p.id AND r.target_table='hr_employee_profile' AND r.operation_id=$1 AND r.disposition='insert' WHERE p.tenant_id=$2 AND p.park_id=$3`;
    return (await manager.query(`SELECT count(*)::int AS count,encode(digest(COALESCE(string_agg(row_hash,'' ORDER BY row_hash),''),'sha256'),'hex') AS sha256 FROM (SELECT encode(digest(text,'sha256'),'hex') row_hash FROM (${q}) data) hashes`,[original.operation_id,...(table==="receipts"?[]:[scope.tenantId,scope.parkId])]))[0] as {count:number;sha256:string};
  };
  // All rows in one API transaction share the same locked immutable set. Cache
  // only inside its EntityManager lifetime, never across transactions or requests.
  let cache=setCertificates.get(manager);if(!cache){cache=new Map();setCertificates.set(manager,cache);}
  let certificate=cache.get(original.operation_id);
  if(!certificate){certificate=(async()=>{
    const profiles=await aggregate("hr_employee_profile"),receipts=await aggregate("receipts");
    if(profileCanonical(profiles)!==profileCanonical(original.owned_state.hr_employee_profile) || profileCanonical(receipts)!==profileCanonical(original.owned_state.receipts) || profiles.count<1) return reject("PROFILE_ORIGINAL_SET_CHANGED");
    return {profiles,receipts};
  })();cache.set(original.operation_id,certificate);}
  const {profiles,receipts}=await certificate;
  // Re-read after table locks: the pre-lock target view cannot be used as the certificate.
  const target=(await manager.query(`SELECT to_jsonb(p) AS original,to_char(date_of_birth,'YYYY-MM-DD') AS dob FROM hr_employee_profile p WHERE id=$1 AND tenant_id=$2 AND park_id=$3`,[original.target_id,scope.tenantId,scope.parkId]))[0];
  const source=authenticateOriginalProfileSource(original,sensitive);
  for(const column of ["sex","birthday","idcard","handtel","email","addr"]) if(!Object.hasOwn(source,column) || !(source[column]===null || typeof source[column]==="string")) return reject();
  const text=(value:unknown)=>typeof value==="string"?value.trim()||null:null;
  const p=target.original as Record<string,unknown>,oldId=text(source.idcard);
  if(oldId===null) { if([p.id_number_encrypted,p.id_number_masked,p.id_number_fingerprint,p.id_type].some(v=>v!==null)) return reject("PROFILE_ORIGINAL_ID_INCOMPATIBLE"); }
  else if(sensitive.decrypt(String(p.id_number_encrypted))!==oldId || sensitive.hash(oldId)!==p.id_number_fingerprint || sensitive.mask(oldId)!==p.id_number_masked || p.id_type!=="resident_id") return reject("PROFILE_ORIGINAL_ID_INCOMPATIBLE");
  const birthday=text(source.birthday);let date:string|null=null;
  if(birthday!==null) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/u.test(birthday)) return reject("PROFILE_SOURCE_DATE_INVALID");
    date=birthday.slice(0,10);const parsed=new Date(`${date}T00:00:00Z`);
    if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) return reject();
  }
  const sourceFacts={employeeSourceKey:original.employee_key,employeeSourceTable:"dbo.person",gender:text(source.sex),dateOfBirth:date,personalMobile:text(source.handtel),personalEmail:text(source.email),address:text(source.addr),idNumber:oldId===null?null:oldId.replace(/\s+/gu,"").toUpperCase()};
  const targetFacts={gender:p.gender,dateOfBirth:target.dob,personalMobile:p.personal_mobile,personalEmail:p.personal_email,address:p.address,idNumberEncrypted:p.id_number_encrypted,idNumberMasked:p.id_number_masked,idNumberFingerprint:p.id_number_fingerprint,targetVersion:p.version};
  return {source:sourceFacts,target:targetFacts,certificate:{proof:"original_t5_whole_set_v1",timezone:"Asia/Shanghai",profiles,receipts,sourceRowSha256:original.source_row_sha256,bindingSha256:original.binding_sha256},certifiedOriginalTarget:p};
}

// Reuse the original transport/hash/owner proof without re-certifying today's
// mutable whole target set. The immutable 000330 provenance owns the old target.
function authenticateOriginalProfileSource(original:OriginalProfile,sensitive:PartySensitiveDataService) {
  const raw=sensitive.decrypt(original.encrypted_source);
  if(!raw || raw.length>1024*1024) return reject();
  let source:Record<string,unknown>;try { source=JSON.parse(raw) as Record<string,unknown>; } catch { return reject(); }
  if(!object(source)) return reject();
  if(sha(profileCanonical(source))!==original.source_row_sha256) {
    const decode=(value:unknown):unknown=>typeof value==="string"?value.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/gu,t=>JSON.parse(`"${t}"`)):Array.isArray(value)?value.map(decode):object(value)?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)])):value;
    source=decode(source) as Record<string,unknown>;
    if(sha(profileCanonical(source))!==original.source_row_sha256) return reject();
  }
  if(!Number.isInteger(source.id) || Number(source.id)<-2147483648 || Number(source.id)>2147483647 || sha(`dbo.person.core_residue\0${source.id}`)!==original.source_identity_sha256 || typeof source.person!=="string" || sha(`dbo.person\0${source.person.trim()}`)!==original.employee_key.slice(7)) return reject();
  return source;
}

export function originalProfileAliasProof(original:OriginalProfile, provenance:Record<string,unknown>, sensitive:PartySensitiveDataService, fields:readonly string[]) {
  const source=authenticateOriginalProfileSource(original,sensitive);
  const target=provenance.certifiedOriginalTarget,certificate=provenance.certificate;
  if(!object(target)||!object(certificate)||certificate.sourceRowSha256!==original.source_row_sha256||certificate.bindingSha256!==original.binding_sha256
    ||target.id!==original.target_id||target.employee_id!==original.employee_id) return reject("PROFILE_ALIAS_PROVENANCE_INVALID");
  const scope=original.binding.targetScope as Record<string,unknown>;
  if(target.tenant_id!==scope.tenantId||target.park_id!==scope.parkId) return reject("PROFILE_ALIAS_PROVENANCE_INVALID");
  const mappings:Record<string,{source:string;column:string;max:number}>={nativePlace:{source:"oldaddr",column:"native_place",max:50},degree:{source:"edulevel",column:"degree",max:24}};
  const sourceFields:Record<string,unknown>={},targetFields:Record<string,unknown>={};
  for(const field of fields) {
    const mapping=mappings[field];if(!mapping) return reject("PROFILE_ALIAS_FIELD_INVALID");
    if(!Object.prototype.hasOwnProperty.call(source,mapping.source)||!Object.prototype.hasOwnProperty.call(target,mapping.column)) return reject("PROFILE_ALIAS_ORIGINAL_FIELD_MISSING");
    const value=source[mapping.source];
    if(value!==null&&(typeof value!=="string"||value.includes("\0")||/\p{Surrogate}/u.test(value)||[...value].length>mapping.max)) return reject("PROFILE_ALIAS_ORIGINAL_FIELD_INVALID");
    const normalized=typeof value==="string"?value.trim():"";
    if(!normalized) return reject("PROFILE_ALIAS_ORIGINAL_SOURCE_EMPTY");
    sourceFields[field]=normalized;
    targetFields[field]=target[mapping.column];
  }
  if(!Number.isInteger(target.version)||Number(target.version)<1) return reject("PROFILE_ALIAS_PROVENANCE_INVALID");
  return {source:sourceFields,target:targetFields,targetVersion:Number(target.version),sourceRowSha256:original.source_row_sha256};
}
