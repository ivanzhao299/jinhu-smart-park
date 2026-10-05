import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, YUZHOU_TRAINING_SCORE_POLICY, type TenantParkScope } from "@jinhu/shared";
import { isUUID } from "class-validator";
import type { EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

import { lockTrainingParticipantPlan } from "./hr-training-locks";

import { isTrainingCalendarDate, type TrainingPlanFactChanges } from "./hr-training-plan-facts";

export type TrainingHistoryFacts = { courseName:string; startDate:string; endDate:string; hours:string; memo?:string|null; score?:string|null };
const requiredKeys=["courseName","startDate","endDate","hours"] as const;
const keys=[...requiredKeys,"memo","score"] as const;
const bad=():never=>{throw new BadRequestException("TRAINING_IMPORT_FACTS_INVALID");};
export function normalizeTrainingImportScore(value:unknown):string|null {
 if(value===null)return null;
 const {fractionDigits,maxScaled,maxSourceWholeDigits}=YUZHOU_TRAINING_SCORE_POLICY,scale=10n**BigInt(fractionDigits);
 if(typeof value!=="string"||!new RegExp(`^\\d{1,${maxSourceWholeDigits}}(?:\\.\\d{1,${fractionDigits}})?$`).test(value))return bad();
 const [whole="0",fraction=""]=value.split("."),minor=BigInt(whole)*scale+BigInt(fraction.padEnd(fractionDigits,"0"));
 if(minor>BigInt(maxScaled))return bad();
 return `${minor/scale}.${String(minor%scale).padStart(fractionDigits,"0")}`;
}
export function normalizeTrainingHistoryFacts(value:unknown):TrainingHistoryFacts {
 if(!value||typeof value!=="object"||Array.isArray(value))return bad();
 const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!keys.includes(k as typeof keys[number]))||!requiredKeys.every(k=>Object.hasOwn(v,k))||typeof v.courseName!=="string"||!v.courseName.trim()||v.courseName.trim().length>160||v.courseName.includes("\0")||/\p{Surrogate}/u.test(v.courseName)
 ||!isTrainingCalendarDate(v.startDate)||!isTrainingCalendarDate(v.endDate)||v.endDate<v.startDate||typeof v.hours!=="string"||!/^[1-9]\d{0,5}$/.test(v.hours)||Number(v.hours)>999999)return bad();
 if(Object.hasOwn(v,"memo")&&v.memo!==null&&(typeof v.memo!=="string"||v.memo.length>2000||v.memo.includes("\0")||/\p{Surrogate}/u.test(v.memo)))return bad();
 return {courseName:v.courseName.trim(),startDate:v.startDate,endDate:v.endDate,hours:v.hours,...(Object.hasOwn(v,"memo")?{memo:v.memo as string|null}:{}),...(Object.hasOwn(v,"score")?{score:normalizeTrainingImportScore(v.score)}:{})};
}
export function planTrainingHistoryFacts(incoming:unknown,source:Readonly<Partial<TrainingHistoryFacts>>,current:Readonly<TrainingHistoryFacts>,baseline:Readonly<Partial<TrainingHistoryFacts>>) {
 const facts=normalizeTrainingHistoryFacts(incoming),changedFields:string[]=[],conflictFields:string[]=[];
 const correctedPlanFacts:TrainingPlanFactChanges={};
 let correctedHours:string|undefined;
 let correctedMemo:string|null|undefined;
 let correctedScore:string|null|undefined;
 for(const key of keys){
  if(!Object.hasOwn(facts,key))continue;
  if(!Object.hasOwn(source,key)||!Object.hasOwn(baseline,key)){if(!conflictFields.includes("INITIAL_FIELD_BASELINE_UNKNOWN"))conflictFields.push("INITIAL_FIELD_BASELINE_UNKNOWN");conflictFields.push(key);continue;}
  if(facts[key]===source[key])continue;
  changedFields.push(key);
  if(facts[key]===current[key])continue;
  if(current[key]!==baseline[key]){conflictFields.push(key);continue;}
  if(key==="courseName"||key==="startDate"||key==="endDate")correctedPlanFacts[key]=facts[key];
  else if(key==="hours")correctedHours=facts.hours;
  else if(key==="memo")correctedMemo=facts.memo;
  else if(key==="score")correctedScore=facts.score;
 }
 if((correctedPlanFacts.endDate??current.endDate)<(correctedPlanFacts.startDate??current.startDate))conflictFields.push("TRAINING_PLAN_FACTS_DATE_RANGE_INVALID");
 return {action:conflictFields.length?"conflict" as const:changedFields.length?"update" as const:"unchanged" as const,changedFields,conflictFields,correctedPlanFacts:conflictFields.length?undefined:correctedPlanFacts,correctedHours:conflictFields.length?undefined:correctedHours,correctedMemo:conflictFields.length?undefined:correctedMemo,correctedScore:conflictFields.length?undefined:correctedScore};
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
 await m.query(`UPDATE hr_training_participant SET status='completed',completed_at=($4::date::timestamp AT TIME ZONE 'Asia/Shanghai'),completed_hours=$5::numeric,memo=$6,score=$7::numeric,version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[...common,participant.id,facts.endDate,facts.hours,facts.memo??null,facts.score??null]);
 await m.query(`UPDATE hr_training_plan SET status='completed',completed_at=now(),version=version+1 WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[...common,plan.id]);
 for(const [action,from,to,participantId] of [["publish","draft","published",null],["start","published","in_progress",null],["complete","assigned","completed",participant.id],["complete","in_progress","completed",null]])await m.query(`INSERT INTO hr_training_action(tenant_id,park_id,plan_id,participant_id,action,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,'imported source history',$8)`,[...common,plan.id,participantId,action,from,to,a.sub]);
 return {courseId:course.id,courseVersionId:version.id,planId:plan.id,participantId:participant.id,participantVersion:2,correctionVersion:0};
}
/** Appends a source-hours amendment; never updates frozen completion or snapshot. */
export async function correctTrainingHistoryHoursInTransaction(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,participantId:string,expectedVersion:number,hours:string) {
 return correctTrainingHistoryFactsInTransaction(m,s,a,participantId,expectedVersion,{hours});
}
/** Hours, memo and score amend together under one participant lock and sequence fence. */
export async function correctTrainingHistoryFactsInTransaction(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,participantId:string,expectedVersion:number,fields:{hours?:string;memo?:string|null;score?:string|null}) {
 requireTransaction(m,s,a,[HR_PERMISSIONS.HR_TRAINING_PROGRESS_MANAGE]);
 const {hours,memo,score}=fields;
 if(score!==undefined)normalizeTrainingImportScore(score);
 if(!isUUID(participantId)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||(hours===undefined&&memo===undefined&&score===undefined)||(hours!==undefined&&(!/^[1-9]\d{0,5}$/.test(hours)||Number(hours)>999999))||(memo!==undefined&&memo!==null&&(typeof memo!=="string"||memo.length>2000||memo.includes("\0")||/\p{Surrogate}/u.test(memo))))throw new BadRequestException("TRAINING_IMPORT_CORRECTION_INVALID");
 await lockTrainingParticipantPlan(m,s,participantId);
 const rows=await m.query(`SELECT t.id,t.plan_id FROM hr_training_participant t JOIN hr_training_plan p ON p.id=t.plan_id AND p.tenant_id=t.tenant_id AND p.park_id=t.park_id JOIN hr_employee e ON e.id=t.employee_id AND e.tenant_id=t.tenant_id AND e.park_id=t.park_id WHERE t.tenant_id=$1 AND t.park_id=$2 AND t.id=$3 AND t.status='completed' AND NOT p.is_deleted AND p.status='completed' AND NOT e.is_deleted FOR UPDATE OF t`,[s.tenantId,s.parkId,participantId]);
 if(rows.length!==1)throw new NotFoundException("Completed training participant not found");
 const version=Number((await m.query(`SELECT COALESCE(max(sequence_no),0)::int n FROM hr_training_result_correction WHERE tenant_id=$1 AND park_id=$2 AND participant_id=$3`,[s.tenantId,s.parkId,participantId]))[0]?.n);
 if(version!==expectedVersion)throw new ConflictException("TRAINING_IMPORT_CORRECTION_STALE");
 const correction=await one(m,`INSERT INTO hr_training_result_correction(tenant_id,park_id,participant_id,sequence_no,corrected_hours,reason,create_by,corrected_memo,memo_present,corrected_score,score_cleared) VALUES($1,$2,$3,$4,$5::numeric,'source history facts revision',$6,$7,$8,$9::numeric,$10) RETURNING id`,[s.tenantId,s.parkId,participantId,version+1,hours??null,a.sub,memo??null,memo!==undefined,score??null,score===null]);
 await m.query(`INSERT INTO hr_training_action(tenant_id,park_id,plan_id,participant_id,action,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,'correct','completed','completed','source history facts revision',$5)`,[s.tenantId,s.parkId,rows[0].plan_id,participantId,a.sub]);
 return {id:correction.id,correctionVersion:version+1};
}
