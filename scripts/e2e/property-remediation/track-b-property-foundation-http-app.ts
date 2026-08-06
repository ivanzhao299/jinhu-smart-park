import "reflect-metadata";
import {
  Injectable,
  Module,
  UnauthorizedException,
  ValidationPipe,
  type CanActivate,
  type ExecutionContext
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PropertyIdentityController } from "../../../apps/api/src/modules/property-identity/property-identity.controller";
import { propertyIdentityError } from "../../../apps/api/src/modules/property-identity/property-identity.error";
import { PropertyIdentityService } from "../../../apps/api/src/modules/property-identity/property-identity.service";
import { SaaSModulesService } from "../../../apps/api/src/modules/saas-modules/saas-modules.service";
import { ApiExceptionFilter } from "../../../apps/api/src/shared/filters/api-exception.filter";
import { ModuleGuard } from "../../../apps/api/src/shared/guards/module.guard";
import { PermissionGuard } from "../../../apps/api/src/shared/guards/permission.guard";
import { ResponseInterceptor } from "../../../apps/api/src/shared/interceptors/response.interceptor";
import type { JwtPrincipal } from "../../../apps/api/src/shared/types/jwt-principal";

export interface PropertyFoundationHttpHarness {
  baseUrl: string;
  close(): Promise<void>;
}

const principal: JwtPrincipal = {
  sub: "ba000000-0000-4000-8000-000000000401",
  username: "b05-core-gate",
  tenantId: "10000001",
  parkId: "ba000000-0000-4000-8000-000000000001",
  roles: ["B05_CORE_GATE"],
  permissions: [
    PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY,
    PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ,
    "audit:read"
  ],
  isSuper: false
};

@Injectable()
class GatePrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal }>();
    if (
      request.headers.authorization !== "Bearer b05-core-gate"
      || request.headers["x-b05-principal"] !== "normal"
    ) {
      throw new UnauthorizedException("B-0.5 disposable principal is required");
    }
    request.user = {
      ...principal,
      roles: [...principal.roles],
      permissions: [...principal.permissions]
    };
    return true;
  }
}

const identityService = {
  list() {
    return {
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      allowedActions: ["party.identity.create-draft"]
    };
  },
  detail() {
    throw propertyIdentityError("property-version-conflict", {
      winnerId: "ba000000-0000-4000-8000-000000000499"
    });
  }
};

const moduleService = {
  async listEnabledModulesForTenant() {
    return [{ module_code: "asset" }];
  }
};

const clsService = {
  getId() {
    return "pr192-b05-core-http";
  }
};

@Module({
  controllers: [PropertyIdentityController],
  providers: [
    GatePrincipalGuard,
    PermissionGuard,
    ModuleGuard,
    ResponseInterceptor,
    ApiExceptionFilter,
    { provide: PropertyIdentityService, useValue: identityService },
    { provide: SaaSModulesService, useValue: moduleService },
    { provide: ClsService, useValue: clsService },
    { provide: APP_GUARD, useExisting: GatePrincipalGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
    { provide: APP_GUARD, useExisting: ModuleGuard },
    { provide: APP_INTERCEPTOR, useExisting: ResponseInterceptor },
    { provide: APP_FILTER, useExisting: ApiExceptionFilter }
  ]
})
class PropertyFoundationHttpModule {}

export async function startPropertyFoundationHttpHarness():
Promise<PropertyFoundationHttpHarness> {
  const app = await NestFactory.create(PropertyFoundationHttpModule, {
    logger: false
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
  }));
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address() as {
    address: string;
    port: number;
  };
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => app.close()
  };
}
