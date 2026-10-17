import {Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Query,UseInterceptors} from '@nestjs/common';
import {SYSTEM_PERMISSIONS as P,type TenantParkScope} from '@jinhu/shared';
import {AuditLog} from '../modules/audit/decorators/audit-log.decorator';
import {CurrentScope} from '../shared/decorators/current-scope.decorator';
import {CurrentUser} from '../shared/decorators/current-user.decorator';
import {RequireModule} from '../shared/decorators/modules.decorator';
import {RequirePermissions} from '../shared/decorators/permissions.decorator';
import {IdempotencyInterceptor} from '../shared/interceptors/idempotency.interceptor';
import type {JwtPrincipal} from '../shared/types/jwt-principal';
import {EnterpriseAdminService} from './enterprise-admin.service';
import {EnterpriseMemberCreateDto,EnterpriseMemberRolesDto,EnterpriseMemberStateDto,EnterpriseRoleCreateDto,EnterpriseMemberQueryDto} from './enterprise-admin.dto';
@Controller('enterprise') @RequireModule('system') @AuditLog({module:'企业管理',resource:'hr.enterprise',action:'企业成员及角色办理',captureBody:false})
export class EnterpriseAdminController{
 constructor(private readonly service:EnterpriseAdminService){}
 @Get('members') @RequirePermissions(P.USER_LIST) members(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:EnterpriseMemberQueryDto){return this.service.members(s,a,q);}
 @Get('roles') @RequirePermissions(P.USER_ASSIGN_ROLES) roles(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.service.roles(s,a);}
 @Get('permissions') @RequirePermissions(P.ROLE_ASSIGN_PERMISSIONS) permissions(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.service.permissions(s,a);}
 @Post('members') @RequirePermissions(P.USER_CREATE,P.USER_ASSIGN_ROLES) @UseInterceptors(new IdempotencyInterceptor()) createMember(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()b:EnterpriseMemberCreateDto){return this.service.createMember(s,a,b);}
 @Patch('members/:id') @RequirePermissions(P.USER_UPDATE) @UseInterceptors(new IdempotencyInterceptor()) state(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:EnterpriseMemberStateDto){return this.service.reviseMember(s,a,id,b);}
 @Post('members/:id/roles') @RequirePermissions(P.USER_UPDATE,P.USER_ASSIGN_ROLES) @UseInterceptors(new IdempotencyInterceptor()) assign(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:EnterpriseMemberRolesDto){return this.service.reviseMember(s,a,id,b);}
 @Post('roles') @RequirePermissions(P.ROLE_CREATE,P.ROLE_ASSIGN_PERMISSIONS) @UseInterceptors(new IdempotencyInterceptor()) role(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()b:EnterpriseRoleCreateDto){return this.service.createRole(s,a,b);}
}
