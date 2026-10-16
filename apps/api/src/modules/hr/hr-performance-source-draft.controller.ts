import {Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Query,UseGuards,UseInterceptors} from '@nestjs/common';
import {HR_PERMISSIONS,type TenantParkScope} from '@jinhu/shared';
import {CurrentScope} from '../../shared/decorators/current-scope.decorator';
import {CurrentUser} from '../../shared/decorators/current-user.decorator';
import {RequireModule} from '../../shared/decorators/modules.decorator';
import {RequireAnyPermissions} from '../../shared/decorators/permissions.decorator';
import {IdempotencyInterceptor} from '../../shared/interceptors/idempotency.interceptor';
import type {JwtPrincipal} from '../../shared/types/jwt-principal';
import {AuditLog} from '../audit/decorators/audit-log.decorator';
import {HrPerformanceSourceDraftService} from './hr-performance-source-draft.service';
import {HrPerformanceSourceDraftGuard} from './hr-performance-source-draft.guard';
import {CreateHrPerformanceSourceDraftDto,RefreshHrPerformanceSourceDraftDto,PatchHrPerformanceSourceDraftDto,HrPerformanceSourceKindPageDto,HrPerformanceSourcePageDto,HrPerformanceSourcePreviewDto,HrPerformanceSourceOptionsDto,HrPerformanceSourceCandidatesDto} from './dto/hr-performance-source-draft.dto';
@Controller('hr/performance-v2/source-drafts') @RequireModule('hr')
@RequireAnyPermissions(HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ,HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE,HR_PERMISSIONS.HR_PERFORMANCE_READ,HR_PERMISSIONS.HR_PERFORMANCE_MANAGE)
export class HrPerformanceSourceDraftController {
 constructor(private readonly service:HrPerformanceSourceDraftService){}
 @Get('candidates') candidates(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrPerformanceSourceCandidatesDto){return this.service.candidates(s,a,q);}
 @Get('options') @UseGuards(HrPerformanceSourceDraftGuard) options(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrPerformanceSourceOptionsDto){return this.service.options(s,a,q);}
 @Get('preview') preview(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrPerformanceSourcePreviewDto){return this.service.preview(s,a,q);}
 @Get() list(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Query()q:HrPerformanceSourceKindPageDto){return this.service.list(s,a,q);}
 @Get(':id/history') history(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Query()q:HrPerformanceSourcePageDto){return this.service.history(s,a,id,q);}
 @Get(':id') detail(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string){return this.service.detail(s,a,id);}
 @Post() @UseGuards(HrPerformanceSourceDraftGuard) @UseInterceptors(new IdempotencyInterceptor())
 @AuditLog({module:'人力资源管理',resource:'hr.performance_source_draft',action:'create source draft',bizType:'hr_performance_source_draft',captureBody:false})
 create(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Body()b:CreateHrPerformanceSourceDraftDto){return this.service.create(s,a,b);}
 @Patch(':id') @UseGuards(HrPerformanceSourceDraftGuard) @UseInterceptors(new IdempotencyInterceptor())
 @AuditLog({module:'人力资源管理',resource:'hr.performance_source_draft',action:'revise source draft',bizType:'hr_performance_source_draft',bizIdParam:'id',captureBody:false})
 patch(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:PatchHrPerformanceSourceDraftDto){return this.service.patch(s,a,id,b);}
 @Post(':id/refresh') @UseGuards(HrPerformanceSourceDraftGuard) @UseInterceptors(new IdempotencyInterceptor())
 @AuditLog({module:'人力资源管理',resource:'hr.performance_source_draft',action:'refresh source draft',bizType:'hr_performance_source_draft',bizIdParam:'id',captureBody:false})
 refresh(@CurrentScope()s:TenantParkScope,@CurrentUser()a:JwtPrincipal,@Param('id',new ParseUUIDPipe())id:string,@Body()b:RefreshHrPerformanceSourceDraftDto){return this.service.refresh(s,a,id,b);}
}
