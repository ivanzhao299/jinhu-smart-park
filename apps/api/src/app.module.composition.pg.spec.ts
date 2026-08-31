import "reflect-metadata";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ApplicationConfig, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { PROPERTY_MUTATION_RECEIPT_PORT } from "@jinhu/shared";
import { PropertyApprovalModule } from
  "./modules/property-approvals/property-approval.module";
import { DatabasePropertyMutationReceiptAdapter } from
  "./modules/property-approvals/property-mutation-receipt.adapter";
import { PropertyTaskController } from
  "./modules/property-tasks/property-task.controller";
import { PropertyTaskModule } from "./modules/property-tasks/property-task.module";
import { PropertyTaskService } from "./modules/property-tasks/property-task.service";

const gateRequired = process.env.PROPERTY_APPMODULE_COMPOSITION_PG_REQUIRED === "1";
process.env.PARTY_DATA_ENCRYPTION_KEY ??= "app-module-composition-test-party-key-32-bytes";
if (gateRequired && !process.env.POSTGRES_PASSWORD) {
  throw new Error("POSTGRES_PASSWORD is required for the AppModule composition gate");
}
const suite = gateRequired ? describe : describe.skip;

type ProviderWrapper = { instance?: unknown };
type RuntimeModule = {
  metatype?: unknown;
  providers: Map<unknown, ProviderWrapper>;
  controllers: Map<unknown, ProviderWrapper>;
};
type NestApplicationInternals = {
  config: ApplicationConfig;
  container: { getModules(): Map<string, RuntimeModule> };
};
type ExpressRouteLayer = {
  route?: { path?: string | string[]; methods?: Record<string, boolean> };
};

const expectedTaskRoutes = [
  "GET /api/v1/property/tasks",
  "GET /api/v1/property/tasks/:taskId",
  "POST /api/v1/property/tasks/:taskId/block",
  "POST /api/v1/property/tasks/:taskId/claim",
  "POST /api/v1/property/tasks/:taskId/release",
  "POST /api/v1/property/tasks/:taskId/start",
  "POST /api/v1/property/tasks/:taskId/unblock",
  "POST /api/v1/property/tasks/internal/rebuild"
];
const expectedApplicationGuards = [
  "JwtAuthGuard",
  "PermissionGuard",
  "ModuleGuard",
  "IdempotencyKeyGuard",
  "PropertyHighRiskActionGuard"
];

suite("AppModule PostgreSQL composition gate", () => {
  let app: NestExpressApplication;

  before(async () => {
    const { AppModule } = await import("./app.module");
    app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false
    });
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  after(async () => {
    await app?.close();
  });

  it("composes PropertyTaskModule through the full AppModule", () => {
    const selected = app.select(PropertyTaskModule);
    assert.ok(selected.get(PropertyTaskController, { strict: true }));
    assert.ok(selected.get(PropertyTaskService, { strict: true }));

    const modules = (app as unknown as NestApplicationInternals)
      .container.getModules();
    assert.equal(
      [...modules.values()].filter(({ metatype }) => metatype === PropertyTaskModule).length,
      1
    );
  });

  it("registers the exact eight property task routes", () => {
    const express = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressRouteLayer[] };
    };
    const routes = (express._router?.stack ?? []).flatMap((layer) => {
      const route = layer.route;
      if (!route?.path || !route.methods) return [];
      const paths = Array.isArray(route.path) ? route.path : [route.path];
      const methods = route.methods;
      return paths.flatMap((path) => Object.entries(methods)
        .filter(([, enabled]) => enabled)
        .map(([method]) => `${method.toUpperCase()} ${path}`));
    }).filter((route) => route.includes("/api/v1/property/tasks"))
      .sort();
    assert.deepEqual(routes, expectedTaskRoutes);
  });

  it("resolves one shared approval receipt port singleton", () => {
    const port = app.get(PROPERTY_MUTATION_RECEIPT_PORT);
    const adapter = app.get(DatabasePropertyMutationReceiptAdapter);
    assert.strictEqual(port, adapter);

    const modules = (app as unknown as NestApplicationInternals)
      .container.getModules();
    const approvalModules = [...modules.values()]
      .filter(({ metatype }) => metatype === PropertyApprovalModule);
    assert.equal(approvalModules.length, 1);
    assert.equal(approvalModules[0]!.providers.get(PROPERTY_MUTATION_RECEIPT_PORT)?.instance,
      adapter);
    assert.equal(approvalModules[0]!.providers.get(DatabasePropertyMutationReceiptAdapter)?.instance,
      adapter);
    assert.equal([...modules.values()].filter((module) =>
      module.providers.has(PROPERTY_MUTATION_RECEIPT_PORT)).length, 1);
  });

  it("preserves the application guards followed by the nest-cls noop guard", async () => {
    const guards = (app as unknown as NestApplicationInternals)
      .config.getGlobalGuards();
    assert.deepEqual(
      guards.slice(0, expectedApplicationGuards.length)
        .map((guard) => guard.constructor.name),
      expectedApplicationGuards
    );
    assert.equal(guards.length, expectedApplicationGuards.length + 1);
    const clsNoopGuard = guards.at(-1) as {
      canActivate?: (context: unknown) => boolean | Promise<boolean>;
      constructor: { name: string };
    };
    assert.equal(clsNoopGuard.constructor.name, "Object");
    assert.deepEqual(Object.keys(clsNoopGuard), ["canActivate"]);
    assert.equal(typeof clsNoopGuard.canActivate, "function");
    assert.equal(await clsNoopGuard.canActivate!({}), true);
  });
});
