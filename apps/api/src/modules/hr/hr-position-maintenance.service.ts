import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {DataSource,type EntityManager} from "typeorm";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {AuditService} from "../audit/audit.service";
import {DataScopeService} from "../data-scopes/data-scope.service";
import {typeormQueryRows} from "../../shared/property-workbench/typeorm-query-rows";
import {lockOrgHierarchy} from "../orgs/org-hierarchy-lock";
import type {CreateHrPositionDto} from "./dto/hr.dto";
import {randomUUID} from "node:crypto";
import type {UpdateHrPositionMaintenanceDto} from "./dto/hr-position-maintenance.dto";
const columns={orgId:"org_id",positionCode:"position_code",positionName:"position_name",reportsToPositionId:"reports_to_position_id",jobFamily:"job_family",jobLevel:"job_level",headcountLimit:"headcount_limit",hierarchyLevel:"hierarchy_level",sortOrder:"sort_order",authority:"authority",qualification:"qualification",responsibilities:"responsibilities",positionManual:"position_manual",status:"status",remark:"remark"} as const;
type Row=Record<string,unknown>;
const project=(row:Row):Row=>({id:row.id,version:row.version,...Object.fromEntries(Object.entries(columns).map(([field,column])=>[field,row[column]]))});
@Injectable()
export class HrPositionMaintenanceService {
 constructor(private readonly db:DataSource,private readonly scopes:DataScopeService,private readonly audit:AuditService){}
 private assertActor(s:TenantParkScope,a:JwtPrincipal,permission:string=HR_PERMISSIONS.HR_POSITION_MANAGE){if(!(a.isSuper||a.permissions.some(p=>p==="*"||p===permission))||!a.isSuper&&(a.tenantId!==s.tenantId||a.parkId!==s.parkId))throw new ForbiddenException("Position maintenance permission required");}
 private async allowed(a:JwtPrincipal){return this.scopes.buildScopeFilter(a,"org");}
 private async target(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,id:string,lock=false){
  const filter=await this.allowed(a);const rows=await m.query(`SELECT * FROM hr_position WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false${lock?" FOR UPDATE":""}`,[id,s.tenantId,s.parkId]) as Row[];
  const row=rows[0];if(!row||!filter.unrestricted&&!filter.allowed_ids.includes(String(row.org_id)))throw new NotFoundException("Position not found");return {row,filter};
 }
 async list(s:TenantParkScope,a:JwtPrincipal){
  this.assertActor(s,a,HR_PERMISSIONS.HR_POSITION_READ);const filter=await this.allowed(a),params:unknown[]=[s.tenantId,s.parkId];const bound=filter.unrestricted?"":` AND org_id=ANY($${params.push(filter.allowed_ids)}::uuid[])`;
  return (await this.db.query(`SELECT * FROM hr_position WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false${bound} ORDER BY sort_order,position_code,id`,params) as Row[]).map(project);
 }
 private async choices(m:EntityManager,s:TenantParkScope,a:JwtPrincipal,exclude?:string){
  const filter=await this.allowed(a);const params:unknown[]=[s.tenantId,s.parkId];const bound=filter.unrestricted?"":` AND id=ANY($${params.push(filter.allowed_ids)}::uuid[])`;
  const orgs=await m.query(`SELECT id,org_name "orgName",status FROM sys_org WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false${bound} ORDER BY sort_order,org_name,id`,params);
  const p:unknown[]=[s.tenantId,s.parkId];let scope=filter.unrestricted?"":` AND org_id=ANY($${p.push(filter.allowed_ids)}::uuid[])`;if(exclude)scope+=` AND id<>$${p.push(exclude)}`;
  const parents=await m.query(`SELECT id,position_code "positionCode",position_name "positionName",org_id "orgId",status,reports_to_position_id "reportsToPositionId" FROM hr_position WHERE tenant_id=$1 AND park_id=$2 AND is_deleted=false${scope} ORDER BY sort_order,position_code,id`,p);
  return {orgs,parents};
 }
 async options(s:TenantParkScope,a:JwtPrincipal){
  this.assertActor(s,a);return this.db.transaction("REPEATABLE READ",async m=>{await m.query("SET TRANSACTION READ ONLY");return this.choices(m,s,a);});
 }
 async create(s:TenantParkScope,a:JwtPrincipal,d:CreateHrPositionDto){
  this.assertActor(s,a);return this.db.transaction(async m=>{
   await lockOrgHierarchy(m,s);const filter=await this.allowed(a);
   if(!filter.unrestricted&&!filter.allowed_ids.includes(d.orgId))throw new ForbiddenException("Target organization is outside the permitted scope");
   const owner=(await m.query("SELECT id FROM sys_org WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND status='enabled' AND is_deleted=false FOR SHARE",[d.orgId,s.tenantId,s.parkId]))[0];if(!owner)throw new BadRequestException("Target organization is unavailable");
   if(d.reportsToPositionId){const parent=(await m.query("SELECT id,org_id FROM hr_position WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND status='enabled' AND is_deleted=false FOR SHARE",[d.reportsToPositionId,s.tenantId,s.parkId]))[0];if(!parent||!filter.unrestricted&&!filter.allowed_ids.includes(String(parent.org_id)))throw new BadRequestException("上级岗位不可用。");}
   const id=randomUUID(),fields=Object.keys(columns) as Array<keyof typeof columns>,values:unknown[]=[id,s.tenantId,s.parkId,a.sub];
   for(const f of fields)values.push(d[f]??(f==="status"?"enabled":f==="sortOrder"?0:null));
   let saved:Row;try{saved=typeormQueryRows<Row>(await m.query(`INSERT INTO hr_position(id,tenant_id,park_id,create_by,update_by,${fields.map(f=>columns[f]).join(",")}) VALUES($1,$2,$3,$4,$4,${fields.map((_,i)=>`$${i+5}`).join(",")}) RETURNING *`,values))[0]!;}catch(error){const failure=error as {code?:string;constraint?:string};if(failure.code==="23505"&&failure.constraint==="uq_hr_position_scope_code")throw new ConflictException("岗位编码已存在。");throw error;}
   await this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.position",action:"创建正式岗位",bizType:"hr_position",bizId:id,afterJson:project(saved),method:"POST",path:"/hr/positions",success:true,requestId:null},m);return project(saved);
  });
 }
 async context(s:TenantParkScope,a:JwtPrincipal,id:string){
  this.assertActor(s,a);
  const result=await this.db.transaction("REPEATABLE READ",async m=>{
   await m.query("SET TRANSACTION READ ONLY");const {row}=await this.target(m,s,a,id);
   return {position:project(row),...await this.choices(m,s,a,id)};
  });
  await this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.position",action:"读取岗位维护资料",bizType:"hr_position",bizId:id,afterJson:{version:result.position.version},method:"GET",path:"/hr/positions/:id/maintenance",success:true,requestId:null});return result;
 }
 async update(s:TenantParkScope,a:JwtPrincipal,id:string,d:UpdateHrPositionMaintenanceDto){
  this.assertActor(s,a);
  return this.db.transaction(async m=>{
   await lockOrgHierarchy(m,s);const {row,filter}=await this.target(m,s,a,id,true);
   if(row.version!==d.expectedVersion)throw new ConflictException("岗位已被修改，请刷新后重新核对。");
   const fields=Object.keys(columns) as Array<keyof typeof columns>;const changed=fields.filter(f=>d[f]!==undefined&&d[f]!==row[columns[f]]);
   if(!changed.length)return project(row);
   const next={...row};for(const f of changed)next[columns[f]]=d[f];
   if(!filter.unrestricted&&!filter.allowed_ids.includes(String(next.org_id)))throw new ForbiddenException("Target organization is outside the permitted scope");
   const owner=(await m.query(`SELECT id,status FROM sys_org WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE`,[next.org_id,s.tenantId,s.parkId]))[0];
   if(!owner||changed.includes("orgId")&&owner.status!=="enabled")throw new BadRequestException("Target organization is unavailable");
   if(changed.includes("reportsToPositionId")||changed.includes("status")&&next.status==="enabled"){
    let parent=next.reports_to_position_id;const seen=new Set<string>([id]);
    while(parent){if(seen.has(String(parent)))throw new BadRequestException("岗位层级不能形成循环。");seen.add(String(parent));const r=(await m.query(`SELECT id,org_id,reports_to_position_id FROM hr_position WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false AND status='enabled' FOR SHARE`,[parent,s.tenantId,s.parkId]))[0];if(!r||!filter.unrestricted&&!filter.allowed_ids.includes(String(r.org_id)))throw new BadRequestException("上级岗位不可用。");parent=r.reports_to_position_id;}
   }
   if(next.status!=="enabled"&&changed.includes("status")&&(await m.query(`SELECT id FROM hr_position WHERE tenant_id=$1 AND park_id=$2 AND reports_to_position_id=$3 AND is_deleted=false LIMIT 1`,[s.tenantId,s.parkId,id])).length)throw new ConflictException("请先处理下级岗位再停用。");
   if(changed.includes("orgId")&&(await m.query(`SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND position_id=$3 AND is_deleted=false LIMIT 1`,[s.tenantId,s.parkId,id])).length)throw new ConflictException("岗位已有任职引用，请通过正式任职调整处理组织变更。");
   if(next.status!=="enabled"&&changed.includes("status")&&(await m.query(`SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND position_id=$3 AND is_deleted=false AND employment_status<>'departed' LIMIT 1`,[s.tenantId,s.parkId,id])).length)throw new ConflictException("岗位仍有未离职人员，请先办理任职调整。");
   if(changed.includes("positionCode")&&(await m.query(`SELECT id FROM hr_position WHERE tenant_id=$1 AND park_id=$2 AND position_code=$3 AND id<>$4 AND is_deleted=false LIMIT 1`,[s.tenantId,s.parkId,next.position_code,id])).length)throw new ConflictException("岗位编码已存在。");
   const values:unknown[]=[id,s.tenantId,s.parkId,d.expectedVersion,a.sub];const set=changed.map(f=>`${columns[f]}=$${values.push(d[f])}`);
   let saved:Row;
   try{saved=typeormQueryRows<Row>(await m.query(`UPDATE hr_position SET ${set.join(",")},version=version+1,update_by=$5,update_time=now() WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND version=$4 AND is_deleted=false RETURNING *`,values))[0]!;}catch(error){const failure=error as {code?:string;constraint?:string};if(failure.code==="23505"&&failure.constraint==="uq_hr_position_scope_code")throw new ConflictException("岗位编码已存在。");if(failure.code==="23514"&&failure.constraint==="hr_position_assignment_continuity")throw new ConflictException("岗位任职关系已变化，请刷新并先处理任职调整。");throw error;}
   if(!saved)throw new ConflictException("岗位已被修改，请刷新后重新核对。");
   await this.audit.recordOperationRequired({...s,userId:a.sub,module:"人力资源管理",resource:"hr.position",action:"维护正式岗位",bizType:"hr_position",bizId:id,beforeJson:project(row),afterJson:{...project(saved),reason:d.reason},method:"PATCH",path:"/hr/positions/:id",success:true,requestId:null},m);
   return project(saved);
  });
 }
}
