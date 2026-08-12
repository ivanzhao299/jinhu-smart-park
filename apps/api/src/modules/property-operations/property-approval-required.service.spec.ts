import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyOccupanciesService } from "./property-occupancies.service";

const scope = { tenantId: "tenant-1", parkId: "park-1" };
const principals = [
  { sub: "normal", isSuper: false, permissions: [] },
  { sub: "super", isSuper: true, permissions: [] },
  { sub: "wildcard", isSuper: false, permissions: ["*"] },
  {
    sub: "legacy",
    isSuper: false,
    permissions: ["legacy:property:all"]
  }
] as unknown as JwtPrincipal[];

test("mode transition now submits through the strict approval port and has a stable execution command", () => {
  const source = readFileSync(resolve(__dirname, "property-operations.service.ts"), "utf8");
  assert.match(source, /createPendingRequest\(/);
  assert.match(source, /sourceType: "property-operation-config"/);
  assert.match(source, /actionId: "property\.mode-transition\.request"/);
  assert.match(source, /executeApprovedModeTransition/);
  assert.doesNotMatch(source, /assertApprovalRequired\(/);
});

test("force release submits through the strict approval port while retaining an atomic audit command", () => {
  const source = readFileSync(resolve(__dirname, "property-occupancies.service.ts"), "utf8");
  assert.match(source, /createPendingRequest\(/);
  assert.match(source, /sourceType: "property-occupancy"/);
  assert.match(source, /actionId: "property\.occupancy\.force-release\.request"/);
  assert.match(source, /executeApprovedForceRelease/);
  assert.match(source, /biz_property_occupancy_release_audit/);
  assert.doesNotMatch(source, /assertApprovalRequired\(/);
});

test("non-force release preserves the existing low-risk path with its exact action permission", async () => {
  const entity = {
    id: "occupancy-low-risk",
    unitId: "unit-1",
    sourceDomain: "operations",
    status: "active",
    releaseReason: null,
    releasedAt: null,
    updateBy: null
  };
  let accessCalls = 0;
  let saveCalls = 0;
  let advisoryCalls = 0;
  let lockedReads = 0;
  const queryBuilder = {
    leftJoinAndMapOne() {
      return this;
    },
    where() {
      return this;
    },
    andWhere() {
      return this;
    },
    async getOne() {
      return entity;
    }
  };
  const repository = {
    createQueryBuilder: () => queryBuilder,
    save: async (value: unknown) => {
      saveCalls += 1;
      return value;
    }
  };
  const managerRepository = {
    findOne: async (options: { lock?: { mode?: string } }) => {
      if (options.lock?.mode === "pessimistic_write") lockedReads += 1;
      return entity;
    },
    save: repository.save
  };
  const manager = {
    getRepository: () => managerRepository,
    query: async () => {
      advisoryCalls += 1;
      return [];
    }
  };
  const dataSource = {
    transaction: async (callback: (transactionManager: typeof manager) => unknown) => callback(manager)
  };
  const access = {
    assertAccess: async () => {
      accessCalls += 1;
    }
  };
  const service = new PropertyOccupanciesService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    access as never,
    dataSource as never
  );

  const result = await service.release(
    scope,
    { ...principals[0]!, permissions: ["property_occupancy:release"] },
    entity.id,
    { force: false, reason: "normal release" },
    "low-risk-key"
  );

  assert.ok("status" in result);
  assert.equal(result.status, "released");
  assert.equal(result.releaseReason, "normal release");
  assert.equal(accessCalls, 1);
  assert.equal(advisoryCalls, 1);
  assert.equal(lockedReads, 1);
  assert.equal(saveCalls, 1);
});

test("release variants enforce their exact service permissions even behind the any-permission controller guard", async () => {
  const service = new PropertyOccupanciesService(
    { findOne: async () => ({ id: "occupancy", unitId: "unit-1", status: "active", sourceDomain: "operations" }) } as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    {} as never
  );
  await assert.rejects(
    service.release(scope, { ...principals[0]!, permissions: ["property_occupancy:force_release"] }, "occupancy", { force: false, reason: "normal" }, "key"),
    /Property action is forbidden/u
  );
  await assert.rejects(
    service.release(scope, { ...principals[0]!, permissions: ["property_occupancy:force_release"] }, "occupancy", { force: true, reason: "force" }, "key"),
    /Property action is forbidden/u
  );
});
