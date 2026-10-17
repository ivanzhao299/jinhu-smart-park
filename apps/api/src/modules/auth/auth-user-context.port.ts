import type {TenantParkScope,UserContext} from '@jinhu/shared';
export const AUTH_USER_CONTEXT=Symbol('AUTH_USER_CONTEXT');
export interface AuthUserContextPort {getCurrentUserContext(scope:TenantParkScope,id:string):Promise<UserContext>;}
