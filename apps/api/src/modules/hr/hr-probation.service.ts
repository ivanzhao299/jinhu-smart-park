import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import type {TenantParkScope} from "@jinhu/shared";
import {DataSource,EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {HrProbationActionDto,HrProbationListDto,HrProbationReviewDto,SaveHrProbationApplicationDto} from "./dto/hr-probation.dto";
import {firstHrMutationRow} from "./hr-query-result";

type ApplicationRow=Record<string,unknown>&{id:string;application_name:string;applicant_user_id:string;application_date:string;reason:string;status:string};
type ParticipantRow={id:string;employee_id:string;planned_confirmation_date:string;employee_code?:string;employee_name?:string;status:string};

@Injectable()
export class HrProbationService {
 constructor(private readonly db:DataSource){}

 async list(s:TenantParkScope,q:HrProbationListDto){
  const params:unknown[]=[s.tenantId,s.parkId],where=["a.tenant_id=$1","a.park_id=$2","a.is_deleted=false"];
  if(q.status){params.push(q.status);where.push(`a.status=$${params.length}`);}
  if(q.keyword){params.push(`%${q.keyword}%`);where.push(`(a.application_no ILIKE $${params.length} OR a.application_name ILIKE $${params.length} OR EXISTS(SELECT 1 FROM hr_probation_application_employee p JOIN hr_employee e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id AND e.park_id=p.park_id WHERE p.application_id=a.id AND p.tenant_id=a.tenant_id AND p.park_id=a.park_id AND p.is_deleted=false AND (e.employee_code ILIKE $${params.length} OR e.full_name ILIKE $${params.length})))`);}
  const count=await this.db.query(`SELECT count(*)::int total FROM hr_probation_application a WHERE ${where.join(" AND ")}`,params) as Array<{total:number}>;
  params.push(q.page_size,(q.page-1)*q.page_size);
  const rows=await this.db.query(`SELECT a.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'employeeId',p.employee_id,'employeeCode',e.employee_code,'employeeName',e.full_name,'plannedConfirmationDate',p.planned_confirmation_date,'confirmedDate',p.confirmed_date,'status',p.status) ORDER BY e.employee_code,p.id) FROM hr_probation_application_employee p JOIN hr_employee e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id AND e.park_id=p.park_id WHERE p.application_id=a.id AND p.tenant_id=a.tenant_id AND p.park_id=a.park_id AND p.is_deleted=false),'[]'::jsonb) participants FROM hr_probation_application a WHERE ${where.join(" AND ")} ORDER BY a.application_date DESC,a.create_time DESC,a.id LIMIT $${params.length-1} OFFSET $${params.length}`,params) as ApplicationRow[];
  return {items:rows.map(row=>this.project(row)),total:Number(count[0]?.total??0),page:q.page,page_size:q.page_size};
 }

 async create(s:TenantParkScope,a:JwtPrincipal,d:SaveHrProbationApplicationDto){this.validate(d);try{return await this.db.transaction(async m=>{
  await this.assertParticipants(m,s,d);
  const no=`ZZ${new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)}${crypto.randomUUID().slice(0,6).toUpperCase()}`;
  const rows=await m.query(`INSERT INTO hr_probation_application(tenant_id,park_id,application_no,application_name,applicant_user_id,application_date,reason,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$5,$5) RETURNING *`,[s.tenantId,s.parkId,no,d.applicationName,a.sub,d.applicationDate,d.reason]) as ApplicationRow[];
  await this.replaceParticipants(m,s,rows[0]!.id,d,a.sub);
  await this.append(m,s,rows[0]!.id,"created",null,"draft",a.sub,null);
  return this.detail(m,s,rows[0]!.id);
 });}catch(e){this.translate(e);}}

 async update(s:TenantParkScope,a:JwtPrincipal,id:string,d:SaveHrProbationApplicationDto){this.validate(d);try{return await this.db.transaction(async m=>{
  const row=await this.lock(m,s,id);if(!["draft","returned"].includes(row.status))throw new ConflictException("Only draft or returned probation applications can be edited");
  await this.assertParticipants(m,s,d,id);
  await m.query(`UPDATE hr_probation_application SET application_name=$1,application_date=$2,reason=$3,status='draft',participant_snapshot=NULL,review_comment=NULL,reviewed_by=NULL,reviewed_at=NULL,update_by=$4,update_time=now(),version=version+1 WHERE id=$5`,[d.applicationName,d.applicationDate,d.reason,a.sub,id]);
  await this.replaceParticipants(m,s,id,d,a.sub);
  await this.append(m,s,id,"updated",row.status,"draft",a.sub,null);
  return this.detail(m,s,id);
 });}catch(e){this.translate(e);}}

 async act(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrProbationActionDto){return this.db.transaction(async m=>{
  const row=await this.lock(m,s,id),allowed:Record<string,string[]>={submit:["draft"],resubmit:["returned"],cancel:["draft","submitted","returned"]};
  if(!allowed[d.action]?.includes(row.status))throw new ConflictException("Probation action is not allowed from current status");
  const participants=await this.participants(m,s,id,true);if(!participants.length)throw new BadRequestException("At least one probation employee is required");
  if(d.action!=="cancel")await this.assertCurrentProbation(m,s,participants);
  const next=d.action==="cancel"?"cancelled":"submitted",action=d.action==="submit"?"submitted":d.action==="resubmit"?"resubmitted":"cancelled";
  const snapshot=d.action==="cancel"?(row.participant_snapshot==null?null:JSON.stringify(row.participant_snapshot)):JSON.stringify(participants.map(p=>({employeeId:p.employee_id,plannedConfirmationDate:p.planned_confirmation_date})));
  await m.query(`UPDATE hr_probation_application SET status=$1,participant_snapshot=$2,review_comment=NULL,reviewed_by=NULL,reviewed_at=NULL,update_by=$3,update_time=now(),version=version+1 WHERE id=$4`,[next,snapshot,a.sub,id]);
  if(d.action==="cancel")await m.query(`UPDATE hr_probation_application_employee SET status='cancelled',update_by=$1,update_time=now(),version=version+1 WHERE tenant_id=$2 AND park_id=$3 AND application_id=$4 AND is_deleted=false AND status='pending'`,[a.sub,s.tenantId,s.parkId,id]);
  await this.append(m,s,id,action,row.status,next,a.sub,d.comment??null);return this.detail(m,s,id);
 });}

 async review(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrProbationReviewDto){return this.db.transaction(async m=>{
  const row=await this.lock(m,s,id);if(row.status!=="submitted")throw new ConflictException("Only submitted probation applications can be reviewed");
  if(row.applicant_user_id===a.sub)throw new ForbiddenException("Applicants cannot review their own probation application");
  if(d.action==="return"&&!d.comment?.trim())throw new BadRequestException("A return comment is required");
  const next=d.action==="approve"?"approved":"returned";
  await m.query(`UPDATE hr_probation_application SET status=$1,review_comment=$2,reviewed_by=$3,reviewed_at=now(),update_by=$3,update_time=now(),version=version+1 WHERE id=$4`,[next,d.comment??null,a.sub,id]);
  await this.append(m,s,id,next,"submitted",next,a.sub,d.comment??null);return this.detail(m,s,id);
 });}

 async confirm(s:TenantParkScope,a:JwtPrincipal,id:string){try{return await this.db.transaction(async m=>{
  const row=await this.lock(m,s,id);if(row.status!=="approved")throw new ConflictException("Only approved probation applications can be confirmed");
  const participants=await this.participants(m,s,id,true);if(!participants.length)throw new BadRequestException("At least one probation employee is required");
  const employees=await this.assertCurrentProbation(m,s,participants,true),byId=new Map(employees.map(e=>[String(e.id),e]));
  for(const p of participants){
   const employee=byId.get(p.employee_id)!;
   const updated=firstHrMutationRow<Record<string,unknown>>(await m.query(`UPDATE hr_employee SET employment_status='active',probation_end_date=$1,update_by=$2,update_time=now(),version=version+1 WHERE id=$3 RETURNING id,employee_code,full_name,employment_status,primary_org_id,position_id,hire_date::text hire_date,probation_end_date::text probation_end_date`,[p.planned_confirmation_date,a.sub,p.employee_id]));
   if(!updated)throw new ConflictException("Employee changed concurrently");
   await m.query(`INSERT INTO hr_employment_event(tenant_id,park_id,employee_id,event_type,effective_date,before_snapshot,after_snapshot,reason,status,create_by,update_by) VALUES($1,$2,$3,'confirm_employment',$4,$5,$6,$7,'effective',$8,$8)`,[s.tenantId,s.parkId,p.employee_id,p.planned_confirmation_date,JSON.stringify(employee),JSON.stringify(updated),`转正申请 ${row.application_name} 审批确认`,a.sub]);
   await m.query(`UPDATE hr_probation_application_employee SET status='confirmed',confirmed_date=$1,update_by=$2,update_time=now(),version=version+1 WHERE id=$3`,[p.planned_confirmation_date,a.sub,p.id]);
  }
  await m.query(`UPDATE hr_probation_application SET status='confirmed',confirmed_by=$1,confirmed_at=now(),update_by=$1,update_time=now(),version=version+1 WHERE id=$2`,[a.sub,id]);
  await this.append(m,s,id,"confirmed","approved","confirmed",a.sub,null);return this.detail(m,s,id);
 });}catch(e){this.translate(e);}}

 private validate(d:SaveHrProbationApplicationDto){const ids=d.participants.map(p=>p.employeeId);if(new Set(ids).size!==ids.length)throw new BadRequestException("Probation employees must be unique");if(d.participants.some(p=>p.plannedConfirmationDate<d.applicationDate))throw new BadRequestException("Planned confirmation date cannot be earlier than application date");}
 private async assertParticipants(m:EntityManager,s:TenantParkScope,d:SaveHrProbationApplicationDto,currentId?:string){
  const ids=[...d.participants.map(p=>p.employeeId)].sort(),rows=await m.query(`SELECT id,employment_status FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND is_deleted=false ORDER BY id FOR SHARE`,[s.tenantId,s.parkId,ids]) as Array<{id:string;employment_status:string}>;
  if(rows.length!==ids.length)throw new NotFoundException("One or more employees were not found");if(rows.some(r=>r.employment_status!=="probation"))throw new ConflictException("Only probation employees can enter a confirmation application");
  const active=await m.query(`SELECT employee_id FROM hr_probation_application_employee WHERE tenant_id=$1 AND park_id=$2 AND employee_id=ANY($3::uuid[]) AND is_deleted=false AND status='pending' AND ($4::uuid IS NULL OR application_id<>$4::uuid) LIMIT 1`,[s.tenantId,s.parkId,ids,currentId??null]);if(active.length)throw new ConflictException("An employee already has an active probation application");
 }
 private async replaceParticipants(m:EntityManager,s:TenantParkScope,id:string,d:SaveHrProbationApplicationDto,actor:string){
  await m.query(`DELETE FROM hr_probation_application_employee WHERE tenant_id=$1 AND park_id=$2 AND application_id=$3 AND status='pending'`,[s.tenantId,s.parkId,id]);
  for(const p of [...d.participants].sort((x,y)=>x.employeeId.localeCompare(y.employeeId)))await m.query(`INSERT INTO hr_probation_application_employee(tenant_id,park_id,application_id,employee_id,planned_confirmation_date,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$6)`,[s.tenantId,s.parkId,id,p.employeeId,p.plannedConfirmationDate,actor]);
 }
 private async assertCurrentProbation(m:EntityManager,s:TenantParkScope,participants:ParticipantRow[],lock=false){const ids=participants.map(p=>p.employee_id).sort(),rows=await m.query(`SELECT id,employee_code,full_name,employment_status,primary_org_id,position_id,hire_date::text hire_date,probation_end_date::text probation_end_date FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND id=ANY($3::uuid[]) AND is_deleted=false ORDER BY id ${lock?"FOR UPDATE":"FOR SHARE"}`,[s.tenantId,s.parkId,ids]) as Array<Record<string,unknown>>;if(rows.length!==ids.length)throw new NotFoundException("One or more employees were not found");if(rows.some(r=>r.employment_status!=="probation"))throw new ConflictException("All employees must still be in probation");return rows;}
 private async participants(m:EntityManager,s:TenantParkScope,id:string,lock=false){return m.query(`SELECT p.id,p.employee_id,p.planned_confirmation_date::text planned_confirmation_date,p.status,e.employee_code,e.full_name employee_name FROM hr_probation_application_employee p JOIN hr_employee e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id AND e.park_id=p.park_id WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.application_id=$3 AND p.is_deleted=false ORDER BY p.employee_id ${lock?"FOR UPDATE OF p":""}`,[s.tenantId,s.parkId,id]) as Promise<ParticipantRow[]>;}
 private async lock(m:EntityManager,s:TenantParkScope,id:string){const rows=await m.query(`SELECT * FROM hr_probation_application WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,s.tenantId,s.parkId]) as ApplicationRow[];if(!rows[0])throw new NotFoundException("Probation application not found");return rows[0];}
 private async detail(m:EntityManager,s:TenantParkScope,id:string){const rows=await m.query(`SELECT a.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'employeeId',p.employee_id,'employeeCode',e.employee_code,'employeeName',e.full_name,'plannedConfirmationDate',p.planned_confirmation_date,'confirmedDate',p.confirmed_date,'status',p.status) ORDER BY e.employee_code,p.id) FROM hr_probation_application_employee p JOIN hr_employee e ON e.id=p.employee_id AND e.tenant_id=p.tenant_id AND e.park_id=p.park_id WHERE p.application_id=a.id AND p.tenant_id=a.tenant_id AND p.park_id=a.park_id AND p.is_deleted=false),'[]'::jsonb) participants FROM hr_probation_application a WHERE a.id=$1 AND a.tenant_id=$2 AND a.park_id=$3 AND a.is_deleted=false`,[id,s.tenantId,s.parkId]) as ApplicationRow[];if(!rows[0])throw new NotFoundException("Probation application not found");return this.project(rows[0]);}
 private async append(m:EntityManager,s:TenantParkScope,id:string,action:string,from:string|null,to:string,actor:string,comment:string|null){await m.query(`INSERT INTO hr_probation_application_action(tenant_id,park_id,application_id,sequence_no,action,from_status,to_status,comment,actor_user_id) SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(MAX(sequence_no),0)+1,$4::varchar,$5::varchar,$6::varchar,$7::text,$8::uuid FROM hr_probation_application_action WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND application_id=$3::uuid`,[s.tenantId,s.parkId,id,action,from,to,comment,actor]);}
 private project(row:ApplicationRow){return {id:row.id,applicationNo:row.application_no,applicationName:row.application_name,applicationDate:row.application_date,reason:row.reason,status:row.status,reviewComment:row.review_comment??null,reviewedAt:row.reviewed_at??null,confirmedAt:row.confirmed_at??null,participants:row.participants??[]};}
 private translate(error:unknown):never {if((error as {code?:string}).code==="23505")throw new ConflictException("Probation application number or active employee already exists");throw error;}
}
