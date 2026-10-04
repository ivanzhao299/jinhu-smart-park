import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { isUUID } from "class-validator";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

export type TrainingHistoryFacts = { courseName:string; startDate:string; endDate:string; hours:string };
const keys=["courseName","startDate","endDate","hours"] as const;
const snapshotKeys=["courseName","startDate","endDate"] as const;
const bad=():never=>{throw new BadRequestException("TRAINING_IMPORT_FACTS_INVALID");};
function date(value:unknown):value is string {
 if(typeof value!=="string"||!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T00:00:00Z`);return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===value;
}
export function normalizeTrainingHistoryFacts(value:unknown):TrainingHistoryFacts {
 if(!value||typeof value!=="object"||Array.isArray(value))return bad();
 const v=value as Record<string,unknown>;
 if(Object.keys(v).length!==keys.length||!keys.every(k=>Object.hasOwn(v,k))||typeof v.courseName!=="string"||!v.courseName.trim()||v.courseName.trim().length>160||v.courseName.includes("\0")||/\p{Surrogate}/u.test(v.courseName)
 ||!date(v.startDate)||!date(v.endDate)||v.endDate<v.startDate||typeof v.hours!=="string"||!/^[1-9]\d{0,5}$/.test(v.hours)||Number(v.hours)>999999)return bad();
 return {courseName:v.courseName.trim(),startDate:v.startDate,endDate:v.endDate,hours:v.hours};
}
export function planTrainingHistoryFacts(incoming:unknown,source:Readonly<Partial<TrainingHistoryFacts>>,current:Readonly<TrainingHistoryFacts>,baseline:Readonly<Partial<TrainingHistoryFacts>>) {
 const facts=normalizeTrainingHistoryFacts(incoming),changedFields:string[]=[],conflictFields:string[]=[];
 let correctedHours:string|undefined;
 for(const key of keys){
  if(!Object.hasOwn(source,key)||!Object.hasOwn(baseline,key)){if(!conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"))conflictFields.push("INITIAL_FIELD_BASELINE_UNKNOWN");conflictFields.push(key);continue;}
  if(facts[key]===source[key])continue;
  changedFields.push(key);
  if(facts[key]===current[key])continue;
  if(current[key]!==baseline[key]){conflictFields.push(key);continue;}
  if(snapshotKeys.includes(key as typeof snapshotKeys[number]))conflictFields.push(`PUBLISHED_SNAPSHOT:${key}`);
  else correctedHours=facts.hours;
 }
 return {action:conflictFields.length?"conflict" as const:changedFields.length?"update" as const:"unchanged" as const,changedFields,conflictFields,correctedHours:conflictFields.length?undefined:correctedHours};
}
function requireTransaction(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,permissions:readonly string[]) {
 if(!m.queryRunner?.isTransactionActive)throw new ConflictException("TRAINING_IMPORT_TRANSACTION_REQUIRED");
 if(a.tenantId!==s.tenantId||a.parkId!==s.parkId||!isUUID(a.sub))throw new ForbiddenException();
 if(!a.isSuper&&!a.permissions.includes("*")&&permissions.some(p=>!a.permissions.includes(p)))throw new ForbiddenException();
}
async function one(m:EntityManager,sql:string,params:unknown[]):Promise<{id:string}> {
 const rows=typeormQueryRows<{id:string}>(await m.query(sql,params));
 if(rows.length!==1||!rows[0]?.id)throw new ConflictException("TRAINING_IMPORT_WRITE_FAILED");return rows[0];
}
/** Internal business primitive only. Source certification, source advisory lock,
 * ledger/replay and package revision are obligations of the future API executor.
 * Never invoke independently of that executor's transaction. */
export async function createTrainingHistoryInTransaction(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,sourceKey:string,employeeId:string,value:unknown) {
 requireTransaction(m,s,a,[HR_PERMISSIONS.HR_TRAINING_COURSE_MANAGE,HR_PERMISSIONS.HR_TRAINING_PLAN_MANAGE,HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE]);
 const facts=normalizeTrainingHistoryFacts(value);
 if(!/^sha256:[a-f0-9]{64}$/.test(sourceKey)||!isUUID(employeeId))throw new BadRequestException("TRAINING_IMPORT_IDENTITY_INVALID");
 const employees=await m.query(`SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND NOT is_deleted FOR SHARE`,[s.tenantId,s.parkId,employeeId]);
 if(employees.length!==1)throw new NotFoundException("Training employee not found");
 const common=[s.tenantId,s.parkId],suffix=sourceKey.slice(7,65);
 const course=await one(m,`INSERT INTO hr_training_course(tenant_id,park_id,course_code,create_by,update_by) VALUES($1,$2,$3,$4,$4) RETURNING id`,[...common,`YZ-HC-${suffix}`,a.sub]);
 const version=await one(m,`INSERT INTO hr_training_course_version(tenant_id,park_id,course_id,version_no,title,category,hours,create_by) VALUES($1,$2,$3,1,$4,'legacy',$5::numeric,$6) RETURNING id`,[...common,course.id,facts.courseName,facts.hours,a.sub]);
 const plan=await one(m,`INSERT INTO hr_training_plan(tenant_id,park_id,plan_code,plan_name,course_id,course_version_id,start_date,end_date,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$9) RETURNING id`,[...common,`YZ-HP-${suffix}`,facts.courseName,course.id,version.id,facts.startDate,facts.endDate,a.sub]);
 const participant=await one(m,`INSERT INTO hr_training_participant(tenant_id,park_id,plan_id,employee_id) VALUES($1,$2,$3,$4) RETURNING id`,[...common,plan.id,employeeId]);
 const snapshot={courseTitle:facts.courseName,category:"legacy",provider:null,hours:facts.hours,participantCount:1};
 await m.query(`UPDATE hr_training_plan SET status='published',published_at=now(),snapshot=$4::jsonb,version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[...common,plan.id,JSON.stringify(snapshot)]);
 await m.query(`UPDATE hr_training_plan SET status='in_progress',started_at=now(),version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[...common,plan.id]);
 await m.query(`UPDATE hr_training_participant SET status='completed',completed_at=($4::date::timestamp AT TIME ZONE 'Asia/Shanghai'),completed_hours=$5::numeric,version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[...common,participant.id,facts.endDate,facts.hours]);
 await m.query(`UPDATE hr_training_plan SET status='completed',completed_at=now(),version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[...common,plan.id]);
 for(const [action,from,to,participantId] of [["publish","draft","published",null],["start","published","in_progress",null],["complete","assigned","completed",participant.id],["complete","in_progress","completed",null]])await m.query(`INSERT INTO hr_training_action(tenant_id,park_id,plan_id,participant_id,action,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,'imported source history',$8)`,[...common,plan.id,participantId,action,from,to,a.sub]);
 return {courseId:course.id,courseVersionId:version.id,planId:plan.id,participantId:participant.id,participantVersion:2,correctionVersion:0};
}
/** Appends a source-hours amendment; never updates frozen completion or snapshot. */
export async function correctTrainingHistoryHoursInTransaction(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,participantId:string,expectedVersion:number,hours:string) {
 requireTransaction(m,s,a,[HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE]);
 if(!isUUID(participantId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||!/^[1-9]\d{0,5}$/.test(hours)||Number(hours)>999999)throw new BadRequestException("TRAINING_IMPORT_CORRECTION_INVALID");
 const rows=await m.query(`SELECT t.id,t.plan_id FROM hr_training_participant t JOIN hr_training_plan p ON p.id=t.plan_id AND p.tenant_id=t.tenant_id AND p.park_id=t.park_id JOIN hr_employee e ON e.id=t.employee_id AND e.tenant_id=t.tenant_id AND e.park_id=t.park_id WHERE t.tenant_id=$1 AND t.park_id=$2 AND t.id=$3 AND t.status='completed' AND NOT p.is_deleted AND p.status='completed' AND NOT e.is_deleted FOR UPDATE OF t`,[s.tenantId,s.parkId,participantId]);
 if(rows.length!==1)throw new NotFoundException("Completed training participant not found");
 const version=Number((await m.query(`SELECT COALESCE(max(sequence_no),0)::int n FROM hr_training_result_correction WHERE tenant_id=$1 AND park_id=$2 AND participant_id=$3`,[s.tenantId,s.parkId,participantId]))[0]?.n);
 if(version!==expectedVersion)throw new ConflictException("TRAINING_IMPORT_CORRECTION_STALE");
 const correction=await one(m,`INSERT INTO hr_training_result_correction(tenant_id,park_id,participant_id,sequence_no,corrected_hours,reason,create_by) VALUES($1,$2,$3,$4,$5::numeric,'source history hours revision',$6) RETURNING id`,[s.tenantId,s.parkId,participantId,version+1,hours,a.sub]);
 await m.query(`INSERT INTO hr_training_action(tenant_id,park_id,plan_id,participant_id,action,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,'correct','completed','completed','source history hours revision',$5)`,[s.tenantId,s.parkId,rows[0].plan_id,participantId,a.sub]);
 return {id:correction.id,correctionVersion:version+1};
}
