import type {EntityManager} from 'typeorm';
import type {TenantParkScope} from '@jinhu/shared';
export const IDENTITY_SCOPE_PORT=Symbol('IDENTITY_SCOPE_PORT');
/** Deployment-owned SQL, never constructed from request input. Uses usr/$3 in the shared principal query. */
export interface IdentityScopePort {
 readonly principalPredicate:string;
 selectLoginScope(manager:EntityManager,tenantId:string,userId:string,homeScopeKey:string,requestedScopeKey?:string):Promise<TenantParkScope|null>;
 activeMemberUsers(manager:EntityManager,scope:TenantParkScope,userIds?:string[],lock?:boolean):Promise<Array<{id:string;username:string;displayName:string;status:string}>>;
 lockActiveScope(manager:EntityManager,scope:TenantParkScope,userId:string):Promise<void>;
}

/** Static SQL fragments for server-owned aliases only; never accept request identifiers. */
export function activeUserStorageScopePredicate(port:IdentityScopePort|undefined,userAlias:string,scopeParameter:number):string {
 if(!/^[a-z_][a-z0-9_]*$/.test(userAlias)||!Number.isInteger(scopeParameter)||scopeParameter<1)throw new Error('Invalid internal user scope SQL reference');
 if(!port)return `${userAlias}.park_id=$${scopeParameter}`;
 return `${userAlias}.is_enabled AND ${userAlias}.status='enabled' AND EXISTS(SELECT 1 FROM sys_user_business_scope_membership scoped_member JOIN sys_business_scope scoped_enterprise ON(scoped_enterprise.id,scoped_enterprise.tenant_id)=(scoped_member.scope_id,scoped_member.tenant_id) JOIN sys_tenant scoped_tenant ON(scoped_tenant.id,scoped_tenant.tenant_id)=(scoped_enterprise.tenant_row_id,scoped_enterprise.tenant_id) WHERE scoped_member.user_id=${userAlias}.id AND scoped_member.tenant_id=${userAlias}.tenant_id AND scoped_enterprise.scope_key=$${scopeParameter} AND scoped_enterprise.scope_kind='enterprise' AND scoped_enterprise.status='enabled' AND NOT scoped_enterprise.is_deleted AND scoped_member.status='enabled' AND NOT scoped_member.is_deleted AND scoped_tenant.status=1 AND NOT scoped_tenant.is_deleted AND(scoped_tenant.expire_time IS NULL OR scoped_tenant.expire_time>now()))`;
}
/** A scoped historical fact keeps its tenant/person author even after membership stops. */
export function historicalUserStorageScopePredicate(port:IdentityScopePort|undefined,userAlias:string,factAlias:string):string {
 if(![userAlias,factAlias].every(alias=>/^[a-z_][a-z0-9_]*$/.test(alias)))throw new Error('Invalid internal historical user SQL reference');
 return port?'TRUE':`${userAlias}.park_id=${factAlias}.park_id`;
}
