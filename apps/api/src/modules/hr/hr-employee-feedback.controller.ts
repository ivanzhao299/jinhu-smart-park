import {Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Query,UseGuards,UseInterceptors} from '@nestjs/common';
import {HR_PERMISSIONS as H,type TenantParkScope} from '@jinhu/shared';
import {CurrentScope} from '../../shared/decorators/current-scope.decorator';
import {CurrentUser} from '../../shared/decorators/current-user.decorator';
import {RequireModule} from '../../shared/decorators/modules.decorator';
import {RequireAnyPermissions,RequirePermissions} from '../../shared/decorators/permissions.decorator';
import {IdempotencyInterceptor} from '../../shared/interceptors/idempotency.interceptor';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {HrEmployeeFeedbackService} from './hr-employee-feedback.service';
import {HrEmployeeFeedbackGuard} from './hr-employee-feedback.guard';
import {CreateHrEmployeeFeedbackDto,EditHrEmployeeFeedbackDto,HrEmployeeFeedbackCommandDto,ReplyHrEmployeeFeedbackDto,HrEmployeeFeedbackPageDto,HrEmployeeFeedbackViewDto} from './dto/hr-employee-feedback.dto';
@Controller('hr/employee-feedback') @RequireModule('hr') @RequirePermissions(H.HR_APPROVALS_PAGE) @RequireAnyPermissions(H.HR_APPROVAL_SELF_MANAGE,H.HR_APPROVAL_PARK_REVIEW) @UseGuards(HrEmployeeFeedbackGuard)
export class HrEmployeeFeedbackController {
 constructor(private readonly service:HrEmployeeFeedbackService){}
 @Get('context') context(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal){return this.service.context(s,a);}
 @Get() list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrEmployeeFeedbackPageDto){return this.service.list(s,a,q);}
 @Get(':id/history') history(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Query()q:HrEmployeeFeedbackPageDto){return this.service.history(s,a,id,q);}
 @Get(':id') detail(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Query()q:HrEmployeeFeedbackViewDto){return this.service.detail(s,a,id,q.view);}
 @Post() @UseInterceptors(new IdempotencyInterceptor()) create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()b:CreateHrEmployeeFeedbackDto){return this.service.create(s,a,b);}
 @Patch(':id') @UseInterceptors(new IdempotencyInterceptor()) edit(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:EditHrEmployeeFeedbackDto){return this.service.mutate(s,a,id,'edit',b);}
 @Post(':id/submit') @UseInterceptors(new IdempotencyInterceptor()) submit(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:HrEmployeeFeedbackCommandDto){return this.service.mutate(s,a,id,'submit',b);}
 @Post(':id/cancel') @UseInterceptors(new IdempotencyInterceptor()) cancel(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:HrEmployeeFeedbackCommandDto){return this.service.mutate(s,a,id,'cancel',b);}
 @Post(':id/withdraw') @UseInterceptors(new IdempotencyInterceptor()) withdraw(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:HrEmployeeFeedbackCommandDto){return this.service.mutate(s,a,id,'withdraw',b);}
 @Post(':id/reply') @UseInterceptors(new IdempotencyInterceptor()) reply(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:ReplyHrEmployeeFeedbackDto){return this.service.mutate(s,a,id,'reply',b);}
}
