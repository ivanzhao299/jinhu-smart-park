import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule } from "@nestjs/typeorm";
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
import { FieldPoliciesModule } from "./modules/field-policies/field-policies.module";
import { FilesModule } from "./modules/files/files.module";
import { FloorsModule } from "./modules/floors/floors.module";
import { OrgsModule } from "./modules/orgs/orgs.module";
import { ParkTenantsModule } from "./modules/park-tenants/park-tenants.module";
import { ParksModule } from "./modules/parks/parks.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { RolesModule } from "./modules/roles/roles.module";
import { SaaSModulesModule } from "./modules/saas-modules/saas-modules.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { UnitsModule } from "./modules/units/units.module";
import { UsersModule } from "./modules/users/users.module";
import { ResponseInterceptor } from "./shared/interceptors/response.interceptor";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { AuditLogInterceptor } from "./shared/interceptors/audit-log.interceptor";
import { ApiExceptionFilter } from "./shared/filters/api-exception.filter";
import { IdempotencyKeyGuard } from "./shared/guards/idempotency-key.guard";
import { ModuleGuard } from "./shared/guards/module.guard";
import { PermissionGuard } from "./shared/guards/permission.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: [".env", "../../.env"], isGlobal: true }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req) => req.headers["x-request-id"]?.toString() ?? randomUUID()
      }
    }),
    ScheduleModule.forRoot(),
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
    UnitsModule,
    ParkTenantsModule,
    OrgsModule,
    UsersModule,
    RolesModule,
    SaaSModulesModule,
    PermissionsModule,
    DictsModule,
    AttachmentsModule,
    FilesModule,
    AuditModule
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
    }
  ]
})
export class AppModule {}
