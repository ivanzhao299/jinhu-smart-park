import {BadRequestException,ConflictException,ForbiddenException,Injectable} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {DataSource} from "typeorm";
import {randomUUID} from "node:crypto";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditService} from "../audit/audit.service";
import type {HrWorkCalendarHistoryDto,HrWorkCalendarRangeDto,PutHrWorkCalendarDto,WorkCalendarKind} from "./dto/hr-attendance-work-calendar.dto";
type CalendarRow={id:string;workDate:string;dayKind:WorkCalendarKind;dayName:string;version:number;updatedAt:Date};
const projection=`id,work_date::text "workDate",day_kind "dayKind",day_name "dayName",version,updated_at "updatedAt"`;

@Injectable()
export class HrAttendanceWorkCalendarService {
 constructor(private readonly db:DataSource,private readonly audit:AuditService){}
 private assertActor(s:TenantParkScope,a:JwtPrincipal){
  if(a.tenantId!==s.tenantId||a.parkId!==s.parkId||!(a.isSuper||a.permissions.includes("*")||a.permissions.includes(HR_PERMISSIONS.HR_ATTENDANCE_OPERATE)))throw new ForbiddenException("当前园区考勤操作权限不足。");
 }
 private date(value:string){
  if(!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new BadRequestException("请输入1900至2199年的有效日期。");
 }
 private readAudit(s:TenantParkScope,a:JwtPrincipal,path:string,count:number){return this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.attendance_work_calendar",action:"读取工作日历",bizType:"hr_attendance_work_calendar",afterJson:{itemCount:count},method:"GET",path,success:true,requestId:null});}
 async list(s:TenantParkScope,a:JwtPrincipal,q:HrWorkCalendarRangeDto){
  this.assertActor(s,a);this.date(q.from);this.date(q.to);
  const span=(Date.parse(q.to)-Date.parse(q.from))/86400000;
  if(span<0||span>365)throw new BadRequestException("日历读取范围含起止日最多366天。");
  const items=await this.db.query(`SELECT ${projection} FROM hr_attendance_work_calendar WHERE tenant_id=$1 AND park_id=$2 AND work_date BETWEEN $3 AND $4 ORDER BY work_date`,[s.tenantId,s.parkId,q.from,q.to]) as CalendarRow[];
  await this.readAudit(s,a,"/hr/attendance/work-calendar",items.length);
  return {from:q.from,to:q.to,items};
 }
 async history(s:TenantParkScope,a:JwtPrincipal,date:string,q:HrWorkCalendarHistoryDto){
  this.assertActor(s,a);this.date(date);
  const result=await this.db.transaction("REPEATABLE READ",async m=>{
   await m.query("SET TRANSACTION READ ONLY");
   const params=[s.tenantId,s.parkId,date];
   const from="FROM hr_attendance_work_calendar_history h JOIN hr_attendance_work_calendar c ON c.tenant_id=h.tenant_id AND c.park_id=h.park_id AND c.id=h.calendar_id WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.work_date=$3";
   const counts=await m.query(`SELECT count(*)::int count ${from}`,params) as Array<{count:number}>;
   const count=counts[0]?.count;if(count===undefined)throw new Error("Calendar history count unavailable");
   const items=await m.query(`SELECT h.id,h.version,h.day_kind "dayKind",h.day_name "dayName",h.change_reason reason,h.occurred_at "occurredAt",COALESCE((SELECT display_name FROM sys_user u WHERE u.id=h.actor_user_id AND u.tenant_id=h.tenant_id AND u.park_id=h.park_id),'操作账号不可用') "actorName" ${from} ORDER BY h.version DESC LIMIT $4 OFFSET $5`,[...params,q.page_size,(q.page-1)*q.page_size]);
   return {items,total:count,page:q.page,page_size:q.page_size};
  });
  await this.readAudit(s,a,"/hr/attendance/work-calendar/:date/history",result.items.length);return result;
 }
 async put(s:TenantParkScope,a:JwtPrincipal,date:string,d:PutHrWorkCalendarDto){
  this.assertActor(s,a);this.date(date);
  if(!d.dayName.trim()||!d.reason.trim())throw new BadRequestException("名称和修改原因不能为空。");
  return this.db.transaction(async m=>{
   await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["hr-work-calendar",s.tenantId,s.parkId,date])]);
   const [before]=await m.query(`SELECT ${projection} FROM hr_attendance_work_calendar WHERE tenant_id=$1 AND park_id=$2 AND work_date=$3 FOR UPDATE`,[s.tenantId,s.parkId,date]) as CalendarRow[];
   if((before?.version??0)!==d.expectedVersion)throw new ConflictException("日历设置已变化，请重新读取并核对后保存。");
   const id=before?.id??randomUUID();
   const [saved]=await m.query(`INSERT INTO hr_attendance_work_calendar(id,tenant_id,park_id,work_date,day_kind,day_name,version,updated_by) VALUES($1,$2,$3,$4,$5,$6,1,$7) ON CONFLICT(tenant_id,park_id,work_date) DO UPDATE SET day_kind=EXCLUDED.day_kind,day_name=EXCLUDED.day_name,version=hr_attendance_work_calendar.version+1,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING ${projection}`,[id,s.tenantId,s.parkId,date,d.dayKind,d.dayName.trim(),a.sub]) as CalendarRow[];
   if(!saved)throw new Error("Calendar write receipt unavailable");
   await m.query("INSERT INTO hr_attendance_work_calendar_history(tenant_id,park_id,calendar_id,version,day_kind,day_name,change_reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[s.tenantId,s.parkId,id,saved.version,saved.dayKind,saved.dayName,d.reason.trim(),a.sub]);
   await this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.attendance_work_calendar",action:"维护工作日历",bizType:"hr_attendance_work_calendar",bizId:id,beforeJson:before??null,afterJson:{...saved,reason:d.reason.trim()},method:"PUT",path:"/hr/attendance/work-calendar/:date",success:true,requestId:null},m);
   return saved;
  });
 }
}
