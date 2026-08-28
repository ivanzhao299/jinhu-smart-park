import { BadRequestException,ConflictException,Injectable,NotFoundException,ForbiddenException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { DataSource,EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrOnboardingActionDto,HrOnboardingListDto,HrOnboardingReviewDto,SaveHrOnboardingApplicationDto } from "./dto/hr-onboarding.dto";
import { firstHrMutationRow } from "./hr-query-result";

type ApplicationRow=Record<string,unknown>&{id:string;employee_id:string;candidate_id:string|null;applicant_user_id:string;status:string;application_date:string;planned_hire_date:string;probation_months:number;attendance_card_no:string;application_name:string};

@Injectable()
export class HrOnboardingService {
 constructor(private readonly db:DataSource){}

 async list(s:TenantParkScope,q:HrOnboardingListDto){
  const params:unknown[]=[s.tenantId,s.parkId],where=["a.tenant_id=$1","a.park_id=$2","a.is_deleted=false"];
  if(q.status){params.push(q.status);where.push(`a.status=$${params.length}`);}
  if(q.keyword){params.push(`%${q.keyword}%`);where.push(`(a.application_no ILIKE $${params.length} OR a.application_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.full_name ILIKE $${params.length})`);}
  const count=await this.db.query(`SELECT count(*)::int total FROM hr_onboarding_application a JOIN hr_employee e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND e.park_id=a.park_id WHERE ${where.join(" AND ")}`,params) as Array<{total:number}>;
  params.push(q.page_size,(q.page-1)*q.page_size);
  const items=await this.db.query(`SELECT a.id,a.application_no "applicationNo",a.application_name "applicationName",a.employee_id "employeeId",e.employee_code "employeeCode",e.full_name "employeeName",a.candidate_id "candidateId",a.application_date "applicationDate",a.planned_hire_date "plannedHireDate",a.probation_months "probationMonths",a.attendance_card_no "attendanceCardNo",a.status,a.review_comment "reviewComment",a.reviewed_at "reviewedAt",a.confirmed_at "confirmedAt",a.remark FROM hr_onboarding_application a JOIN hr_employee e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND e.park_id=a.park_id WHERE ${where.join(" AND ")} ORDER BY a.application_date DESC,a.create_time DESC,a.id LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  return {items,total:Number(count[0]?.total??0),page:q.page,page_size:q.page_size};
 }

 async create(s:TenantParkScope,a:JwtPrincipal,d:SaveHrOnboardingApplicationDto){
  this.validateDates(d);
  try{return await this.db.transaction(async m=>{
   await this.assertReferences(m,s,d);
   const applicationNo=`RZ${new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)}${crypto.randomUUID().slice(0,6).toUpperCase()}`;
   const rows=await m.query(`INSERT INTO hr_onboarding_application(tenant_id,park_id,application_no,application_name,employee_id,candidate_id,applicant_user_id,application_date,planned_hire_date,probation_months,attendance_card_no,remark,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$7,$7) RETURNING *`,[s.tenantId,s.parkId,applicationNo,d.applicationName,d.employeeId,d.candidateId??null,a.sub,d.applicationDate,d.plannedHireDate,d.probationMonths,d.attendanceCardNo,d.remark??null]) as ApplicationRow[];
   await this.append(m,s,rows[0]!.id,"created",null,"draft",a.sub,null);
   return this.project(rows[0]!);
  });}catch(e){this.translateConflict(e);}
 }

 async update(s:TenantParkScope,a:JwtPrincipal,id:string,d:SaveHrOnboardingApplicationDto){
  this.validateDates(d);
  try{return await this.db.transaction(async m=>{
   const row=await this.lock(m,s,id);
   if(!["draft","returned"].includes(row.status))throw new ConflictException("Only draft or returned onboarding applications can be edited");
   await this.assertReferences(m,s,d);
   const updated=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET application_name=$1,employee_id=$2,candidate_id=$3,application_date=$4,planned_hire_date=$5,probation_months=$6,attendance_card_no=$7,remark=$8,review_comment=NULL,reviewed_by=NULL,reviewed_at=NULL,status='draft',update_by=$9,update_time=now(),version=version+1 WHERE id=$10 RETURNING *`,[d.applicationName,d.employeeId,d.candidateId??null,d.applicationDate,d.plannedHireDate,d.probationMonths,d.attendanceCardNo,d.remark??null,a.sub,id]));
   if(!updated)throw new ConflictException("Onboarding application changed concurrently");
   await this.append(m,s,id,"updated",row.status,"draft",a.sub,null);
   return this.project(updated);
  });}catch(e){this.translateConflict(e);}
 }

 async act(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrOnboardingActionDto){return this.db.transaction(async m=>{
  const row=await this.lock(m,s,id),allowed:Record<string,string[]>={submit:["draft"],resubmit:["returned"],cancel:["draft","submitted","returned"]};
  if(!allowed[d.action]?.includes(row.status))throw new ConflictException("Onboarding action is not allowed from current status");
  if(d.action!=="cancel")await this.assertSubmitReady(m,s,row);
  const next=d.action==="cancel"?"cancelled":"submitted",action=d.action==="submit"?"submitted":d.action==="resubmit"?"resubmitted":"cancelled";
  const updated=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET status=$1,review_comment=NULL,reviewed_by=NULL,reviewed_at=NULL,update_by=$2,update_time=now(),version=version+1 WHERE id=$3 RETURNING *`,[next,a.sub,id]));
  if(!updated)throw new ConflictException("Onboarding application changed concurrently");
  await this.append(m,s,id,action,row.status,next,a.sub,d.comment??null);return this.project(updated);
 });}

 async review(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrOnboardingReviewDto){return this.db.transaction(async m=>{
  const row=await this.lock(m,s,id);if(row.status!=="submitted")throw new ConflictException("Only submitted onboarding applications can be reviewed");
  if(row.applicant_user_id===a.sub)throw new ForbiddenException("Applicants cannot review their own onboarding application");
  if(d.action==="return"&&!d.comment?.trim())throw new BadRequestException("A return comment is required");
  const next=d.action==="approve"?"approved":"returned",action=d.action==="approve"?"approved":"returned";
  const updated=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET status=$1,review_comment=$2,reviewed_by=$3,reviewed_at=now(),update_by=$3,update_time=now(),version=version+1 WHERE id=$4 RETURNING *`,[next,d.comment??null,a.sub,id]));
  if(!updated)throw new ConflictException("Onboarding application changed concurrently");
  await this.append(m,s,id,action,"submitted",next,a.sub,d.comment??null);return this.project(updated);
 });}

 async confirm(s:TenantParkScope,a:JwtPrincipal,id:string){
  try{return await this.db.transaction(async m=>{
   const row=await this.lock(m,s,id);if(row.status!=="approved")throw new ConflictException("Only approved onboarding applications can be confirmed");
   const employees=await m.query(`SELECT id,employee_code,full_name,employment_status,primary_org_id,position_id,hire_date,probation_end_date,attendance_card_no FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[row.employee_id,s.tenantId,s.parkId]) as Array<Record<string,unknown>>;
   const employee=employees[0];if(!employee)throw new NotFoundException("Employee not found");if(employee.employment_status!=="preboarding")throw new ConflictException("Only preboarding employees can be confirmed");
   const status=row.probation_months>0?"probation":"active",eventType=row.probation_months>0?"start_probation":"confirm_employment";
   const updated=firstHrMutationRow<Record<string,unknown>>(await m.query(`UPDATE hr_employee SET employment_status=$1,hire_date=$2,probation_end_date=CASE WHEN $3::int>0 THEN ($2::date+make_interval(months=>$3::int))::date ELSE NULL END,attendance_card_no=$4,update_by=$5,update_time=now(),version=version+1 WHERE id=$6 RETURNING *`,[status,row.planned_hire_date,row.probation_months,row.attendance_card_no,a.sub,row.employee_id]));
   if(!updated)throw new ConflictException("Employee changed concurrently");
   await m.query(`INSERT INTO hr_employment_event(tenant_id,park_id,employee_id,event_type,effective_date,before_snapshot,after_snapshot,reason,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'effective',$9,$9)`,[s.tenantId,s.parkId,row.employee_id,eventType,row.planned_hire_date,JSON.stringify(employee),JSON.stringify(updated),`入职申请 ${row.application_name} 审批确认`,a.sub]);
   const confirmed=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET status='confirmed',confirmed_by=$1,confirmed_at=now(),update_by=$1,update_time=now(),version=version+1 WHERE id=$2 RETURNING *`,[a.sub,id]));
   if(!confirmed)throw new ConflictException("Onboarding application changed concurrently");
   await this.append(m,s,id,"confirmed","approved","confirmed",a.sub,null);return this.project(confirmed);
  });}catch(e){this.translateConflict(e);}
 }

 private validateDates(d:SaveHrOnboardingApplicationDto){if(d.plannedHireDate<d.applicationDate)throw new BadRequestException("Planned hire date cannot be earlier than application date");}
 private async assertReferences(m:EntityManager,s:TenantParkScope,d:SaveHrOnboardingApplicationDto){
  const employees=await m.query(`SELECT id,employment_status,primary_org_id,position_id FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE`,[d.employeeId,s.tenantId,s.parkId]) as Array<{id:string;employment_status:string;primary_org_id:string|null;position_id:string|null}>;
  const employee=employees[0];if(!employee)throw new NotFoundException("Employee not found");if(employee.employment_status!=="preboarding")throw new ConflictException("Onboarding application requires a preboarding employee");
  if(!employee.primary_org_id||!employee.position_id)throw new BadRequestException("Preboarding employee must have an organization and position");
  if(d.candidateId){const candidates=await m.query(`SELECT id,converted_employee_id,stage FROM hr_candidate WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE`,[d.candidateId,s.tenantId,s.parkId]) as Array<{converted_employee_id:string|null;stage:string}>;if(!candidates[0]||candidates[0].converted_employee_id!==d.employeeId||candidates[0].stage!=="hired")throw new BadRequestException("Candidate is not the hired source of this employee");}
 }
 private async assertSubmitReady(m:EntityManager,s:TenantParkScope,row:ApplicationRow){await this.assertReferences(m,s,{applicationName:row.application_name,employeeId:row.employee_id,candidateId:row.candidate_id??undefined,applicationDate:row.application_date,plannedHireDate:row.planned_hire_date,probationMonths:Number(row.probation_months),attendanceCardNo:row.attendance_card_no});}
 private async lock(m:EntityManager,s:TenantParkScope,id:string){const rows=await m.query(`SELECT * FROM hr_onboarding_application WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,s.tenantId,s.parkId]) as ApplicationRow[];if(!rows[0])throw new NotFoundException("Onboarding application not found");return rows[0];}
 private async append(m:EntityManager,s:TenantParkScope,id:string,action:string,from:string|null,to:string,actor:string,comment:string|null){await m.query(`INSERT INTO hr_onboarding_application_action(tenant_id,park_id,application_id,sequence_no,action,from_status,to_status,comment,actor_user_id) SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(MAX(sequence_no),0)+1,$4::varchar,$5::varchar,$6::varchar,$7::text,$8::uuid FROM hr_onboarding_application_action WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND application_id=$3::uuid`,[s.tenantId,s.parkId,id,action,from,to,comment,actor]);}
 private project(row:ApplicationRow){return {id:row.id,applicationNo:row.application_no,applicationName:row.application_name,employeeId:row.employee_id,candidateId:row.candidate_id,applicationDate:row.application_date,plannedHireDate:row.planned_hire_date,probationMonths:Number(row.probation_months),attendanceCardNo:row.attendance_card_no,status:row.status,reviewComment:row.review_comment??null,reviewedAt:row.reviewed_at??null,confirmedAt:row.confirmed_at??null,remark:row.remark??null};}
 private translateConflict(error:unknown):never {if((error as {code?:string}).code==="23505")throw new ConflictException("Employee, attendance card or onboarding application already exists");throw error;}
}
