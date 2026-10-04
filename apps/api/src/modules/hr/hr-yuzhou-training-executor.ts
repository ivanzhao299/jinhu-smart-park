import { BadRequestException,ConflictException,ForbiddenException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { EntityManager } from "typeorm";
import { HR_PERMISSIONS,type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { PartySensitiveDataService } from "../../shared/security/party-sensitive-data.service";
import { profileCanonical } from "./hr-yuzhou-profile-baseline";
import { normalizeTrainingHistoryFacts,planTrainingHistoryFacts,createTrainingHistoryInTransaction,correctTrainingHistoryHoursInTransaction,type TrainingHistoryFacts } from "./hr-yuzhou-training-transaction";
export type TrainingImportItem={domain:"training_history";sourceTable:string;sourceKey:string;rowDigest:string;fields:Record<string,unknown>;sourceUpdatedAt?:string};
const hash=(v:unknown)=>createHash("sha256").update(profileCanonical(v)).digest("hex");
const sha=(v:string)=>createHash("sha256").update(v).digest("hex");
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const invalid=():never=>{throw new ConflictException("TRAINING_IMPORT_EVIDENCE_INVALID");};
function decode(s:PartySensitiveDataService,cipher:string){try{const raw=s.decrypt(cipher);if(!raw||raw.length>1024*1024)return invalid();const v:unknown=JSON.parse(raw);return object(v)?v:invalid();}catch{return invalid();}}
function permissions(a:JwtPrincipal,s:TenantParkScope){if(a.tenantId!==s.tenantId||a.parkId!==s.parkId||(!a.isSuper&&!a.permissions.includes("*")&&[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE,HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE].some(p=>!a.permissions.includes(p))))throw new ForbiddenException();}
function business(fields:Record<string,unknown>){const v={...fields};delete v.employeeSourceKey;delete v.employeeSourceTable;return normalizeTrainingHistoryFacts(v);}
function scalarHours(v:string){if(!/^\d+(?:\.\d{1,2})?$/.test(v))return invalid();return v.includes('.')?v.replace(/0+$/,'').replace(/\.$/,''):v;}

async function originalSource(m:EntityManager,scope:TenantParkScope,item:TrainingImportItem,sensitive:PartySensitiveDataService){
 const candidates=await m.query(`SELECT id,operation_id FROM hr_yuzhou_t5_followon_source WHERE source_table='dbo.trainhis' AND source_identity_sha256=$1`,[item.sourceKey.slice(7)]);
 if(!candidates.length)return null;if(candidates.length!==1)return invalid();
 const op=(await m.query('SELECT * FROM hr_yuzhou_t5_followon_operation WHERE operation_id=$1 FOR SHARE',[candidates[0].operation_id]))[0];
 if(!op||op.status!=='succeeded'||!op.finished_at||op.rolled_back_at||!object(op.binding)||hash(op.binding)!==op.binding_sha256)return invalid();
 const b=op.binding;
 if(!object(b.targetScope)||b.targetScope.tenantId!==scope.tenantId||b.targetScope.parkId!==scope.parkId||b.operationId!==op.operation_id||b.intent!=='APPEND_T5_FULL_HISTORY_ONCE'||b.executionCodeSha!=='7c3df1c230bde74badbf414acae36030d5fe8709'||b.sourceMappingContractSha256!=='d44b0f904fb3240d45a52b8dc8a3510ce5622ecb6f7f41356fbe6e48fa53b7e0'||!object(b.triple)||!object(b.parent)||!object(b.payrollParent)||op.parent_operation_id!==b.parent.operationId||op.payroll_operation_id!==b.payrollParent.operationId)return invalid();
 const rows=await m.query(`SELECT s.* FROM hr_yuzhou_t5_followon_source s
 JOIN hr_yuzhou_t5_followon_projection_receipt sr ON sr.operation_id=s.operation_id AND sr.source_identity_sha256=s.source_identity_sha256 AND sr.source_row_sha256=s.source_row_sha256 AND sr.target_table='hr_yuzhou_t5_followon_source' AND sr.target_id=s.id AND sr.disposition='insert'
 JOIN hr_yuzhou_t5_followon_projection_receipt ar ON ar.operation_id=s.operation_id AND ar.source_identity_sha256=s.source_identity_sha256 AND ar.source_row_sha256=s.source_row_sha256 AND ar.target_table='hr_legacy_archive_record' AND ar.disposition='insert'
 JOIN hr_legacy_archive_record a ON a.id=ar.target_id AND a.tenant_id=s.tenant_id AND a.park_id=s.park_id AND a.record_type='training_history'
 JOIN migration_batch batch ON batch.t5_followon_operation_id=s.operation_id AND batch.status='succeeded' AND batch.execution_context='t5_production_followon' AND batch.run_id=s.operation_id AND batch.target_database=current_database() AND batch.source_snapshot_sha256=$4 AND batch.tool_version=$5
 JOIN hr_yuzhou_production_import_operation co ON co.operation_id=$6 AND co.status='succeeded' AND co.finished_at IS NOT NULL AND co.target_tenant_id=s.tenant_id AND co.target_park_id=s.park_id AND co.source_snapshot_sha256=$4 AND co.sealed_plan_sha256=$8 AND co.target_scope_sha256=$9
 JOIN hr_yuzhou_t4_followon_operation payroll ON payroll.operation_id=$7 AND payroll.status='succeeded' AND payroll.finished_at IS NOT NULL AND payroll.rolled_back_at IS NULL AND payroll.binding_sha256=$10
 WHERE s.id=$1 AND s.tenant_id=$2 AND s.park_id=$3 AND s.source_domain='trainhis' AND s.source_table='dbo.trainhis' FOR SHARE OF s,sr,ar,a,batch,co,payroll`,[candidates[0].id,scope.tenantId,scope.parkId,b.triple.sourceSnapshotHash,`t5-followon-v1@${b.executionCodeSha}`,b.parent.operationId,b.payrollParent.operationId,b.parent.sealedPlanSha256,b.targetScopeSha256,b.payrollParent.bindingSha256]);
 if(rows.length!==1)return invalid();const row=rows[0];let source=decode(sensitive,row.encrypted_source);
 if(hash(source)!==row.source_row_sha256){const reverse=(v:unknown):unknown=>typeof v==='string'?v.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/gu,t=>JSON.parse(`"${t}"`)):Array.isArray(v)?v.map(reverse):object(v)?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,reverse(x)])):v;source=reverse(source) as Record<string,unknown>;if(hash(source)!==row.source_row_sha256)return invalid();}
 if(!Number.isInteger(source.id)||Number(source.id)<-2147483648||Number(source.id)>2147483647||sha(`dbo.trainhis\0${source.id}`)!==item.sourceKey.slice(7)||typeof source.person!=='string'||!source.person.trim()||source.person.length>10||source.person.includes('\0')||typeof source.hours!=='number'||!Number.isInteger(source.hours))return invalid();
 const employeeKey=`sha256:${sha(`dbo.person\0${source.person.trim()}`)}`;
 if(item.fields.employeeSourceKey!==employeeKey)return invalid();
 for(const key of ['startdate','enddate'])if(typeof source[key]!=='string'||!/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,7})?$/.test(source[key] as string))return invalid();
 normalizeTrainingHistoryFacts({courseName:source.coursename,startDate:(source.startdate as string).slice(0,10),endDate:(source.enddate as string).slice(0,10),hours:String(source.hours)});
 const partial=await m.query(`SELECT id FROM hr_legacy_training_reward_projection WHERE source_table='dbo.trainhis' AND source_identity_sha256=$1`,[item.sourceKey.slice(7)]);
 if(partial.length)throw new ConflictException('TRAINING_ORIGINAL_TARGET_ACCEPTANCE_PENDING');
 return {sourceId:String(row.id),operationId:String(row.operation_id),rowSha256:String(row.source_row_sha256),bindingSha256:String(op.binding_sha256)};
}

/** Internal package-transaction executor; public DTO admission remains separate. */
export async function executeYuzhouTrainingItem(m:EntityManager,scope:TenantParkScope,actor:JwtPrincipal,item:TrainingImportItem,sensitive:PartySensitiveDataService,employeeTarget:(key:string,table:string)=>Promise<string>,operationId?:string){
 if(!m.queryRunner?.isTransactionActive)return invalid();permissions(actor,scope);
 if(item.domain!=='training_history'||item.sourceTable!=='dbo.trainhis'||!/^sha256:[a-f0-9]{64}$/.test(item.sourceKey)||item.fields.employeeSourceTable!=='dbo.person'||typeof item.fields.employeeSourceKey!=='string'||!/^sha256:[a-f0-9]{64}$/.test(item.fields.employeeSourceKey))throw new BadRequestException('TRAINING_IMPORT_SOURCE_INVALID');
 const incoming=business(item.fields);
 if(hash({domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,sourceUpdatedAt:item.sourceUpdatedAt??null,fields:item.fields})!==item.rowDigest)throw new BadRequestException('TRAINING_IMPORT_DIGEST_INVALID');
 if(operationId)await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[profileCanonical([scope.tenantId,scope.parkId,'yuzhou-v10','training_history',item.sourceKey])]);
 const params=[scope.tenantId,scope.parkId,item.sourceKey];
 let prior=(await m.query(`SELECT * FROM hr_incremental_import_item WHERE tenant_id=$1 AND park_id=$2 AND source_system='yuzhou-v10' AND domain='training_history' AND source_table='dbo.trainhis' AND source_key=$3 ${operationId?'FOR UPDATE':''}`,params))[0];
 const original=await originalSource(m,scope,item,sensitive);
 const employeeId=await employeeTarget(item.fields.employeeSourceKey,'dbo.person');
 let source:Record<string,unknown>={},baseline:TrainingHistoryFacts|undefined,current:TrainingHistoryFacts|undefined,correctionVersion=0;
 let binding:Record<string,unknown>|undefined;
 if(prior){
  source=decode(sensitive,prior.source_facts_encrypted);if(hash(source)!==prior.source_facts_sha256)return invalid();
  const saved=decode(sensitive,prior.baseline_encrypted);if(!object(saved.target))return invalid();baseline=saved.target as TrainingHistoryFacts;
  binding=(await m.query('SELECT * FROM hr_incremental_training_binding WHERE item_id=$1',[prior.id]))[0];
  if(!binding||binding.tenant_id!==scope.tenantId||binding.park_id!==scope.parkId||binding.employee_id!==employeeId||binding.participant_id!==prior.target_id||(binding.original_source_id??null)!==(original?.sourceId??null))return invalid();
  if(source.employeeSourceKey!==item.fields.employeeSourceKey||source.employeeSourceTable!=='dbo.person')throw new ConflictException('TRAINING_IMPORT_EMPLOYEE_IMMUTABLE');
  const rows=await m.query(`SELECT p.snapshot->>'courseTitle' name,to_char(p.start_date,'YYYY-MM-DD') start,to_char(p.end_date,'YYYY-MM-DD') finish,
 COALESCE((SELECT corrected_hours FROM hr_training_result_correction c WHERE c.tenant_id=t.tenant_id AND c.park_id=t.park_id AND c.participant_id=t.id AND corrected_hours IS NOT NULL ORDER BY sequence_no DESC LIMIT 1),t.completed_hours)::text hours,
 (SELECT COALESCE(max(sequence_no),0)::int FROM hr_training_result_correction c WHERE c.tenant_id=t.tenant_id AND c.park_id=t.park_id AND c.participant_id=t.id) correction
 FROM hr_training_participant t JOIN hr_training_plan p ON p.id=t.plan_id AND p.tenant_id=t.tenant_id AND p.park_id=t.park_id
 WHERE t.id=$1 AND t.tenant_id=$2 AND t.park_id=$3 AND t.employee_id=$4 AND t.plan_id=$5 AND t.status='completed' AND p.status='completed' AND NOT p.is_deleted ${operationId?'FOR UPDATE OF t':''}`,[prior.target_id,scope.tenantId,scope.parkId,employeeId,binding.plan_id]);
  if(rows.length!==1)return invalid();const row=rows[0];current={courseName:row.name,startDate:row.start,endDate:row.finish,hours:scalarHours(row.hours)};correctionVersion=row.correction;
 }
 const plan=current?planTrainingHistoryFacts(incoming,source,current,baseline!):undefined;
 if(!operationId)return {domain:item.domain,sourceTable:item.sourceTable,sourceKey:item.sourceKey,fields:Object.keys(incoming),action:plan?.action??'create',conflictFields:plan?.conflictFields??[]};
 if(plan?.action==='conflict')return revision(m,operationId,prior.id,item.rowDigest,'conflict',plan.conflictFields,correctionVersion);
 if(!prior){
  const created=await createTrainingHistoryInTransaction(m,scope,actor,item.sourceKey,employeeId,incoming);
  source={...incoming,employeeSourceKey:item.fields.employeeSourceKey,employeeSourceTable:'dbo.person'};baseline={...incoming};
  prior=(await m.query(`INSERT INTO hr_incremental_import_item(tenant_id,park_id,source_system,source_table,source_key,domain,target_table,target_id,last_row_sha256,source_facts_encrypted,source_facts_sha256,baseline_encrypted,last_operation_id,target_version)
 VALUES($1,$2,'yuzhou-v10','dbo.trainhis',$3,'training_history','hr_training_participant',$4,$5,$6,$7,$8,$9,1) RETURNING *`,[...params,created.participantId,item.rowDigest,sensitive.encrypt(profileCanonical(source)),hash(source),sensitive.encrypt(profileCanonical({target:baseline,original})),operationId]))[0];
  await m.query(`INSERT INTO hr_incremental_training_binding(item_id,tenant_id,park_id,employee_id,plan_id,participant_id,original_source_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[prior.id,scope.tenantId,scope.parkId,employeeId,created.planId,created.participantId,original?.sourceId??null,actor.sub]);
 }else{
  if(plan?.correctedHours){const changed=await correctTrainingHistoryHoursInTransaction(m,scope,actor,prior.target_id,correctionVersion,plan.correctedHours);correctionVersion=changed.correctionVersion;current!.hours=plan.correctedHours;}
  const accepted={...source,...incoming},next={...baseline};for(const field of plan!.changedFields as Array<keyof TrainingHistoryFacts>)next[field]=current![field];
  await m.query(`UPDATE hr_incremental_import_item SET last_row_sha256=$2,source_facts_encrypted=$3,source_facts_sha256=$4,baseline_encrypted=$5,version=version+1,target_version=$6,last_operation_id=$7,update_time=now() WHERE id=$1`,[prior.id,item.rowDigest,sensitive.encrypt(profileCanonical(accepted)),hash(accepted),sensitive.encrypt(profileCanonical({target:next,original})),correctionVersion+1,operationId]);
 }
 return revision(m,operationId,prior.id,item.rowDigest,plan?.action==='unchanged'?'unchanged':'applied',plan?.changedFields??Object.keys(incoming),correctionVersion);
}
async function revision(m:EntityManager,operationId:string,itemId:string,digest:string,outcome:'applied'|'unchanged'|'conflict',fields:string[],correctionVersion:number){
 await m.query(`INSERT INTO hr_incremental_import_revision(operation_id,item_id,revision_no,outcome,source_row_sha256,field_diff,before_receipt,after_receipt) VALUES($1,$2,(SELECT COALESCE(max(revision_no),0)+1 FROM hr_incremental_import_revision WHERE item_id=$2),$3,$4,$5::jsonb,'{}'::jsonb,$6::jsonb)`,[operationId,itemId,outcome,digest,profileCanonical(fields.map(field=>({field}))),profileCanonical({correctionVersion})]);return outcome;
}
