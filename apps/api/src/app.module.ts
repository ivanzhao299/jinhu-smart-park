import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { ClsModule } from "nestjs-cls";
import { randomUUID } from "node:crypto";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AssetsModule } from "./modules/assets/assets.module";
import { BuildingsModule } from "./modules/buildings/buildings.module";
import { CodeRulesModule } from "./modules/code-rules/code-rules.module";
import { DataScopesModule } from "./modules/data-scopes/data-scopes.module";
import { DictsModule } from "./modules/dicts/dicts.module";
import { EnergyModule } from "./modules/energy/energy.module";
import { FieldPoliciesModule } from "./modules/field-policies/field-policies.module";
import { FilesModule } from "./modules/files/files.module";
import { FloorsModule } from "./modules/floors/floors.module";
import { IotModule } from "./modules/iot/iot.module";
import { LeasingContractChangesModule } from "./modules/leasing-contract-changes/leasing-contract-changes.module";
import { LeasingContractsModule } from "./modules/leasing-contracts/leasing-contracts.module";
import { LeasingCheckoutsModule } from "./modules/leasing-checkouts/leasing-checkouts.module";
import { LeasingInvoicesModule } from "./modules/leasing-invoices/leasing-invoices.module";
import { LeasingLeadsModule } from "./modules/leasing-leads/leasing-leads.module";
import { LeasingPaymentsModule } from "./modules/leasing-payments/leasing-payments.module";
import { LeasingReceivablesModule } from "./modules/leasing-receivables/leasing-receivables.module";
import { LeasingWaiversModule } from "./modules/leasing-waivers/leasing-waivers.module";
import { OrgsModule } from "./modules/orgs/orgs.module";
import { ParkTenantsModule } from "./modules/park-tenants/park-tenants.module";
import { ParksModule } from "./modules/parks/parks.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { RolesModule } from "./modules/roles/roles.module";
import { RobotsModule } from "./modules/robots/robots.module";
import { SaaSModulesModule } from "./modules/saas-modules/saas-modules.module";
import { SafetyEmergencyModule } from "./modules/safety-emergency/safety-emergency.module";
import { SafetyHazardsModule } from "./modules/safety-hazards/safety-hazards.module";
import { SafetyInspectPointsModule } from "./modules/safety-inspect-points/safety-inspect-points.module";
import { SafetyInspectPlansModule } from "./modules/safety-inspect-plans/safety-inspect-plans.module";
import { SafetyInspectTasksModule } from "./modules/safety-inspect-tasks/safety-inspect-tasks.module";
import { SafetyInspectTemplatesModule } from "./modules/safety-inspect-templates/safety-inspect-templates.module";
import { SafetyStatisticsModule } from "./modules/safety-statistics/safety-statistics.module";
import { SafetyWorkPermitsModule } from "./modules/safety-work-permits/safety-work-permits.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UnitsModule } from "./modules/units/units.module";
import { UsersModule } from "./modules/users/users.module";
import { VideoCamerasModule } from "./modules/video-cameras/video-cameras.module";
import { WorkflowModule } from "./modules/workflow/workflow.module";
import { WorkOrdersModule } from "./modules/work-orders/work-orders.module";
import { HealthController } from "./health.controller";
import { IdempotencyRequestEntity } from "./shared/entities/idempotency-request.entity";
import { ResponseInterceptor } from "./shared/interceptors/response.interceptor";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { AuditLogInterceptor } from "./shared/interceptors/audit-log.interceptor";
import { ApiExceptionFilter } from "./shared/filters/api-exception.filter";
import { IdempotencyKeyGuard } from "./shared/guards/idempotency-key.guard";
import { ModuleGuard } from "./shared/guards/module.guard";
import { PermissionGuard } from "./shared/guards/permission.guard";
import { IdempotencyCleanupService } from "./shared/services/idempotency-cleanup.service";
import { IdempotencyService, setIdempotencyService } from "./shared/services/idempotency.service";
import { DataSource } from "typeorm";

function getEnvString(config: Record<string, unknown>, key: string, fallback = ""): string {
  const value = config[key];
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

function validateProductionAuthEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = getEnvString(config, "NODE_ENV", process.env.NODE_ENV ?? "development");
  if (nodeEnv !== "production") {
    return config;
  }

  const fixedCode = getEnvString(config, "AUTH_SMS_FIXED_CODE", "");
  if (fixedCode.trim().length > 0) {
    throw new Error("AUTH_SMS_FIXED_CODE must be empty in production");
  }

  const showMockCode = getEnvString(config, "AUTH_SMS_CODE_VISIBLE", "false");
  if (showMockCode === "true") {
    throw new Error("AUTH_SMS_CODE_VISIBLE must be false in production");
  }

  const wechatMockEnabled = getEnvString(config, "AUTH_WECHAT_MOCK_ENABLED", "false");
  if (wechatMockEnabled === "true") {
    throw new Error("AUTH_WECHAT_MOCK_ENABLED must be false in production");
  }

  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env", "../../.env"],
      isGlobal: true,
      validate: validateProductionAuthEnvironment
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req) => req.headers["x-request-id"]?.toString() ?? randomUUID()
      }
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([IdempotencyRequestEntity]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("POSTGRES_HOST", "localhost"),
        port: config.get<number>("POSTGRES_PORT", 5432),
        database: config.get<string>("POSTGRES_DB", "jinhu_smart_park"),
        username: config.get<string>("POSTGRES_USER", "jinhu"),
        password: config.getOrThrow<string>("POSTGRES_PASSWORD"),
        autoLoadEntities: true,
        synchronize: false
      })
    }),
    AuthModule,
    TenantsModule,
    AssetsModule,
    ParksModule,
    BuildingsModule,
    CodeRulesModule,
    DataScopesModule,
    FieldPoliciesModule,
    FloorsModule,
    EnergyModule,
    IotModule,
    LeasingContractChangesModule,
    LeasingContractsModule,
    LeasingCheckoutsModule,
    LeasingInvoicesModule,
    LeasingLeadsModule,
    LeasingReceivablesModule,
    LeasingPaymentsModule,
    LeasingWaiversModule,
    UnitsModule,
    ParkTenantsModule,
    OrgsModule,
    UsersModule,
    RolesModule,
    RobotsModule,
    SaaSModulesModule,
    PermissionsModule,
    DictsModule,
    AttachmentsModule,
    FilesModule,
    AuditModule,
    VideoCamerasModule,
    WorkOrdersModule,
    WorkflowModule,
    SafetyInspectPointsModule,
    SafetyInspectTemplatesModule,
    SafetyInspectPlansModule,
    SafetyInspectTasksModule,
    SafetyHazardsModule,
    SafetyEmergencyModule,
    SafetyStatisticsModule,
    SafetyWorkPermitsModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard
    },
    {
      provide: APP_GUARD,
      useClass: ModuleGuard
    },
    {
      provide: APP_GUARD,
      useClass: IdempotencyKeyGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor
    },
    {
      provide: IdempotencyService,
      useFactory: (repository: unknown, dataSource: DataSource) => {
        const service = new IdempotencyService(repository as never, dataSource);
        setIdempotencyService(service);
        return service;
      },
      inject: [getRepositoryToken(IdempotencyRequestEntity), DataSource]
    },
    IdempotencyCleanupService
  ],
  controllers: [HealthController]
})
export class AppModule {}
