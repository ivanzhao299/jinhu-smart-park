import {Module} from '@nestjs/common';
import {ConfigModule,ConfigService} from '@nestjs/config';
import {APP_FILTER,APP_GUARD,APP_INTERCEPTOR} from '@nestjs/core';
import {ScheduleModule} from '@nestjs/schedule';
import {TypeOrmModule,getRepositoryToken} from '@nestjs/typeorm';
import {ClsModule} from 'nestjs-cls';
import {randomUUID} from 'node:crypto';
import {DataSource} from 'typeorm';
import {IdentityDirectoryModule} from '../modules/users/identity-directory.module';
import {HrModule} from '../modules/hr/hr.module';
import {OrgsModule} from '../modules/orgs/orgs.module';
import {AuditModule} from '../modules/audit/audit.module';
import {DataScopesModule} from '../modules/data-scopes/data-scopes.module';
import {FieldPoliciesModule} from '../modules/field-policies/field-policies.module';
import {HrFilesModule} from '../modules/files/hr-files.module';
import {DictsModule} from '../modules/dicts/dicts.module';
import {SaaSModulesService} from '../modules/saas-modules/saas-modules.service';
import {JwtAuthGuard} from '../modules/auth/guards/jwt-auth.guard';
import {PermissionGuard} from '../shared/guards/permission.guard';
import {ModuleGuard} from '../shared/guards/module.guard';
import {IdempotencyKeyGuard} from '../shared/guards/idempotency-key.guard';
import {AuditLogInterceptor} from '../shared/interceptors/audit-log.interceptor';
import {ResponseInterceptor} from '../shared/interceptors/response.interceptor';
import {ApiExceptionFilter} from '../shared/filters/api-exception.filter';
import {RolePermissionEntity} from '../modules/permissions/entities/role-permission.entity';
import {PermissionEntity} from '../modules/permissions/entities/permission.entity';
import {IdempotencyRequestEntity} from '../shared/entities/idempotency-request.entity';
import {IdempotencyService,setIdempotencyService} from '../shared/services/idempotency.service';
import {IdempotencyCleanupService} from '../shared/services/idempotency-cleanup.service';
import {EnterpriseAuthModule} from './enterprise-auth.module';
import {EnterpriseScopeModule} from './enterprise-scope.module';
import {EnterpriseScopeService} from './enterprise-scope.service';
import {EnterpriseAdminController} from './enterprise-admin.controller';
import {EnterpriseAdminService} from './enterprise-admin.service';
import {UserMessageEntity} from '../modules/workflow/entities/user-message.entity';
import {UserMessageService} from '../modules/workflow/user-message.service';
import {EnterpriseMessageController} from './enterprise-message.controller';
import {EnterpriseHealthController} from './enterprise-health.controller';
import {RuntimeIsolationService} from './runtime-isolation.service';
import {validateRuntimeEnvironment} from './runtime-environment';
@Module({imports:[
 ConfigModule.forRoot({envFilePath:['.env','../../.env'],isGlobal:true,validate:validateRuntimeEnvironment}),
 ClsModule.forRoot({global:true,middleware:{mount:true,generateId:true,idGenerator:req=>req.headers['x-request-id']?.toString()??randomUUID()}}),
 ScheduleModule.forRoot(),TypeOrmModule.forFeature([IdempotencyRequestEntity,RolePermissionEntity,PermissionEntity,UserMessageEntity]),
 TypeOrmModule.forRootAsync({inject:[ConfigService],useFactory:(c:ConfigService)=>({type:'postgres' as const,host:c.get<string>('POSTGRES_HOST','localhost'),port:c.get<number>('POSTGRES_PORT',5432),database:c.getOrThrow<string>('POSTGRES_DB'),username:c.get<string>('POSTGRES_USER','jinhu'),password:c.getOrThrow<string>('POSTGRES_PASSWORD'),autoLoadEntities:true,synchronize:false})}),
 IdentityDirectoryModule,EnterpriseScopeModule,EnterpriseAuthModule,HrModule,OrgsModule,AuditModule,DataScopesModule,FieldPoliciesModule,HrFilesModule,DictsModule
 ],controllers:[EnterpriseHealthController,EnterpriseAdminController,EnterpriseMessageController],providers:[
 {provide:SaaSModulesService,useExisting:EnterpriseScopeService},
 {provide:APP_FILTER,useClass:ApiExceptionFilter},{provide:APP_GUARD,useClass:JwtAuthGuard},{provide:APP_GUARD,useClass:PermissionGuard},{provide:APP_GUARD,useClass:ModuleGuard},{provide:APP_GUARD,useClass:IdempotencyKeyGuard},
 {provide:APP_INTERCEPTOR,useClass:AuditLogInterceptor},{provide:APP_INTERCEPTOR,useClass:ResponseInterceptor},
 {provide:IdempotencyService,useFactory:(repository:unknown,db:DataSource)=>{const service=new IdempotencyService(repository as never,db);setIdempotencyService(service);return service;},inject:[getRepositoryToken(IdempotencyRequestEntity),DataSource]},IdempotencyCleanupService,RuntimeIsolationService,EnterpriseAdminService,UserMessageService
 ]})
export class HrEnterpriseModule{}
