import {Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,UseInterceptors} from "@nestjs/common";
import {HR_PERMISSIONS,type TenantParkScope} from "@jinhu/shared";
import {CurrentScope} from "../../shared/decorators/current-scope.decorator";
import {CurrentUser} from "../../shared/decorators/current-user.decorator";
import {RequireModule} from "../../shared/decorators/modules.decorator";
import {RequirePermissions} from "../../shared/decorators/permissions.decorator";
import {IdempotencyInterceptor} from "../../shared/interceptors/idempotency.interceptor";
import type {JwtPrincipal} from "../../shared/types/jwt-principal";
import {CreateHrPositionDto} from "./dto/hr.dto";
import {UpdateHrPositionMaintenanceDto} from "./dto/hr-position-maintenance.dto";
import {HrPositionMaintenanceService} from "./hr-position-maintenance.service";
@Controller("hr/positions") @RequireModule("hr")
export class HrPositionMaintenanceController {
 constructor(private readonly service:HrPositionMaintenanceService){}
 @Get() @RequirePermissions(HR_PERMISSIONS.HR_POSITION_READ)
 list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.service.list(s,a);}
 @Get("maintenance-options") @RequirePermissions(HR_PERMISSIONS.HR_POSITION_MANAGE)
 options(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.service.options(s,a);}
 @Post() @RequirePermissions(HR_PERMISSIONS.HR_POSITION_MANAGE) @UseInterceptors(new IdempotencyInterceptor())
 create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()d:CreateHrPositionDto){return this.service.create(s,a,d);}
 @Get(":id/maintenance") @RequirePermissions(HR_PERMISSIONS.HR_POSITION_MANAGE)
 context(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string){return this.service.context(s,a,id);}
 @Patch(":id") @RequirePermissions(HR_PERMISSIONS.HR_POSITION_MANAGE) @UseInterceptors(new IdempotencyInterceptor())
 update(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param("id",new ParseUUIDPipe())id:string,@Body()d:UpdateHrPositionMaintenanceDto){return this.service.update(s,a,id,d);}
}
