import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HrPerformanceLegacyController } from "./hr-performance-legacy.controller";
import { HrPerformanceLegacyService } from "./hr-performance-legacy.service";

// Transport contract only: real Nest routing/DTOs/decorators, synthetic service.
// Database visibility and authenticated role enforcement have separate suites.
test("legacy HTTP routes bind server scope and validate source integer bounds", async () => {
  const calls: Array<{ scope: unknown; actor: unknown; query: unknown }> = [];
  const actor = { sub: "fixture-reader", tenantId: "fixture-tenant", parkId: "fixture-park" };
  const service = {
    masters: async (scope: unknown, user: unknown, query: { page: number; page_size: number }) => {
      calls.push({ scope, actor: user, query });
      return { items: [{ sourceTotalValue: "79.25", sourcePay: null }], total: 1, page: query.page, page_size: query.page_size };
    },
    rubric: async (scope: unknown, user: unknown, query: unknown) => {
      calls.push({ scope, actor: user, query });
      return { levels: [], items: [] };
    },
  };
  class FixtureModule {}
  Module({ controllers: [HrPerformanceLegacyController], providers: [{ provide: HrPerformanceLegacyService, useValue: service }] })(FixtureModule);
  const app = await NestFactory.create(FixtureModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = actor; next(); });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const get = (path: string) => fetch(`${base}/api/v1/hr/performance-legacy/${path}`);
    for (const value of ["0", "2147483647"]) {
      const response = await get(`masters?source_session_id=${value}&page=1&page_size=20`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { items: [{ sourceTotalValue: "79.25", sourcePay: null }], total: 1, page: 1, page_size: 20 });
      assert.deepEqual(calls.at(-1)?.scope, { tenantId: actor.tenantId, parkId: actor.parkId });
      assert.equal((calls.at(-1)?.query as { source_session_id: number }).source_session_id, Number(value));
    }
    const beforeInvalid = calls.length;
    for (const value of ["-1", "1.5", "2147483648", "NaN"]) {
      for (const route of [`masters?source_session_id=${value}`, `rubric?source_assessment_id=${value}`]) {
        const response = await get(route);
        assert.equal(response.status, 400, route);
        await response.arrayBuffer();
      }
    }
    const scopeOverride = await get("masters?tenantId=other");
    assert.equal(scopeOverride.status, 400);
    await scopeOverride.arrayBuffer();
    assert.equal(calls.length, beforeInvalid);
  } finally {
    await app.close();
  }
});
