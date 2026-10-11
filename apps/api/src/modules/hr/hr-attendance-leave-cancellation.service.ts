import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope,type HrLeaveCancellationRecord,type HrLeaveCancellationStatus} from "@jinhu/shared";
import {randomUUID} from "node:crypto";
import {DataSource,type EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditService} from "../audit/audit.service";
import {HR_MANAGED_EMPLOYEE_IDS_SQL,resolveHrAttendanceAccessScope} from "./hr-access-policy";
import {HrApprovalActionEntity,HrApprovalRequestEntity,HrAttendanceRequestEntity,HrEmployeeEntity} from "./entities/hr.entities";
import type {CreateHrLeaveCancellationDto,UpdateHrLeaveCancellationDto,HrLeaveCancellationActionDto,HrLeaveCancellationListDto,HrLeaveCancellationSourceQueryDto,HrLeaveCancellationPageDto} from "./dto/hr-attendance-leave-cancellation.dto";
import {HrService} from "./hr.service";

type Row={id:string;cancellation_no:string;employee_id:string;source_request_id:string;source_request_version:number;approval_request_id:string;start_at:Date;end_at:Date;reason:string;status:HrLeaveCancellationStatus;version:number;created_by:string;employee_user_id:string|null;employee_code:string;employee_name:string;source_request_no:string};
const joined=`FROM hr_attendance_leave_cancellation c
 JOIN hr_employee e ON e.id=c.employee_id AND e.tenant_id=c.tenant_id AND e.park_id=c.park_id AND NOT e.is_deleted
 JOIN hr_attendance_request r ON r.id=c.source_request_id AND r.tenant_id=c.tenant_id AND r.park_id=c.park_id AND NOT r.is_deleted`;
const select=`c.*,e.user_id employee_user_id,e.employee_code,e.full_name employee_name,r.request_no source_request_no`;
type Access={selfId:string|null;operator:boolean;requester:boolean;reviewer:boolean;reviewIds:string[]|null;readIds:string[]|null;readPark:boolean};

@Injectable()
export class HrAttendanceLeaveCancellationService {
 constructor(private readonly db:DataSource,private readonly audit:AuditService,private readonly hr:HrService){}
 private has(a:JwtPrincipal,p:string){return Boolean(a.isSuper||a.permissions.includes("*")||a.permissions.includes(p));}
 private async access(m:EntityManager,s:TenantParkScope,a:JwtPrincipal):Promise<Access>{
  if(a.tenantId!==s.tenantId||a.parkId!==s.parkId)throw new ForbiddenException("当前园区不匹配。");
  const operator=this.has(a,HR_PERMISSIONS.HR_ATTENDANCE_OPERATE),requester=this.has(a,HR_PERMISSIONS.HR_ATTENDANCE_REQUEST),reviewer=this.has(a,HR_PERMISSIONS.HR_ATTENDANCE_APPROVE),read=resolveHrAttendanceAccessScope(a);
  const self=await m.getRepository(HrEmployeeEntity).findOne({where:{...s,userId:a.sub,isDeleted:false}}),selfId=self?.id??null;
  const managed=read==="managed_org_tree"&&selfId?(await m.query(HR_MANAGED_EMPLOYEE_IDS_SQL,[s.tenantId,s.parkId,a.sub,selfId]) as Array<{id:string}>).map(r=>r.id):[];
  const reviewIds=read==="park"?null:read==="managed_org_tree"?managed:[];
  const readIds=read==="managed_org_tree"?managed:[];
  if(requester&&selfId)readIds.push(selfId);
  if(read==="self"&&selfId)readIds.push(selfId);
  return {selfId,operator,requester,reviewer,reviewIds,readIds:[...new Set(readIds)],readPark:operator||read==="park"};
 }
 private canManage(x:Access,row:Row){return x.operator||x.requester&&x.selfId===row.employee_id;}
 private canReview(x:Access,a:JwtPrincipal,row:Row){return x.reviewer&&row.employee_user_id!==a.sub&&row.created_by!==a.sub&&(x.reviewIds===null||x.reviewIds.includes(row.employee_id));}
 private canRead(x:Access,row:Row){return x.readPark||x.readIds?.includes(row.employee_id)&&(!(row.status==="draft")||x.selfId===row.employee_id);}
 private project(x:Access,a:JwtPrincipal,r:Row):HrLeaveCancellationRecord{
  const editable=["draft","returned"].includes(r.status)&&this.canManage(x,r),reviewable=r.status==="submitted"&&this.canReview(x,a,r),self=r.employee_user_id===a.sub;
  return {id:r.id,cancellationNo:r.cancellation_no,sourceRequestId:r.source_request_id,sourceRequestNo:r.source_request_no,sourceRequestVersion:r.source_request_version,...(self?{}:{employeeId:r.employee_id,employeeCode:r.employee_code,employeeName:r.employee_name}),startAt:new Date(r.start_at).toISOString(),endAt:new Date(r.end_at).toISOString(),reason:r.reason,status:r.status,version:r.version,isSelf:self,actions:{edit:editable,submit:editable,withdraw:["draft","returned","submitted"].includes(r.status)&&this.canManage(x,r),approve:reviewable,return:reviewable}};
 }
 private async row(m:EntityManager,s:TenantParkScope,id:string,lock=false){
  const [r]=await m.query(`SELECT ${select} ${joined} WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.id=$3${lock?" FOR UPDATE OF c":""}`,[s.tenantId,s.parkId,id]) as Row[];
  if(!r)throw new NotFoundException("销假记录不存在或无权访问。");return r;
 }
 private interval(source:HrAttendanceRequestEntity,d:{startAt:string;endAt:string;reason:string}){
  const startAt=new Date(d.startAt),endAt=new Date(d.endAt),span=endAt.getTime()-startAt.getTime();
  if(!source.startAt||!source.endAt||!Number.isFinite(span)||span<=0||span>31*86400000||startAt.getTime()%60000||endAt.getTime()%60000||startAt<source.startAt||endAt>source.endAt||!d.reason.trim())throw new BadRequestException("销假时段必须精确到分钟、在原批准请假内且不超过31天，并填写原因。");
  return {startAt,endAt,reason:d.reason.trim()};
 }
 private async source(m:EntityManager,s:TenantParkScope,id:string,employeeId:string,version:number){
  const r=await m.getRepository(HrAttendanceRequestEntity).findOne({where:{...s,id,employeeId,isDeleted:false},lock:{mode:"pessimistic_read"}});
  if(!r||r.requestType!=="leave"||r.status!=="approved"||!r.startAt||!r.endAt||r.version!==version)throw new ConflictException("原批准请假已变化或缺少明确时段，请重新选择。");return r;
 }
 private async record(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,r:Row,action:string,before:Row|null,comment:string|null=null){
  await m.query(`INSERT INTO hr_attendance_leave_cancellation_history(tenant_id,park_id,cancellation_id,employee_id,source_request_id,version,status,start_at,end_at,reason,action,actor_user_id,comment) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[s.tenantId,s.parkId,r.id,r.employee_id,r.source_request_id,r.version,r.status,r.start_at,r.end_at,r.reason,action,a.sub,comment]);
  await this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.leave_cancellation",action:`销假${action}`,bizType:"hr_attendance_leave_cancellation",bizId:r.id,beforeJson:before?{version:before.version,status:before.status}:null,afterJson:{version:r.version,status:r.status},method:action==="edit"?"PUT":"POST",path:"/hr/attendance/leave-cancellations",success:true,requestId:null},m);
 }
 private async readAudit(s:TenantParkScope,a:JwtPrincipal,count:number){await this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.leave_cancellation",action:"读取销假",bizType:"hr_attendance_leave_cancellation",afterJson:{itemCount:count},method:"GET",path:"/hr/attendance/leave-cancellations",success:true,requestId:null});}
 async sources(s:TenantParkScope,a:JwtPrincipal,q:HrLeaveCancellationSourceQueryDto){
  const result=await this.db.transaction("REPEATABLE READ",async m=>{
   await m.query("SET TRANSACTION READ ONLY");const x=await this.access(m,s,a);
   if(!x.operator&&!x.requester)throw new ForbiddenException("需要请假申请或考勤办理权限。");
   const ids=x.operator?null:x.selfId?[x.selfId]:[],params:unknown[]=[s.tenantId,s.parkId,ids,q.employee_id??null,q.keyword??null];
   const from=`FROM hr_attendance_request r JOIN hr_employee e ON e.id=r.employee_id AND e.tenant_id=r.tenant_id AND e.park_id=r.park_id AND NOT e.is_deleted WHERE r.tenant_id=$1 AND r.park_id=$2 AND NOT r.is_deleted AND r.status='approved' AND r.request_type='leave' AND r.start_at IS NOT NULL AND r.end_at IS NOT NULL AND ($3::uuid[] IS NULL OR r.employee_id=ANY($3::uuid[])) AND ($4::uuid IS NULL OR r.employee_id=$4) AND ($5::text IS NULL OR position(lower($5) in lower(e.full_name||' '||e.employee_code||' '||r.request_no))>0)`;
   const [count]=await m.query(`SELECT count(*)::int total ${from}`,params);
   const rows=await m.query(`SELECT r.id,r.request_no "requestNo",r.start_at "startAt",r.end_at "endAt",r.version,e.id "employeeId",e.employee_code "employeeCode",e.full_name "employeeName",e.user_id "userId" ${from} ORDER BY r.start_at DESC,r.id DESC LIMIT $6 OFFSET $7`,[...params,q.page_size,(q.page-1)*q.page_size]) as Array<Record<string,unknown>>;
   return {items:rows.map(r=>({id:r.id,requestNo:r.requestNo,startAt:new Date(String(r.startAt)).toISOString(),endAt:new Date(String(r.endAt)).toISOString(),version:r.version,...(r.userId===a.sub?{}:{employeeId:r.employeeId,employeeCode:r.employeeCode,employeeName:r.employeeName})})),total:Number(count.total),page:q.page,page_size:q.page_size};
  });await this.readAudit(s,a,result.items.length);return result;
 }
 async list(s:TenantParkScope,a:JwtPrincipal,q:HrLeaveCancellationListDto){
  const result=await this.db.transaction("REPEATABLE READ",async m=>{
   await m.query("SET TRANSACTION READ ONLY");const x=await this.access(m,s,a),params=[s.tenantId,s.parkId,x.readPark?null:x.readIds,x.selfId,q.status??null,q.employee_id??null];
   const where=`WHERE c.tenant_id=$1 AND c.park_id=$2 AND ($3::uuid[] IS NULL OR c.employee_id=ANY($3::uuid[]) AND (c.status<>'draft' OR c.employee_id=$4)) AND ($5::text IS NULL OR c.status=$5) AND ($6::uuid IS NULL OR c.employee_id=$6)`;
   const [count]=await m.query(`SELECT count(*)::int total ${joined} ${where}`,params),rows=await m.query(`SELECT ${select} ${joined} ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT $7 OFFSET $8`,[...params,q.page_size,(q.page-1)*q.page_size]) as Row[];
   return {items:rows.map(r=>this.project(x,a,r)),total:Number(count.total),page:q.page,page_size:q.page_size};
  });await this.readAudit(s,a,result.items.length);return result;
 }
 async history(s:TenantParkScope,a:JwtPrincipal,id:string,q:HrLeaveCancellationPageDto){
  const result=await this.db.transaction("REPEATABLE READ",async m=>{
   await m.query("SET TRANSACTION READ ONLY");const x=await this.access(m,s,a),r=await this.row(m,s,id);if(!this.canRead(x,r))throw new NotFoundException("销假记录不存在或无权访问。");
   const params=[s.tenantId,s.parkId,id],from="FROM hr_attendance_leave_cancellation_history h WHERE h.tenant_id=$1 AND h.park_id=$2 AND h.cancellation_id=$3",[count]=await m.query(`SELECT count(*)::int total ${from}`,params);
   const items=await m.query(`SELECT h.version,h.status,h.start_at "startAt",h.end_at "endAt",h.reason,h.action,h.comment,h.recorded_at "recordedAt",COALESCE((SELECT display_name FROM sys_user u WHERE u.id=h.actor_user_id AND u.tenant_id=h.tenant_id AND u.park_id=h.park_id),'操作账号不可用') "actorName" ${from} ORDER BY h.version DESC LIMIT $4 OFFSET $5`,[...params,q.page_size,(q.page-1)*q.page_size]);
   return {items,total:Number(count.total),page:q.page,page_size:q.page_size};
  });await this.readAudit(s,a,result.items.length);return result;
 }
 async create(s:TenantParkScope,a:JwtPrincipal,d:CreateHrLeaveCancellationDto){return this.db.transaction(async m=>{
  const x=await this.access(m,s,a),initial=await m.getRepository(HrAttendanceRequestEntity).findOne({where:{...s,id:d.sourceRequestId,isDeleted:false}});
  if(!initial||!x.operator&&!(x.requester&&x.selfId===initial.employeeId))throw new NotFoundException("原请假不存在或无权办理。");
  const employee=await m.getRepository(HrEmployeeEntity).findOne({where:{...s,id:initial.employeeId,isDeleted:false},lock:{mode:"pessimistic_write"}});if(!employee)throw new NotFoundException("员工不可用。");
  const source=await this.source(m,s,initial.id,employee.id,d.expectedSourceVersion),v=this.interval(source,d),id=randomUUID(),approvalRepo=m.getRepository(HrApprovalRequestEntity);
  const approval=await approvalRepo.save(approvalRepo.create({...s,requestNo:`LC-${id}`,requestType:"attendance_request",applicantEmployeeId:employee.id,subjectEmployeeId:employee.id,title:"销假申请",payload:{kind:"leave_cancellation",sourceRequestId:source.id,cancellationId:id},status:"draft",currentApproverId:null,submittedAt:null,completedAt:null,createBy:a.sub,updateBy:a.sub}));
  await m.query(`INSERT INTO hr_attendance_leave_cancellation(id,tenant_id,park_id,cancellation_no,employee_id,source_request_id,source_request_version,approval_request_id,start_at,end_at,reason,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,[id,s.tenantId,s.parkId,`LC-${id}`,employee.id,source.id,source.version,approval.id,v.startAt,v.endAt,v.reason,a.sub]);
  const r=await this.row(m,s,id);await this.record(m,s,a,r,"create",null);return this.project(x,a,r);
 });}
 async update(s:TenantParkScope,a:JwtPrincipal,id:string,d:UpdateHrLeaveCancellationDto){return this.change(s,a,id,d.expectedVersion,async(m,x,before,source)=>{
  if(!this.canManage(x,before))throw new NotFoundException("销假记录不存在或无权办理。");if(!["draft","returned"].includes(before.status))throw new ConflictException("只能修改草稿或退回的销假。");const v=this.interval(source,d);
  await m.query(`UPDATE hr_attendance_leave_cancellation SET start_at=$4,end_at=$5,reason=$6,version=version+1,updated_by=$7,updated_at=clock_timestamp() WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[s.tenantId,s.parkId,id,v.startAt,v.endAt,v.reason,a.sub]);return "edit";
 });}
 async act(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrLeaveCancellationActionDto){
  if(d.action==="return"&&!d.comment?.trim())throw new BadRequestException("请填写退回原因。");
  return this.change(s,a,id,d.expectedVersion,async(m,x,before)=>{
   const review=["approve","return"].includes(d.action);
   if(review?!this.canReview(x,a,before):!this.canManage(x,before))throw new NotFoundException("销假记录不存在或无权办理。");
   if(review&&before.status!=="submitted"||d.action==="submit"&&!["draft","returned"].includes(before.status)||d.action==="withdraw"&&!["draft","returned","submitted"].includes(before.status))throw new ConflictException("销假状态已变化，请刷新后办理。");
   const status=d.action==="submit"?"submitted":d.action==="withdraw"?"cancelled":d.action==="approve"?"approved":"returned",action=d.action==="submit"&&before.status==="returned"?"resubmit":d.action;
   if(d.action==="approve")await this.hr.prepareLeaveCancellationApproval(m,s,{startAt:new Date(before.start_at),endAt:new Date(before.end_at),employeeId:before.employee_id},a.sub);
   const repo=m.getRepository(HrApprovalRequestEntity),approval=await repo.findOne({where:{...s,id:before.approval_request_id,isDeleted:false},lock:{mode:"pessimistic_write"}});
   if(!approval||approval.status!==before.status)throw new ConflictException("审批记录与销假不一致，请刷新核对。");
   const prior=approval.status;approval.status=status==="cancelled"?"withdrawn":status;approval.updateBy=a.sub;approval.currentApproverId=null;approval.completedAt=["approved","cancelled"].includes(status)?new Date():null;if(status==="submitted")approval.submittedAt=new Date();await repo.save(approval);
   await m.query(`UPDATE hr_attendance_leave_cancellation SET status=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp() WHERE tenant_id=$1 AND park_id=$2 AND id=$3`,[s.tenantId,s.parkId,id,status,a.sub]);
   const actions=m.getRepository(HrApprovalActionEntity);await actions.save(actions.create({...s,requestId:approval.id,action,actorUserId:a.sub,comment:d.comment?.trim()??null,beforeStatus:prior,afterStatus:approval.status,createBy:a.sub,updateBy:a.sub}));return action;
  },d.action==="approve",d.comment?.trim()??null);
 }
 private async change(s:TenantParkScope,a:JwtPrincipal,id:string,version:number,operation:(m:EntityManager,x:Access,r:Row,source:HrAttendanceRequestEntity)=>Promise<string>,approve=false,comment:string|null=null){
  try{return await this.db.transaction(async m=>{
   const x=await this.access(m,s,a),initial=await this.row(m,s,id);if(!this.canRead(x,initial)&&!this.canManage(x,initial))throw new NotFoundException("销假记录不存在或无权办理。");
   if(approve)await this.hr.lockLeaveCancellationMonths(m,s,{startAt:new Date(initial.start_at),endAt:new Date(initial.end_at)});
   const employee=await m.getRepository(HrEmployeeEntity).findOne({where:{...s,id:initial.employee_id,isDeleted:false},lock:{mode:"pessimistic_write"}});if(!employee)throw new NotFoundException("员工不可用。");
   const source=await this.source(m,s,initial.source_request_id,employee.id,initial.source_request_version),before=await this.row(m,s,id,true);
   if(before.version!==version||initial.version!==before.version)throw new ConflictException("销假已更新，请刷新并核对后重试。");
   const action=await operation(m,x,before,source),saved=await this.row(m,s,id);await this.record(m,s,a,saved,action,before,comment);return this.project(x,a,saved);
  });}catch(error){if((error as {driverError?:{code?:string}}).driverError?.code==="23P01")throw new ConflictException("此时段已有提交或批准的销假，请核对后调整。");throw error;}
 }
}
