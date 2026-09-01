import {ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {createHash} from "node:crypto";
import {DataSource,type EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditService} from "../audit/audit.service";
import type {HrContractReminderActionDto,HrContractReminderQueryDto} from "./dto/hr-contract-reminder.dto";
import {HR_MANAGED_EMPLOYEE_IDS_SQL} from "./hr-access-policy";
import {recordHrSensitiveRead} from "./hr-sensitive-read-audit";

type ReminderAccess="park"|"managed_org_tree"|"self"|"none";
type ReminderRow={id:string;contract_id:string;employee_id:string;reminder_kind:string;window_days:number;due_date:string;status:string;recipient_user_id:string};

@Injectable()
export class HrContractReminderService{
 constructor(private readonly db:DataSource,private readonly audit:AuditService){}
 private has(a:JwtPrincipal,p:string){return Boolean(a.isSuper||a.permissions.includes("*")||a.permissions.includes(p));}
 private require(a:JwtPrincipal,p:string){if(!this.has(a,p))throw new ForbiddenException("Contract reminder permission is required");}
 private access(a:JwtPrincipal):ReminderAccess{
  if(this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_MANAGE)||this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_PARK_READ))return "park";
  if(this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_TEAM_READ))return "managed_org_tree";
  if(this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_SELF_READ))return "self";
  return "none";
 }
 private async managedEmployeeIds(s:TenantParkScope,a:JwtPrincipal){
  const manager=(await this.db.query(`SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND user_id=$3 AND is_deleted=false`,[s.tenantId,s.parkId,a.sub]))[0] as {id?:string}|undefined;
  if(!manager?.id)return [];
  const rows=await this.db.query(HR_MANAGED_EMPLOYEE_IDS_SQL,[s.tenantId,s.parkId,a.sub,manager.id]) as Array<{id:string}>;
  return rows.map(row=>row.id);
 }
 private project(row:ReminderRow){return {id:row.id,contractId:row.contract_id,employeeId:row.employee_id,kind:row.reminder_kind,windowDays:Number(row.window_days),dueDate:String(row.due_date),status:row.status};}
 private async scopeSql(s:TenantParkScope,a:JwtPrincipal,access:ReminderAccess,values:unknown[]){
  if(access==="park")return "TRUE";
  if(access==="self"){values.push(a.sub);return `r.recipient_user_id=$${values.length}`;}
  if(access==="managed_org_tree"){
   const ids=await this.managedEmployeeIds(s,a);
   if(!ids.length)return "FALSE";
   values.push(ids);const employeeIdsIndex=values.length;values.push(a.sub);return `r.employee_id=ANY($${employeeIdsIndex}::uuid[]) AND r.recipient_user_id=$${values.length}`;
  }
  return "FALSE";
 }
 async run(s:TenantParkScope,a:JwtPrincipal){
  this.require(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_RUN);
  return this.db.transaction(async m=>{
   const result=await m.query(`WITH candidates AS(
    SELECT c.id contract_id,c.employee_id,c.version contract_version,p.id policy_id,p.rule_version,p.reminder_kind,p.window_days,p.recipient_scope,p.recipient_role_code,
     CASE p.reminder_kind WHEN 'contract_expiry' THEN c.end_date ELSE c.probation_end_date END source_date,e.user_id employee_user_id,me.user_id manager_user_id
    FROM hr_contract c JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(c.employee_id,c.tenant_id,c.park_id)
    JOIN hr_contract_reminder_policy p ON(p.tenant_id,p.park_id)=(c.tenant_id,c.park_id) AND p.enabled
    LEFT JOIN hr_employee me ON(me.id,me.tenant_id,me.park_id)=(e.manager_employee_id,e.tenant_id,e.park_id) AND me.is_deleted=false
    WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.is_deleted=false AND c.status='active'
   ),recipients AS(
    SELECT c.*,recipient.recipient_user_id FROM candidates c
    CROSS JOIN LATERAL(
     SELECT c.employee_user_id recipient_user_id WHERE c.recipient_scope='employee'
     UNION ALL SELECT c.manager_user_id WHERE c.recipient_scope='manager'
     UNION ALL SELECT su.id FROM sys_user su
      JOIN rel_user_role ur ON ur.user_id=su.id AND ur.tenant_id=su.tenant_id AND ur.park_id=su.park_id AND ur.is_deleted=false
      JOIN sys_role role ON role.id=ur.role_id AND role.tenant_id=ur.tenant_id AND role.park_id=ur.park_id AND role.is_deleted=false
      WHERE c.recipient_scope='hr' AND role.code=c.recipient_role_code AND su.tenant_id=$1 AND su.park_id=$2 AND su.is_deleted=false AND su.is_enabled=true
    )recipient
    JOIN sys_user active_user ON active_user.id=recipient.recipient_user_id AND active_user.tenant_id=$1 AND active_user.park_id=$2 AND active_user.is_deleted=false AND active_user.is_enabled=true
    WHERE c.source_date IS NOT NULL
   ),inserted AS(
    INSERT INTO hr_contract_reminder(tenant_id,park_id,contract_id,employee_id,policy_id,rule_version,reminder_kind,window_days,window_date,due_date,recipient_scope,recipient_user_id,source_date,source_contract_version,dedupe_key)
    SELECT $1,$2,contract_id,employee_id,policy_id,rule_version,reminder_kind,window_days,source_date-window_days,source_date,recipient_scope,recipient_user_id,source_date,contract_version,
     encode(digest(concat_ws('|',$1,$2,contract_id,reminder_kind,source_date-window_days,rule_version,recipient_user_id),'sha256'),'hex')
    FROM recipients WHERE source_date-window_days<=current_date
    ON CONFLICT(tenant_id,park_id,dedupe_key)DO NOTHING RETURNING *
   ),outboxed AS(
    INSERT INTO hr_contract_reminder_outbox(tenant_id,park_id,reminder_id,recipient_user_id,dedupe_key)
    SELECT tenant_id,park_id,id,recipient_user_id,encode(digest('created|'||dedupe_key,'sha256'),'hex') FROM inserted ON CONFLICT DO NOTHING RETURNING reminder_id
   )SELECT count(*)::int created FROM inserted`,[s.tenantId,s.parkId]);
   const created=Number(result[0]?.created??0);
   await this.auditRequired(s,a,"运行劳动合同提醒",null,"park",created);
   return {created};
  });
 }
 async list(s:TenantParkScope,a:JwtPrincipal,q:HrContractReminderQueryDto){
  const access=this.access(a);
  if(access==="none")return {items:[],total:0,page:q.page,page_size:q.page_size};
  const values:unknown[]=[s.tenantId,s.parkId],where=["r.tenant_id=$1","r.park_id=$2",await this.scopeSql(s,a,access,values)];
  if(q.status){values.push(q.status);where.push(`r.status=$${values.length}`);}
  const total=Number((await this.db.query(`SELECT count(*)::int n FROM hr_contract_reminder r WHERE ${where.join(" AND ")}`,values))[0].n);
  values.push(q.page_size,(q.page-1)*q.page_size);
  const rows=await this.db.query(`SELECT r.id,r.contract_id,r.employee_id,r.reminder_kind,r.window_days,r.due_date,r.status,r.recipient_user_id FROM hr_contract_reminder r WHERE ${where.join(" AND ")} ORDER BY r.due_date,r.id LIMIT $${values.length-1} OFFSET $${values.length}`,values) as ReminderRow[];
  const items=rows.map(row=>this.project(row));
  await this.auditRequired(s,a,"读取劳动合同提醒",null,access==="managed_org_tree"?"team":access,items.length);
  return {items,total,page:q.page,page_size:q.page_size};
 }
 async detail(s:TenantParkScope,a:JwtPrincipal,id:string){
  const access=this.access(a);
  if(access==="none")throw new NotFoundException("Contract reminder not found");
  const values:unknown[]=[s.tenantId,s.parkId,id],scope=await this.scopeSql(s,a,access,values);
  const row=(await this.db.query(`SELECT r.id,r.contract_id,r.employee_id,r.reminder_kind,r.window_days,r.due_date,r.status,r.recipient_user_id FROM hr_contract_reminder r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3 AND ${scope}`,values))[0] as ReminderRow|undefined;
  if(!row)throw new NotFoundException("Contract reminder not found");
  const projected=this.project(row);
  await this.auditRequired(s,a,"读取劳动合同提醒详情",id,access==="managed_org_tree"?"team":access,1);
  return projected;
 }
 async action(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrContractReminderActionDto){
  const manage=d.action==="cancel"||d.action==="resolve";
  this.require(a,manage?HR_PERMISSIONS.HR_CONTRACT_REMINDER_MANAGE:HR_PERMISSIONS.HR_CONTRACT_REMINDER_ACK);
  const access=this.access(a);
  if(access==="none")throw new NotFoundException("Contract reminder not found");
  return this.db.transaction(async m=>{
   const values:unknown[]=[s.tenantId,s.parkId,id],scope=await this.scopeSql(s,a,manage?"park":access,values);
   const row=(await m.query(`SELECT r.* FROM hr_contract_reminder r WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3 AND ${scope} FOR UPDATE`,values))[0] as ReminderRow|undefined;
   if(!row)throw new NotFoundException("Contract reminder not found");
   const allowed:Record<HrContractReminderActionDto["action"],string[]>={read:["open"],acknowledge:["open","read"],resolve:["acknowledged"],cancel:["open","read"]};
   if(!allowed[d.action].includes(row.status))throw new ConflictException("Contract reminder action is not allowed from current status");
   const target={read:"read",acknowledge:"acknowledged",resolve:"resolved",cancel:"cancelled"}[d.action];
   const sequence=Number((await m.query(`SELECT COALESCE(max(sequence_no),0)+1 n FROM hr_contract_reminder_action WHERE tenant_id=$1 AND park_id=$2 AND reminder_id=$3`,[s.tenantId,s.parkId,id]))[0].n);
   await m.query(`UPDATE hr_contract_reminder SET status=$1::varchar,read_at=CASE WHEN $1::varchar IN('read','acknowledged') THEN COALESCE(read_at,now()) ELSE read_at END,read_by=CASE WHEN $1::varchar IN('read','acknowledged') THEN COALESCE(read_by,$2) ELSE read_by END,acknowledged_at=CASE WHEN $1::varchar='acknowledged' THEN now() ELSE acknowledged_at END,acknowledged_by=CASE WHEN $1::varchar='acknowledged' THEN $2 ELSE acknowledged_by END,resolved_at=CASE WHEN $1::varchar='resolved' THEN now() ELSE resolved_at END,resolved_by=CASE WHEN $1::varchar='resolved' THEN $2 ELSE resolved_by END,cancelled_at=CASE WHEN $1::varchar='cancelled' THEN now() ELSE cancelled_at END,cancelled_by=CASE WHEN $1::varchar='cancelled' THEN $2 ELSE cancelled_by END,cancel_reason=CASE WHEN $1::varchar='cancelled' THEN 'MANUAL_CANCELLED' ELSE cancel_reason END,update_time=now() WHERE id=$3`,[target,a.sub,id]);
   await m.query(`INSERT INTO hr_contract_reminder_action(tenant_id,park_id,reminder_id,sequence_no,action,actor_user_id,comment_digest)VALUES($1,$2,$3,$4,$5,$6,$7)`,[s.tenantId,s.parkId,id,sequence,d.action,a.sub,d.comment?createHash("sha256").update(d.comment).digest("hex"):null]);
   if(target==="cancelled")await m.query(`UPDATE hr_contract_reminder_outbox SET status='cancelled',update_time=now() WHERE tenant_id=$1 AND park_id=$2 AND reminder_id=$3 AND status='pending'`,[s.tenantId,s.parkId,id]);
   await this.auditRequired(s,a,"办理劳动合同提醒",id,manage?"park":access==="managed_org_tree"?"team":"self",1);
   return {id,status:target};
  });
 }
 async cancelStale(m:EntityManager,s:TenantParkScope,contractId:string,actorId:string,reason:string){
  await m.query(`UPDATE hr_contract_reminder SET status='cancelled',cancelled_at=now(),cancelled_by=$1,cancel_reason=$2,update_time=now() WHERE tenant_id=$3 AND park_id=$4 AND contract_id=$5 AND status IN('open','read')`,[actorId,reason,s.tenantId,s.parkId,contractId]);
  await m.query(`UPDATE hr_contract_reminder_outbox o SET status='cancelled',update_time=now() FROM hr_contract_reminder r WHERE r.id=o.reminder_id AND r.contract_id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND o.status='pending'`,[contractId,s.tenantId,s.parkId]);
 }
 private auditRequired(s:TenantParkScope,a:JwtPrincipal,action:string,bizId:string|null,projection:"park"|"team"|"self",itemCount:number){return recordHrSensitiveRead(this.audit,s,a,{resource:"hr.contract_reminder",action,bizType:"hr_contract_reminder",bizId,path:"/hr/contract-reminders",fieldGroups:["employment_contract"],projection,itemCount});}
}
