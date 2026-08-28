import {ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {createHash} from "node:crypto";
import {DataSource,type EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditService} from "../audit/audit.service";
import type {HrContractReminderActionDto,HrContractReminderQueryDto} from "./dto/hr-contract-reminder.dto";
import {recordHrSensitiveRead} from "./hr-sensitive-read-audit";
@Injectable()
export class HrContractReminderService{
 constructor(private readonly db:DataSource,private readonly audit:AuditService){}
 private has(a:JwtPrincipal,p:string){return Boolean(a.isSuper||a.permissions.includes("*")||a.permissions.includes(p));}
 private require(a:JwtPrincipal,p:string){if(!this.has(a,p))throw new ForbiddenException("Contract reminder permission is required");}
 async run(s:TenantParkScope,a:JwtPrincipal){this.require(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_RUN);return this.db.transaction(async m=>{
  const before=Number((await m.query(`SELECT count(*)::int n FROM hr_contract_reminder WHERE tenant_id=$1 AND park_id=$2`,[s.tenantId,s.parkId]))[0].n);
  await m.query(`WITH candidates AS(
   SELECT c.id contract_id,c.employee_id,c.version contract_version,p.id policy_id,p.rule_version,p.reminder_kind,p.window_days,p.recipient_scope,
    CASE p.reminder_kind WHEN 'contract_expiry' THEN c.end_date ELSE c.probation_end_date END source_date,
    CASE p.recipient_scope WHEN 'employee' THEN e.user_id WHEN 'manager' THEN me.user_id END recipient_user_id
   FROM hr_contract c JOIN hr_employee e ON(e.id,e.tenant_id,e.park_id)=(c.employee_id,c.tenant_id,c.park_id)
   JOIN hr_contract_reminder_policy p ON(p.tenant_id,p.park_id)=(c.tenant_id,c.park_id) AND p.enabled
   LEFT JOIN hr_employee me ON(me.id,me.tenant_id,me.park_id)=(e.manager_employee_id,e.tenant_id,e.park_id) AND me.is_deleted=false
   WHERE c.tenant_id=$1 AND c.park_id=$2 AND c.is_deleted=false AND c.status='active'
  ),recipients AS(
   SELECT x.*,COALESCE(x.recipient_user_id,u.id) recipient_id FROM candidates x
   LEFT JOIN LATERAL(SELECT DISTINCT su.id FROM sys_user su JOIN rel_user_role ur ON ur.user_id=su.id AND ur.tenant_id=su.tenant_id AND ur.park_id=su.park_id AND ur.is_deleted=false JOIN sys_role r ON r.id=ur.role_id AND r.code='HR_MANAGER' AND r.is_deleted=false WHERE x.recipient_scope='hr' AND su.tenant_id=$1 AND su.park_id=$2 AND su.is_deleted=false AND su.is_enabled=true ORDER BY su.id LIMIT 1)u ON true
   WHERE x.source_date IS NOT NULL
  ),valid_recipients AS(
   SELECT r.* FROM recipients r JOIN sys_user u ON u.id=r.recipient_id AND u.tenant_id=$1 AND u.park_id=$2 AND u.is_deleted=false AND u.is_enabled=true
  ),inserted AS(
   INSERT INTO hr_contract_reminder(tenant_id,park_id,contract_id,employee_id,policy_id,rule_version,reminder_kind,window_days,window_date,due_date,recipient_scope,recipient_user_id,source_date,source_contract_version,dedupe_key)
   SELECT $1,$2,contract_id,employee_id,policy_id,rule_version,reminder_kind,window_days,source_date-window_days,source_date,recipient_scope,recipient_id,source_date,contract_version,
    encode(digest(concat_ws('|',$1,$2,contract_id,reminder_kind,source_date-window_days,rule_version,recipient_id),'sha256'),'hex')
   FROM valid_recipients WHERE source_date-window_days<=current_date
   ON CONFLICT(tenant_id,park_id,dedupe_key)DO NOTHING RETURNING *
  ) INSERT INTO hr_contract_reminder_outbox(tenant_id,park_id,reminder_id,recipient_user_id,dedupe_key)
   SELECT tenant_id,park_id,id,recipient_user_id,encode(digest('created|'||dedupe_key,'sha256'),'hex') FROM inserted ON CONFLICT DO NOTHING`,[s.tenantId,s.parkId]);
  const after=Number((await m.query(`SELECT count(*)::int n FROM hr_contract_reminder WHERE tenant_id=$1 AND park_id=$2`,[s.tenantId,s.parkId]))[0].n);
  await this.auditRequired(s,a,"运行劳动合同提醒",null,"admin",after-before);return {created:after-before};
 });}
 async list(s:TenantParkScope,a:JwtPrincipal,q:HrContractReminderQueryDto){this.require(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_READ);const values:unknown[]=[s.tenantId,s.parkId,a.sub],where=["r.tenant_id=$1","r.park_id=$2","(r.recipient_user_id=$3 OR $4::boolean)"];values.push(this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_MANAGE));if(q.status){values.push(q.status);where.push(`r.status=$${values.length}`);}const total=Number((await this.db.query(`SELECT count(*)::int n FROM hr_contract_reminder r WHERE ${where.join(" AND ")}`,values))[0].n);values.push(q.page_size,(q.page-1)*q.page_size);const items=await this.db.query(`SELECT r.id,r.contract_id "contractId",r.employee_id "employeeId",r.reminder_kind "kind",r.window_days "windowDays",r.due_date "dueDate",r.status FROM hr_contract_reminder r WHERE ${where.join(" AND ")} ORDER BY r.due_date,r.id LIMIT $${values.length-1} OFFSET $${values.length}`,values);await this.auditRequired(s,a,"读取劳动合同提醒",null,this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_MANAGE)?"park":"self",items.length);return {items,total,page:q.page,page_size:q.page_size};}
 async action(s:TenantParkScope,a:JwtPrincipal,id:string,d:HrContractReminderActionDto){this.require(a,d.action==="cancel"||d.action==="resolve"?HR_PERMISSIONS.HR_CONTRACT_REMINDER_MANAGE:HR_PERMISSIONS.HR_CONTRACT_REMINDER_ACK);return this.db.transaction(async m=>{const manage=this.has(a,HR_PERMISSIONS.HR_CONTRACT_REMINDER_MANAGE),row=(await m.query(`SELECT * FROM hr_contract_reminder WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND (recipient_user_id=$4 OR $5::boolean) FOR UPDATE`,[id,s.tenantId,s.parkId,a.sub,manage]))[0];if(!row)throw new NotFoundException("Contract reminder not found");const target={read:"read",acknowledge:"acknowledged",resolve:"resolved",cancel:"cancelled"}[d.action];const sequence=Number((await m.query(`SELECT COALESCE(max(sequence_no),0)+1 n FROM hr_contract_reminder_action WHERE tenant_id=$1 AND park_id=$2 AND reminder_id=$3`,[s.tenantId,s.parkId,id]))[0].n);await m.query(`UPDATE hr_contract_reminder SET status=$1,read_at=CASE WHEN $1='read' THEN now() ELSE read_at END,read_by=CASE WHEN $1='read' THEN $2 ELSE read_by END,acknowledged_at=CASE WHEN $1='acknowledged' THEN now() ELSE acknowledged_at END,acknowledged_by=CASE WHEN $1='acknowledged' THEN $2 ELSE acknowledged_by END,resolved_at=CASE WHEN $1='resolved' THEN now() ELSE resolved_at END,resolved_by=CASE WHEN $1='resolved' THEN $2 ELSE resolved_by END,cancelled_at=CASE WHEN $1='cancelled' THEN now() ELSE cancelled_at END,cancelled_by=CASE WHEN $1='cancelled' THEN $2 ELSE cancelled_by END,update_time=now() WHERE id=$3`,[target,a.sub,id]);await m.query(`INSERT INTO hr_contract_reminder_action(tenant_id,park_id,reminder_id,sequence_no,action,actor_user_id,comment_digest)VALUES($1,$2,$3,$4,$5,$6,$7)`,[s.tenantId,s.parkId,id,sequence,d.action,a.sub,d.comment?createHash("sha256").update(d.comment).digest("hex"):null]);await this.auditRequired(s,a,"办理劳动合同提醒",id,manage?"admin":"self",1);return {id,status:target};});}
 async cancelStale(m:EntityManager,s:TenantParkScope,contractId:string,actorId:string,reason:string){await m.query(`UPDATE hr_contract_reminder SET status='cancelled',cancelled_at=now(),cancelled_by=$1,cancel_reason=$2,update_time=now() WHERE tenant_id=$3 AND park_id=$4 AND contract_id=$5 AND status IN('open','read')`,[actorId,reason,s.tenantId,s.parkId,contractId]);await m.query(`UPDATE hr_contract_reminder_outbox o SET status='cancelled',update_time=now() FROM hr_contract_reminder r WHERE r.id=o.reminder_id AND r.contract_id=$1 AND r.tenant_id=$2 AND r.park_id=$3 AND o.status='pending'`,[contractId,s.tenantId,s.parkId]);}
 private auditRequired(s:TenantParkScope,a:JwtPrincipal,action:string,bizId:string|null,projection:"admin"|"park"|"self",itemCount:number){return recordHrSensitiveRead(this.audit,s,a,{resource:"hr.contract_reminder",action,bizType:"hr_contract_reminder",bizId,path:"/hr/contract-reminders",fieldGroups:["employment_contract"],projection,itemCount});}
}
