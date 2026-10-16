import {Body,Controller,Get,Param,ParseUUIDPipe,Post,Query,UseGuards,UseInterceptors} from '@nestjs/common';
import {HR_PERMISSIONS,type TenantParkScope} from '@jinhu/shared';
import {CurrentScope} from '../../shared/decorators/current-scope.decorator';
import {CurrentUser} from '../../shared/decorators/current-user.decorator';
import {RequireModule} from '../../shared/decorators/modules.decorator';
import {RequireAnyPermissions} from '../../shared/decorators/permissions.decorator';
import {IdempotencyInterceptor} from '../../shared/interceptors/idempotency.interceptor';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {AuditLog} from '../audit/decorators/audit-log.decorator';
import {HrPerformanceSourceActivationService} from './hr-performance-source-activation.service';
import {HrPerformanceSourceActivationGuard} from './hr-performance-source-activation.guard';
import {HrPerformanceSourceActivationPreviewDto,HrPerformanceSourceActivationPageDto,HrPerformanceSourceTemplateActivationDto,HrPerformanceSourceReviewActivationDto} from './dto/hr-performance-source-activation.dto';
@Controller('hr/performance-v2/source-drafts') @RequireModule('hr') @UseGuards(HrPerformanceSourceActivationGuard)
@RequireAnyPermissions(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,HR_PERMISSIONS.HR_PERFORMANCE_READ,HR_PERMISSIONS.HR_PERFORMANCE_MANAGE)
export class HrPerformanceSourceActivationController {
 constructor(private readonly service:HrPerformanceSourceActivationService){}
 @Get(':id/activation-preview') preview(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Query()q:HrPerformanceSourceActivationPreviewDto){return this.service.preview(s,a,id,q.expectedRevisionId);}
 @Get(':id/activations') history(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Query()q:HrPerformanceSourceActivationPageDto){return this.service.history(s,a,id,q.page,q.pageSize);}
 @Post(':id/activate-template') @UseInterceptors(new IdempotencyInterceptor())
 @AuditLog({module:'人力资源管理',resource:'hr.performance_source_activation',action:'activate source template',bizType:'hr_performance_source_draft',bizIdParam:'id',captureBody:false})
 template(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:HrPerformanceSourceTemplateActivationDto){return this.service.activate(s,a,id,b,false);}
 @Post(':id/activate-review') @UseInterceptors(new IdempotencyInterceptor())
 @AuditLog({module:'人力资源管理',resource:'hr.performance_source_activation',action:'activate source review',bizType:'hr_performance_source_draft',bizIdParam:'id',captureBody:false})
 review(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:HrPerformanceSourceReviewActivationDto){return this.service.activate(s,a,id,b,true);}
}
