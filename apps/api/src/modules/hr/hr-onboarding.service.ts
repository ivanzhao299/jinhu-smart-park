import { BadRequestException,ConflictException,Injectable,NotFoundException,ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { DataSource,EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrOnboardingActionDto,HrOnboardingListDto,HrRehireOptionsDto,HrOnboardingReviewDto,SaveHrOnboardingApplicationDto } from "./dto/hr-onboarding.dto";
import { firstHrMutationRow } from "./hr-query-result";
import { typeormQueryRows } from "../../shared/property-workbench/typeorm-query-rows";

type ApplicationRow=Record<string,unknown>&{id:string;employee_id:string;candidate_id:string|null;applicant_user_id:string;status:string;application_date:string;planned_hire_date:string;probation_months:number;attendance_card_no:string;application_name:string};

@Injectable()
export class HrOnboardingService {
 constructor(private readonly db:DataSource){}

 async rehireOptions(s:TenantParkScope,a:JwtPrincipal,q:HrRehireOptionsDto){
  this.assertRehirePermission(a,"rehire");
  const params:unknown[]=[s.tenantId,s.parkId],where=["tenant_id=$1","park_id=$2","is_deleted=false",q.kind==="manager"?"employment_status IN ('probation','active','suspended')":"employment_status='departed'"];
  if(q.keyword){params.push(`%${q.keyword}%`);where.push(`(full_name ILIKE $${params.length} OR employee_code ILIKE $${params.length})`);}
  if(q.employeeId){params.push(q.employeeId);where.push(`id=$${params.length}`);}
  const count=await this.db.query(`SELECT count(*)::int total FROM hr_employee WHERE ${where.join(" AND ")}`,params);
  params.push(q.page_size,(q.page-1)*q.page_size);
  const items=await this.db.query(`SELECT id,employee_code "employeeCode",full_name "employeeName",version,primary_org_id "orgId",position_id "positionId",hire_date::text "hireDate",departure_date::text "departureDate" FROM hr_employee WHERE ${where.join(" AND ")} ORDER BY full_name,id LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  const [orgs,positions]=q.kind==="employee"?await Promise.all([
   this.db.query(`SELECT id,org_name "orgName" FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false AND status='enabled' ORDER BY org_name,id`,[s.tenantId,s.parkId]),
   this.db.query(`SELECT p.id,p.org_id "orgId",p.position_name "positionName" FROM hr_position p JOIN sys_org o ON o.id=p.org_id AND o.tenant_id=p.tenant_id AND o.park_id=p.park_id WHERE p.tenant_id=$1 AND p.park_id=$2 AND p.is_deleted=false AND p.status='enabled' AND o.is_deleted=false AND o.status='enabled' ORDER BY p.position_name,p.id`,[s.tenantId,s.parkId]),
  ]):[[],[]];
  return {items,total:Number(count[0]?.total??0),page:q.page,page_size:q.page_size,orgs,positions};
 }

 async list(s:TenantParkScope,q:HrOnboardingListDto){
  const params:unknown[]=[s.tenantId,s.parkId],where=["a.tenant_id=$1","a.park_id=$2","a.is_deleted=false"];
  if(q.entryType){params.push(q.entryType);where.push(`a.entry_type=$${params.length}`);}
  if(q.employeeId){params.push(q.employeeId);where.push(`a.employee_id=$${params.length}`);}
  if(q.status){params.push(q.status);where.push(`a.status=$${params.length}`);}
  if(q.keyword){params.push(`%${q.keyword}%`);where.push(`(a.application_no ILIKE $${params.length} OR a.application_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.full_name ILIKE $${params.length})`);}
  const count=await this.db.query(`SELECT count(*)::int total FROM hr_onboarding_application a JOIN hr_employee e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND e.park_id=a.park_id WHERE ${where.join(" AND ")}`,params) as Array<{total:number}>;
  params.push(q.page_size,(q.page-1)*q.page_size);
  const items=await this.db.query(`SELECT a.applicant_user_id "applicantUserId",o.org_name "targetOrgName",p.position_name "targetPositionName",mgr.full_name "targetManagerName",a.entry_type "entryType",a.expected_employee_version "expectedEmployeeVersion",a.target_org_id "targetOrgId",a.target_position_id "targetPositionId",a.target_manager_employee_id "targetManagerEmployeeId",a.rehire_before_snapshot "previousEmployment",a.id,a.application_no "applicationNo",a.application_name "applicationName",a.employee_id "employeeId",e.employee_code "employeeCode",e.full_name "employeeName",a.candidate_id "candidateId",a.application_date::text "applicationDate",a.planned_hire_date::text "plannedHireDate",a.probation_months "probationMonths",a.attendance_card_no "attendanceCardNo",a.status,a.review_comment "reviewComment",a.reviewed_at "reviewedAt",a.confirmed_at "confirmedAt",a.remark FROM hr_onboarding_application a JOIN hr_employee e ON e.id=a.employee_id AND e.tenant_id=a.tenant_id AND e.park_id=a.park_id LEFT JOIN sys_org o ON o.id=a.target_org_id AND o.tenant_id=a.tenant_id AND o.park_id=a.park_id LEFT JOIN hr_position p ON p.id=a.target_position_id AND p.tenant_id=a.tenant_id AND p.park_id=a.park_id LEFT JOIN hr_employee mgr ON mgr.id=a.target_manager_employee_id AND mgr.tenant_id=a.tenant_id AND mgr.park_id=a.park_id WHERE ${where.join(" AND ")} ORDER BY a.application_date DESC,a.create_time DESC,a.id LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  return {items,total:Number(count[0]?.total??0),page:q.page,page_size:q.page_size};
 }

 async create(s:TenantParkScope,a:JwtPrincipal,d:SaveHrOnboardingApplicationDto){
  this.validateDates(d);
  try{return await this.db.transaction(async m=>{
   this.assertRehirePermission(a,d.entryType);
   const employee=await this.assertReferences(m,s,d);
   const applicationNo=`RZ${new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)}${crypto.randomUUID().slice(0,6).toUpperCase()}`;
   const rows=await m.query(`INSERT INTO hr_onboarding_application(tenant_id,park_id,application_no,application_name,employee_id,candidate_id,applicant_user_id,application_date,planned_hire_date,probation_months,attendance_card_no,remark,create_by,update_by,entry_type,expected_employee_version,target_org_id,target_position_id,target_manager_employee_id,rehire_before_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$7,$7,$13,$14,$15,$16,$17,$18) RETURNING *`,[s.tenantId,s.parkId,applicationNo,d.applicationName,d.employeeId,d.candidateId??null,a.sub,d.applicationDate,d.plannedHireDate,d.probationMonths,d.attendanceCardNo,d.remark??null,d.entryType??"initial",d.expectedEmployeeVersion??null,d.targetOrgId??null,d.targetPositionId??null,d.targetManagerEmployeeId??null,JSON.stringify(d.entryType==="rehire"?employee:{})]) as ApplicationRow[];
   await this.append(m,s,rows[0]!.id,"created",null,"draft",a.sub,null);
   return this.project(rows[0]!);
  });}catch(e){this.translateConflict(e);}
 }

 async update(s:TenantParkScope,a:JwtPrincipal,id:string,d:SaveHrOnboardingApplicationDto){
  this.validateDates(d);
  try{return await this.db.transaction(async m=>{
   const row=await this.lock(m,s,id);
   if(!["draft","returned"].includes(row.status))throw new ConflictException("Only draft or returned onboarding applications can be edited");
   if((row.entry_type??"initial")!==(d.entryType??"initial"))throw new ConflictException("Application entry type cannot be changed");
   this.assertRehirePermission(a,d.entryType);
   const employee=await this.assertReferences(m,s,d);
   const updated=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET application_name=$1,employee_id=$2,candidate_id=$3,application_date=$4,planned_hire_date=$5,probation_months=$6,attendance_card_no=$7,remark=$8,expected_employee_version=$11,target_org_id=$12,target_position_id=$13,target_manager_employee_id=$14,rehire_before_snapshot=$15,review_comment=NULL,reviewed_by=NULL,reviewed_at=NULL,status='draft',update_by=$9,update_time=now(),version=version+1 WHERE id=$10 RETURNING *`,[d.applicationName,d.employeeId,d.candidateId??null,d.applicationDate,d.plannedHireDate,d.probationMonths,d.attendanceCardNo,d.remark??null,a.sub,id,d.expectedEmployeeVersion??null,d.targetOrgId??null,d.targetPositionId??null,d.targetManagerEmployeeId??null,JSON.stringify(d.entryType==="rehire"?employee:{})]));
   if(!updated)throw new ConflictException("Onboarding application changed concurrently");
   await this.append(m,s,id,"updated",row.status,"draft",a.sub,null);
   return this.project(updated);
  });}catch(e){this.translateConflict(e);}
 }

 async act(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrOnboardingActionDto){return this.db.transaction(async m=>{
  const row=await this.lock(m,s,id),allowed:Record<string,string[]>={submit:["draft"],resubmit:["returned"],cancel:row.entry_type==="rehire"?["draft","submitted","returned","approved"]:["draft","submitted","returned"]};
  if(!allowed[d.action]?.includes(row.status))throw new ConflictException("Onboarding action is not allowed from current status");
  this.assertRehirePermission(a,row.entry_type);
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
  if(d.action==="approve"&&row.entry_type==="rehire")await this.assertSubmitReady(m,s,row);
  const next=d.action==="approve"?"approved":"returned",action=d.action==="approve"?"approved":"returned";
  const updated=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET status=$1,review_comment=$2,reviewed_by=$3,reviewed_at=now(),update_by=$3,update_time=now(),version=version+1 WHERE id=$4 RETURNING *`,[next,d.comment??null,a.sub,id]));
  if(!updated)throw new ConflictException("Onboarding application changed concurrently");
  await this.append(m,s,id,action,"submitted",next,a.sub,d.comment??null);return this.project(updated);
 });}

 async confirm(s:TenantParkScope,a:JwtPrincipal,id:string){
  try{return await this.db.transaction(async m=>{
   const row=await this.lock(m,s,id);if(row.status!=="approved")throw new ConflictException("Only approved onboarding applications can be confirmed");
   this.assertRehirePermission(a,row.entry_type);
   const rehire=row.entry_type==="rehire";
   if(rehire){await this.assertSubmitReady(m,s,row);const dates=await m.query(`SELECT (now() AT TIME ZONE 'Asia/Shanghai')::date::text today`);if(String(row.planned_hire_date)>dates[0].today)throw new ConflictException("Rehire cannot take effect before the planned hire date");}
   const employees=await m.query(`SELECT id,employee_code,full_name,employment_status,primary_org_id,position_id,manager_employee_id,hire_date::text,departure_date::text,probation_end_date::text,attendance_card_no,version FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[row.employee_id,s.tenantId,s.parkId]) as Array<Record<string,unknown>>;
   const employee=employees[0];if(!employee)throw new NotFoundException("Employee not found");if(rehire){if(employee.employment_status!=="departed"||employee.version!==row.expected_employee_version)throw new ConflictException("Employee changed after rehire application; refresh and resubmit");}else if(employee.employment_status!=="preboarding")throw new ConflictException("Only preboarding employees can be confirmed");
   const status=row.probation_months>0?"probation":"active",eventType=row.probation_months>0?"start_probation":"confirm_employment";
   const changed=typeormQueryRows<Record<string,unknown>>(await m.query(`UPDATE hr_employee SET employment_status=$1,hire_date=$2,probation_end_date=CASE WHEN $3::int>0 THEN ($2::date+make_interval(months=>$3::int))::date ELSE NULL END,attendance_card_no=$4,primary_org_id=CASE WHEN $10::boolean THEN $11::uuid ELSE primary_org_id END,position_id=CASE WHEN $10::boolean THEN $12::uuid ELSE position_id END,manager_employee_id=CASE WHEN $10::boolean THEN $13::uuid ELSE manager_employee_id END,departure_date=CASE WHEN $10::boolean THEN NULL ELSE departure_date END,update_by=$5,update_time=now(),version=version+1 WHERE id=$6 AND tenant_id=$7 AND park_id=$8 AND is_deleted=false AND version=$9 RETURNING *`,[status,row.planned_hire_date,row.probation_months,row.attendance_card_no,a.sub,row.employee_id,s.tenantId,s.parkId,employee.version,rehire,row.target_org_id??null,row.target_position_id??null,row.target_manager_employee_id??null]));
   if(changed.length!==1||changed[0]?.version!==Number(employee.version)+1)throw new ConflictException("Employee changed concurrently");
   const updated=changed[0]!;
   await m.query(`INSERT INTO hr_employment_event(tenant_id,park_id,employee_id,event_type,effective_date,before_snapshot,after_snapshot,reason,status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'effective',$9,$9)`,[s.tenantId,s.parkId,row.employee_id,eventType,row.planned_hire_date,JSON.stringify(employee),JSON.stringify(updated),`${rehire?"回聘":"入职"}申请 ${row.application_name} 审批确认`,a.sub]);
   const confirmed=firstHrMutationRow<ApplicationRow>(await m.query(`UPDATE hr_onboarding_application SET status='confirmed',confirmed_by=$1,confirmed_at=now(),update_by=$1,update_time=now(),version=version+1 WHERE id=$2 RETURNING *`,[a.sub,id]));
   if(!confirmed)throw new ConflictException("Onboarding application changed concurrently");
   await this.append(m,s,id,"confirmed","approved","confirmed",a.sub,null);return this.project(confirmed);
  });}catch(e){this.translateConflict(e);}
 }

 private assertRehirePermission(a:JwtPrincipal,type:unknown){if(type!=="rehire")return;if(![HR_PERMISSIONS.HR_EMPLOYEE_MANAGE,HR_PERMISSIONS.HR_EMPLOYMENT_TRANSITION].every(p=>a.isSuper||a.permissions.includes("*")||a.permissions.includes(p)))throw new ForbiddenException("Rehire requires employee management and employment transition permissions");}
 private validateDates(d:SaveHrOnboardingApplicationDto){
  if(d.entryType==="rehire")for(const date of [d.applicationDate,d.plannedHireDate]){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new BadRequestException("Rehire dates must be valid calendar dates");}
  if(d.plannedHireDate<d.applicationDate)throw new BadRequestException("Planned hire date cannot be earlier than application date");}
 private async assertReferences(m:EntityManager,s:TenantParkScope,d:SaveHrOnboardingApplicationDto){
  const employees=await m.query(`SELECT id,employment_status,primary_org_id,position_id,manager_employee_id,hire_date::text,departure_date::text,probation_end_date::text,version FROM hr_employee WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE`,[d.employeeId,s.tenantId,s.parkId]) as Array<Record<string,unknown>&{id:string;employment_status:string;primary_org_id:string|null;position_id:string|null;departure_date:string|null;version:number}>;
  const employee=employees[0];if(!employee)throw new NotFoundException("Employee not found");if(d.entryType==="rehire"){
   if(employee.employment_status!=="departed")throw new ConflictException("Rehire requires a departed employee");
   if(!Number.isInteger(d.expectedEmployeeVersion)||d.expectedEmployeeVersion!==employee.version)throw new ConflictException("Employee changed after rehire application; refresh and resubmit");
   if(d.candidateId)throw new BadRequestException("Rehire uses the existing employee rather than a recruitment candidate");
   if(employee.departure_date&&d.plannedHireDate<=employee.departure_date)throw new BadRequestException("Rehire date must be after the previous departure date");
   const targets=await m.query(`SELECT p.id FROM hr_position p JOIN sys_org o ON o.id=p.org_id AND o.tenant_id=p.tenant_id AND o.park_id=p.park_id WHERE p.id=$1 AND o.id=$2 AND p.tenant_id=$3 AND p.park_id=$4 AND p.is_deleted=false AND o.is_deleted=false AND p.status='enabled' AND o.status='enabled' FOR SHARE OF p,o`,[d.targetPositionId,d.targetOrgId,s.tenantId,s.parkId]);
   if(!targets[0])throw new BadRequestException("Rehire organization and position are unavailable or outside the current scope");
   if(d.targetManagerEmployeeId===undefined)throw new BadRequestException("Choose a rehire manager or explicitly leave the position unassigned");
   if(d.targetManagerEmployeeId!==null){
    const managers=await m.query(`SELECT id FROM hr_employee WHERE id=$1 AND id<>$2 AND tenant_id=$3 AND park_id=$4 AND is_deleted=false AND employment_status IN ('probation','active','suspended') FOR SHARE`,[d.targetManagerEmployeeId,d.employeeId,s.tenantId,s.parkId]);
    if(!managers[0])throw new BadRequestException("Rehire manager is unavailable or outside the current scope");
   }
   return employee;
  }
  if(d.expectedEmployeeVersion!==undefined||d.targetOrgId!==undefined||d.targetPositionId!==undefined||d.targetManagerEmployeeId!==undefined)throw new BadRequestException("Rehire fields cannot be used for initial onboarding");
  if(employee.employment_status!=="preboarding")throw new ConflictException("Onboarding application requires a preboarding employee");
  if(!employee.primary_org_id||!employee.position_id)throw new BadRequestException("Preboarding employee must have an organization and position");
  if(d.candidateId){const candidates=await m.query(`SELECT id,converted_employee_id,stage FROM hr_candidate WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE`,[d.candidateId,s.tenantId,s.parkId]) as Array<{converted_employee_id:string|null;stage:string}>;if(!candidates[0]||candidates[0].converted_employee_id!==d.employeeId||candidates[0].stage!=="hired")throw new BadRequestException("Candidate is not the hired source of this employee");}
  return employee;
 }
 private async assertSubmitReady(m:EntityManager,s:TenantParkScope,row:ApplicationRow){await this.assertReferences(m,s,{entryType:row.entry_type as "initial"|"rehire"|undefined,expectedEmployeeVersion:(row.expected_employee_version??undefined) as number|undefined,targetOrgId:(row.target_org_id??undefined) as string|undefined,targetPositionId:(row.target_position_id??undefined) as string|undefined,targetManagerEmployeeId:row.entry_type==="rehire"?(row.target_manager_employee_id??null) as string|null:undefined,applicationName:row.application_name,employeeId:row.employee_id,candidateId:row.candidate_id??undefined,applicationDate:row.application_date,plannedHireDate:row.planned_hire_date,probationMonths:Number(row.probation_months),attendanceCardNo:row.attendance_card_no});}
 private async lock(m:EntityManager,s:TenantParkScope,id:string){const rows=await m.query(`SELECT *,application_date::text application_date,planned_hire_date::text planned_hire_date FROM hr_onboarding_application WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE`,[id,s.tenantId,s.parkId]) as ApplicationRow[];if(!rows[0])throw new NotFoundException("Onboarding application not found");return rows[0];}
 private async append(m:EntityManager,s:TenantParkScope,id:string,action:string,from:string|null,to:string,actor:string,comment:string|null){await m.query(`INSERT INTO hr_onboarding_application_action(tenant_id,park_id,application_id,sequence_no,action,from_status,to_status,comment,actor_user_id) SELECT $1::varchar,$2::varchar,$3::uuid,COALESCE(MAX(sequence_no),0)+1,$4::varchar,$5::varchar,$6::varchar,$7::text,$8::uuid FROM hr_onboarding_application_action WHERE tenant_id=$1::varchar AND park_id=$2::varchar AND application_id=$3::uuid`,[s.tenantId,s.parkId,id,action,from,to,comment,actor]);}
 private project(row:ApplicationRow){return {entryType:row.entry_type??"initial",expectedEmployeeVersion:row.expected_employee_version??null,targetOrgId:row.target_org_id??null,targetPositionId:row.target_position_id??null,targetManagerEmployeeId:row.target_manager_employee_id??null,previousEmployment:row.rehire_before_snapshot??{},id:row.id,applicationNo:row.application_no,applicationName:row.application_name,employeeId:row.employee_id,candidateId:row.candidate_id,applicationDate:row.application_date,plannedHireDate:row.planned_hire_date,probationMonths:Number(row.probation_months),attendanceCardNo:row.attendance_card_no,status:row.status,reviewComment:row.review_comment??null,reviewedAt:row.reviewed_at??null,confirmedAt:row.confirmed_at??null,remark:row.remark??null};}
 private translateConflict(error:unknown):never {if((error as {code?:string}).code==="23505")throw new ConflictException("Employee, attendance card or onboarding application already exists");throw error;}
}
