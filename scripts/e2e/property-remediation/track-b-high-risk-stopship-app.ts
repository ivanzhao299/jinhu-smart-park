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
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { AuditService } from "../../../apps/api/src/modules/audit/audit.service";
import { PropertyOccupanciesController } from "../../../apps/api/src/modules/property-operations/property-occupancies.controller";
import { PropertyOccupanciesService } from "../../../apps/api/src/modules/property-operations/property-occupancies.service";
import { PropertyOperationsController } from "../../../apps/api/src/modules/property-operations/property-operations.controller";
import { PropertyOperationsService } from "../../../apps/api/src/modules/property-operations/property-operations.service";
import { PropertyApprovalRequiredGuard } from "../../../apps/api/src/modules/property-operations/property-approval-required.guard";
import { SaaSModulesService } from "../../../apps/api/src/modules/saas-modules/saas-modules.service";
import { ApiExceptionFilter } from "../../../apps/api/src/shared/filters/api-exception.filter";
import { IdempotencyKeyGuard } from "../../../apps/api/src/shared/guards/idempotency-key.guard";
import { ModuleGuard } from "../../../apps/api/src/shared/guards/module.guard";
import { PermissionGuard } from "../../../apps/api/src/shared/guards/permission.guard";
import { AuditLogInterceptor } from "../../../apps/api/src/shared/interceptors/audit-log.interceptor";
import { ResponseInterceptor } from "../../../apps/api/src/shared/interceptors/response.interceptor";
import { setIdempotencyService } from "../../../apps/api/src/shared/services/idempotency.service";
import type { JwtPrincipal } from "../../../apps/api/src/shared/types/jwt-principal";

export interface StopshipHarnessCounters {
  auditCalls: number;
  idempotencyBeginCalls: number;
  operationServiceCalls: number;
  occupancyServiceCalls: number;
}

export interface StopshipHarness {
  baseUrl: string;
  counters: StopshipHarnessCounters;
  close(): Promise<void>;
}

interface MutableHarnessState {
  counters: StopshipHarnessCounters;
}

let state: MutableHarnessState | null = null;

const PRINCIPALS: Record<string, JwtPrincipal> = {
  normal: {
    sub: "00000000-0000-4000-8000-000000000101",
    username: "s0-normal",
    tenantId: "10000001",
    parkId: "20000001",
    roles: ["S0_NORMAL"],
    permissions: [
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATION_TRANSITION_MODE,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_RELEASE
    ],
    isSuper: false
  },
  super: {
    sub: "00000000-0000-4000-8000-000000000102",
    username: "s0-super",
    tenantId: "10000001",
    parkId: "20000001",
    roles: ["S0_SUPER"],
    permissions: [],
    isSuper: true
  },
  wildcard: {
    sub: "00000000-0000-4000-8000-000000000103",
    username: "s0-wildcard",
    tenantId: "10000001",
    parkId: "20000001",
    roles: ["S0_WILDCARD"],
    permissions: ["*"],
    isSuper: false
  }
};

@Injectable()
class StopshipPrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPrincipal }>();
    const principalName = request.headers["x-stopship-principal"];
    const principal = typeof principalName === "string" ? PRINCIPALS[principalName] : undefined;
    if (!principal || request.headers.authorization !== "Bearer stopship-local-only") {
      throw new UnauthorizedException("S0 disposable principal is required");
    }
    request.user = { ...principal, permissions: [...principal.permissions], roles: [...principal.roles] };
    return true;
  }
}

const operationService = {
  transitionMode(): never {
    state!.counters.operationServiceCalls += 1;
    throw new Error("S0 guard allowed a direct mode transition");
  },
  detail(): never {
    throw new Error("not used by S0 gate");
  },
  configure(): never {
    throw new Error("not used by S0 gate");
  },
  transitionLogs(): never {
    throw new Error("not used by S0 gate");
  }
};

const occupancyService = {
  release(_scope: unknown, _actor: unknown, id: string, dto: { force?: boolean; reason: string }) {
    state!.counters.occupancyServiceCalls += 1;
    if (dto.force) throw new Error("S0 guard allowed a force release");
    return {
      id,
      status: "released",
      releaseReason: dto.reason,
      harnessLowRisk: true
    };
  },
  list(): never {
    throw new Error("not used by S0 gate");
  },
  checkAvailability(): never {
    throw new Error("not used by S0 gate");
  },
  create(): never {
    throw new Error("not used by S0 gate");
  },
  activate(): never {
    throw new Error("not used by S0 gate");
  }
};

const moduleService = {
  async listEnabledModulesForTenant() {
    return [{ module_code: "asset" }];
  }
};

const auditService = {
  async recordOperation() {
    state!.counters.auditCalls += 1;
  }
};

const clsService = {
  getId() {
    return "pr192-b05-s0-http";
  }
};

@Module({
  controllers: [PropertyOperationsController, PropertyOccupanciesController],
  providers: [
    StopshipPrincipalGuard,
    PermissionGuard,
    ModuleGuard,
    IdempotencyKeyGuard,
    PropertyApprovalRequiredGuard,
    AuditLogInterceptor,
    ResponseInterceptor,
    ApiExceptionFilter,
    { provide: PropertyOperationsService, useValue: operationService },
    { provide: PropertyOccupanciesService, useValue: occupancyService },
    { provide: SaaSModulesService, useValue: moduleService },
    { provide: AuditService, useValue: auditService },
    { provide: ClsService, useValue: clsService },
    { provide: APP_GUARD, useExisting: StopshipPrincipalGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
    { provide: APP_GUARD, useExisting: ModuleGuard },
    { provide: APP_GUARD, useExisting: IdempotencyKeyGuard },
    { provide: APP_INTERCEPTOR, useExisting: AuditLogInterceptor },
    { provide: APP_INTERCEPTOR, useExisting: ResponseInterceptor },
    { provide: APP_FILTER, useExisting: ApiExceptionFilter }
  ]
})
class StopshipHarnessModule {}

export async function startStopshipHarness(): Promise<StopshipHarness> {
  const counters: StopshipHarnessCounters = {
    auditCalls: 0,
    idempotencyBeginCalls: 0,
    operationServiceCalls: 0,
    occupancyServiceCalls: 0
  };
  state = { counters };
  setIdempotencyService({
    buildFingerprint: () => "s0-low-risk-fingerprint",
    async tryBegin() {
      counters.idempotencyBeginCalls += 1;
      return {
        outcome: "proceed" as const,
        request: { id: "00000000-0000-4000-8000-000000000999" }
      };
    },
    async markSucceeded() {},
    async markFailed() {}
  } as never);

  const app = await NestFactory.create(StopshipHarnessModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true
  }));
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") {
    await app.close();
    throw new Error("S0 Nest harness did not expose a TCP port");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
    counters,
    async close() {
      await app.close();
      state = null;
    }
  };
}
