import {Injectable,NotFoundException} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {HR_ENTERPRISE_PAGE_ROUTES,HR_ENTERPRISE_PAGE_LABELS,type EnterpriseContext,type TenantParkScope,type UserContext,type UserMenuTreeNode} from '@jinhu/shared';
import {IdentityDirectoryService} from '../modules/users/identity-directory.service';
import {FieldPolicyService} from '../modules/field-policies/field-policy.service';
import {DataScopeService} from '../modules/data-scopes/data-scope.service';
import {EnterpriseScopeService} from './enterprise-scope.service';
import type {AuthUserContextPort} from '../modules/auth/auth-user-context.port';
@Injectable()
export class EnterpriseContextService implements AuthUserContextPort {
 constructor(private readonly db:DataSource,private readonly identity:IdentityDirectoryService,private readonly fields:FieldPolicyService,private readonly dataScopes:DataScopeService,private readonly enterprise:EnterpriseScopeService){}
 async getCurrentUserContext(scope:TenantParkScope,id:string):Promise<UserContext>{
  const principal=await this.identity.resolveJwtPrincipal(scope,id),profile=await this.identity.findByIdForIdentity(id,scope.tenantId);
  if(!profile)throw new NotFoundException('Enterprise user unavailable');
  const enterprises:EnterpriseContext[]=await this.db.query(`SELECT s.id::text enterprise_id,s.scope_key,s.scope_code enterprise_code,s.scope_name enterprise_name FROM sys_business_scope s JOIN sys_user_business_scope_membership m ON(m.tenant_id,m.scope_id)=(s.tenant_id,s.id) WHERE s.tenant_id=$1 AND s.scope_kind='enterprise' AND s.status='enabled' AND NOT s.is_deleted AND m.user_id=$2 AND m.status='enabled' AND NOT m.is_deleted ORDER BY s.scope_name,s.id`,[scope.tenantId,id]);
  const current=enterprises.find(e=>e.scope_key===scope.parkId);if(!current)throw new NotFoundException('Enterprise unavailable');
  const modules=await this.enterprise.listEnabledModulesForTenant(scope.tenantId,scope.parkId),enabled=new Set(modules.map(m=>m.module_code));
  const menuRows:Array<{code:string;name:string;frontend_route:string}>=await this.db.query(`SELECT code,name,frontend_route FROM sys_permission WHERE tenant_id=$1 AND is_enabled AND NOT is_deleted AND status='enabled' AND visible AND($2::boolean OR code=ANY($3::text[])) ORDER BY sort_no,id`,[scope.tenantId,principal.isSuper??false,principal.permissions]);
  const groups:UserMenuTreeNode[]=[];
  for(const [module,label] of [['hr','人力资源管理'],['system','企业管理'],['workflow','消息中心']]){
   if(!enabled.has(module!))continue;
   const children:UserMenuTreeNode[]=[];
   if(module==='hr')for(const row of menuRows){const href=HR_ENTERPRISE_PAGE_ROUTES[row.code],name=HR_ENTERPRISE_PAGE_LABELS[row.code];if(href&&name&&!children.some(node=>node.href===href))children.push({label:name,href,permission:row.code,module});}
   if(module==='hr'&&menuRows.some(r=>r.code==='hr:approvals')&&(principal.isSuper||principal.permissions.some(p=>p==='hr:approval:self_manage'||p==='hr:approval:park_review')))children.push({label:'建议与投诉',href:'/hr/employee-feedback',permission:'hr:approvals',module});
   if(module==='system'){const granted=new Set(menuRows.map(r=>r.code));const capability=granted.has('system:user:list')?'system:user:list':granted.has('system:user:create')&&granted.has('system:user:assign-roles')?'system:user:create':granted.has('system:role:create')&&granted.has('system:role:assign-permissions')?'system:role:create':null;if(capability)children.push({label:'企业成员与角色',href:'/enterprise',permission:capability,module});}
   if(module==='workflow')children.push({label:'我的消息',href:'/workflow/messages',module});
   if(children.length)groups.push({label:label!,module,children});
  }
  const [org]=await this.db.query(`SELECT o.id,o.org_name FROM rel_user_org l JOIN sys_org o ON(o.id,o.tenant_id,o.park_id)=(l.org_id,l.tenant_id,l.park_id) WHERE l.tenant_id=$1 AND l.park_id=$2 AND l.user_id=$3 AND l.is_primary AND NOT l.is_deleted AND NOT o.is_deleted ORDER BY l.id LIMIT 1`,[scope.tenantId,scope.parkId,id]);
  const secured=await this.fields.applyFieldPolicies(scope,principal,'system','user',{mobile:profile.mobile,email:profile.email});
  return{id,username:profile.username,real_name:profile.displayName,mobile:secured.mobile??null,email:secured.email??null,avatar_url:profile.avatarUrl,gender:profile.gender,last_login_ip:profile.lastLoginIp,last_login_time:profile.lastLoginTime?.toISOString()??null,tenant_id:scope.tenantId,park_id:scope.parkId,park_name:null,accessible_parks:[],current_park:null,org_id:org?.id??null,org_name:org?.org_name??null,roles:principal.roles.map(code=>({role_code:code,role_name:code})),permissions:principal.permissions,data_scope:principal.dataScope??'self',data_scopes:await this.dataScopes.getUserDataScopes(scope,principal),field_permissions:[],field_policies:await this.fields.getUserFieldPolicies(scope,principal),enabled_modules:modules,menu_tree:groups,menus:groups,is_super:principal.isSuper??false,is_tenant_bootstrap_admin:false,runtime_mode:'hr_enterprise',business_scope:{kind:'enterprise',tenantId:scope.tenantId,scopeId:current.enterprise_id,parkId:null},current_enterprise:current,accessible_enterprises:enterprises};
 }
}
