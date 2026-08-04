import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Module,
  ValidationPipe
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import {
  PROPERTY_BUSINESS_PERMISSIONS as P,
  type EventReplayCommand
} from "@jinhu/shared";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { EntityManager } from "typeorm";
import { ModuleGuard } from "../../../shared/guards/module.guard";
import { PermissionGuard } from "../../../shared/guards/permission.guard";
import { setIdempotencyService } from "../../../shared/services/idempotency.service";
import type { JwtPrincipal } from "../../../shared/types/jwt-principal";
import { PropertyIncidentService } from "./property-incident.service";
import { PropertyEventIncidentController } from "./property-incident.controller";
import { DatabasePropertyRuntimeAuthorizationAdapter } from
  "./property-runtime-authorization.adapter";

type ModuleState = "active" | "missing" | "disabled" | "expired";

const exactPermissions = [
  P.PROPERTY_EVENT_DELIVERY_INCIDENTS_PAGE,
  P.PROPERTY_EVENT_READ_INCIDENT,
  P.PROPERTY_EVENT_REPLAY
];
const scope = { tenantId: "tenant-http", parkId: "park-http" };
const actorId = randomUUID();
const dlqId = randomUUID();

interface PersistedState {
  moduleState: ModuleState;
  databasePermissions: string[];
  parkAssignment: boolean;
  eventResource: boolean;
}

const persisted: PersistedState = {
  moduleState: "active",
  databasePermissions: [...exactPermissions],
  parkAssignment: true,
  eventResource: true
};

let principal: JwtPrincipal = exactPrincipal();
let adapterCalls = 0;
let baseUrl = "";
let application: Awaited<ReturnType<typeof NestFactory.create>>;

@Injectable()
class MutablePrincipalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<{ user?: JwtPrincipal }>().user = principal;
    return true;
  }
}

const moduleService = {
  async listEnabledModulesForTenant() {
    const assignment = persistedModuleAssignment(persisted.moduleState);
    const enabled = assignment !== null
      && assignment.enabled
      && assignment.status === "enabled"
      && (assignment.expireAt === null || assignment.expireAt.getTime() > Date.now());
    return enabled ? [{ module_code: "asset" }] : [];
  }
};

const manager = {
  query: async (sql: string) => {
    if (sql.includes("FROM rel_tenant_module")) {
      adapterCalls += 1;
      return persisted.moduleState === "active" ? [{ id: "asset-assignment" }] : [];
    }
    if (sql.includes("FROM sys_user actor")) {
      return persisted.databasePermissions.map((code) => ({ code }));
    }
    if (sql.includes("FROM rel_user_park")) {
      return persisted.parkAssignment ? [{ id: "park-assignment" }] : [];
    }
    if (sql.includes("FROM biz_property_event_dlq")) {
      return persisted.eventResource ? [{ id: dlqId }] : [];
    }
    throw new Error(`unexpected authorization query: ${sql}`);
  }
} as unknown as EntityManager;

const authorization = new DatabasePropertyRuntimeAuthorizationAdapter({
  transaction: async () => { throw new Error("replay must authorize on the store transaction"); }
} as never);

const store = {
  async prepareEventReplay(input: {
    dlqId: string;
    command: EventReplayCommand;
    authorize(value: EntityManager): Promise<void>;
  }) {
    await input.authorize(manager);
    return { dlqId: input.dlqId, eventId: randomUUID(), status: "replaying" as const, version: 2 };
  }
};

const incidentService = new PropertyIncidentService(
  store as never,
  authorization,
  { retry: async () => undefined } as never
);

@Module({
  controllers: [PropertyEventIncidentController],
  providers: [{ provide: PropertyIncidentService, useValue: incidentService }]
})
class RuntimeAuthorizationHttpTestModule {}

describe("property event replay exact-role HTTP gate", () => {
  before(async () => {
    setIdempotencyService({
      buildFingerprint: () => "f".repeat(64),
      tryBegin: async () => ({ outcome: "began", request: { id: randomUUID() } }),
      markSucceeded: async () => undefined,
      markFailed: async () => undefined
    } as never);
    application = await NestFactory.create(RuntimeAuthorizationHttpTestModule, { logger: false });
    application.setGlobalPrefix("api/v1");
    application.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    application.useGlobalGuards(
      new MutablePrincipalGuard(),
      new PermissionGuard(new Reflector()),
      new ModuleGuard(new Reflector(), moduleService as never)
    );
    await application.listen(0, "127.0.0.1");
    baseUrl = await application.getUrl();
  });

  after(async () => {
    await application.close();
  });

  it("allows only the complete active module, exact permission and assigned incident chain", async () => {
    reset();
    const response = await replay();
    assert.equal(response.status, 201);
    assert.equal((await response.json() as { status: string }).status, "replaying");
    assert.equal(adapterCalls, 1, "positive HTTP path must reach the database authorization adapter");
  });

  it("rejects missing, disabled and expired persisted module assignments as distinct HTTP 403 states", async () => {
    for (const moduleState of ["missing", "disabled", "expired"] as const) {
      reset();
      persisted.moduleState = moduleState;
      const assignment = persistedModuleAssignment(moduleState);
      if (moduleState === "missing") assert.equal(assignment, null);
      if (moduleState === "disabled") assert.equal(assignment?.enabled, false);
      if (moduleState === "expired") assert.ok((assignment?.expireAt?.getTime() ?? Infinity) < Date.now());
      assert.equal((await replay()).status, 403, moduleState);
      assert.equal(adapterCalls, 0, `${moduleState} must be stopped by the HTTP module guard`);
    }
  });

  it("rejects each endpoint permission before the controller independently", async () => {
    for (const missing of exactPermissions) {
      reset();
      principal = exactPrincipal(exactPermissions.filter((permission) => permission !== missing));
      assert.equal((await replay()).status, 403, missing);
      assert.equal(adapterCalls, 0);
    }
  });

  it("rejects each current database grant and assigned tenant/park incident scope independently", async () => {
    for (const missing of [...exactPermissions, "park-assignment", "event-resource"] as const) {
      reset();
      persisted.databasePermissions = exactPermissions.filter((permission) => permission !== missing);
      persisted.parkAssignment = missing !== "park-assignment";
      persisted.eventResource = missing !== "event-resource";
      assert.equal((await replay()).status, 403, missing);
      assert.equal(adapterCalls, 1, `${missing} must reach exact database authorization`);
    }
  });

  it("does not let generic, super or wildcard claims substitute for exact database grants", async () => {
    for (const generic of [["property_event:read"], ["super:*"], ["*"]]) {
      reset();
      principal = {
        ...exactPrincipal(["*"]),
        isSuper: true
      };
      persisted.databasePermissions = generic;
      assert.equal((await replay()).status, 403, generic[0]);
      assert.equal(adapterCalls, 1);
    }
  });
});

function reset(): void {
  principal = exactPrincipal();
  persisted.moduleState = "active";
  persisted.databasePermissions = [...exactPermissions];
  persisted.parkAssignment = true;
  persisted.eventResource = true;
  adapterCalls = 0;
}

function exactPrincipal(permissions: readonly string[] = exactPermissions): JwtPrincipal {
  return {
    sub: actorId,
    username: "event-operator",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [...permissions],
    isSuper: false
  };
}

function persistedModuleAssignment(state: ModuleState) {
  if (state === "missing") return null;
  if (state === "disabled") {
    return { enabled: false, status: "disabled", expireAt: null };
  }
  if (state === "expired") {
    return { enabled: true, status: "enabled", expireAt: new Date(Date.now() - 60_000) };
  }
  return { enabled: true, status: "enabled", expireAt: null };
}

function replay(): Promise<Response> {
  const clientKey = `http-${randomUUID()}`;
  return fetch(`${baseUrl}/api/v1/property/event-delivery-incidents/${dlqId}/replay`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": clientKey
    },
    body: JSON.stringify({
      clientKey,
      incidentId: "INC-HTTP-1",
      reason: "broker connection restored",
      expectedDlqVersion: 1
    })
  });
}
