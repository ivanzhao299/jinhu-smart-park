import assert from "node:assert/strict";
import test from "node:test";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayService } from "./homestay.service";
import { HomestayTransactionSupportService } from "./homestay-transaction-support.service";
import { HomestayTurnoverService } from "./homestay-turnover.service";
import {
  HomestayRateConfigEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor = { sub: "actor-1", username: "operator", tenantId: "tenant-1", parkId: "park-1",
  roles: [], permissions: [] } as JwtPrincipal;

test("homestay façade delegates the complete turnover read and lifecycle closure", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const turnovers = {
    listTurnovers: async (...args: unknown[]) => { calls.push({ name: "list", args }); return "list"; },
    getTurnover: async (...args: unknown[]) => { calls.push({ name: "detail", args }); return "detail"; },
    executeTurnover: async (...args: unknown[]) => { calls.push({ name: "execute", args }); return "executed"; }
  };
  const service = new HomestayService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never,
    { transaction: async () => { throw new Error("facade storage access"); } } as never,
    undefined, undefined, undefined, undefined, undefined,
    new HomestayTransactionSupportService(), undefined, undefined, undefined, turnovers as never
  );
  const query = { status: "open", page: 1, page_size: 20 } as never;
  const dto = { assignee_id: "actor-2" } as never;

  assert.equal(await service.listTurnovers(scope, actor, query), "list");
  assert.equal(await service.getTurnover(scope, actor, "turnover-1"), "detail");
  assert.equal(await service.executeTurnover(scope, actor, "turnover-1", "start", dto), "executed");
  assert.deepEqual(calls.map((call) => call.name), ["list", "detail", "execute"]);
  assert.deepEqual(calls[0]!.args, [scope, actor, query]);
  assert.deepEqual(calls[2]!.args, [scope, actor, "turnover-1", "start", dto]);
});

test("inspection-required turnover releases occupancy only after terminal inspection", async () => {
  const task = { id: "turnover-1", unitId: "unit-1", occupancyId: "occupancy-1",
    status: "cleaning", completedAt: null, inspectedAt: null, updateBy: null,
    assigneeId: null, assigneeName: null, photoFileIds: [], consumables: [],
    linkedWorkOrderId: null };
  let lockMode: unknown;
  const repository = {
    findOne: async (options: { lock?: unknown }) => { lockMode = options.lock; return task; },
    save: async () => task
  };
  const manager = { getRepository: (entity: unknown) => {
    if (entity === HomestayTurnoverTaskEntity) return repository;
    if (entity === HomestayRateConfigEntity) {
      return { findOne: async () => ({ checkoutRequiresInspection: true }) };
    }
    throw new Error("Unexpected repository");
  } };
  const releases: unknown[][] = [];
  const service = new HomestayTurnoverService(
    {} as never, {} as never, {} as never,
    { releaseInTransaction: async (...args: unknown[]) => { releases.push(args); } } as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never
  );

  const afterComplete = await service.executeTurnover(scope, actor, task.id, "complete", {});
  assert.equal(afterComplete.status, "inspection");
  assert.equal(releases.length, 0);
  const afterInspect = await service.executeTurnover(scope, actor, task.id, "inspect", {});
  assert.equal(afterInspect.status, "completed");
  assert.deepEqual(lockMode, { mode: "pessimistic_write" });
  assert.equal(releases.length, 1);
  assert.deepEqual(releases[0]!.slice(1), [scope, actor, "occupancy-1", "turnover_completed", "completed"]);
});
