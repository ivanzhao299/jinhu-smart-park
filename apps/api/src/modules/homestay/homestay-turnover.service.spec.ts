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
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";

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

test("assigned turnover detail fails closed when the handler scope rejects the assignee", async () => {
  const task = { id: "turnover-1", unitId: "unit-1", status: "pending", assigneeId: "other-handler",
    assigneeName: "Other", bookingId: "booking-1", photoFileIds: [], consumables: [],
    exceptionDescription: null, linkedWorkOrderId: null, createTime: new Date() };
  const builder = { where: () => builder, andWhere: () => builder, getOne: async () => task };
  const service = new HomestayTurnoverService(
    { createQueryBuilder: () => builder } as never, {} as never, {} as never, {} as never,
    { allowedUnitIds: async () => null } as never, {} as never,
    { assertAssignedTurnoverAccess: async () => { throw new Error("handler scope rejected"); } } as never
  );

  await assert.rejects(service.getTurnover(scope, actor, task.id), /handler scope rejected/);
});

test("turnover mutation rejects an unauthorized or terminal linked work order inside the transaction", async () => {
  const task = { id: "turnover-1", unitId: "unit-1", occupancyId: null, status: "cleaning",
    assigneeId: null, assigneeName: null, photoFileIds: [], consumables: [], linkedWorkOrderId: null,
    exceptionDescription: null, updateBy: null };
  const repository = { findOne: async () => task, save: async () => task };
  const manager = { getRepository: (entity: unknown) => {
    if (entity === HomestayTurnoverTaskEntity) return repository;
    if (entity === WorkOrderEntity) return {};
    throw new Error("Unexpected repository");
  } };
  let candidateCalls = 0;
  const service = new HomestayTurnoverService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    {
      assertAssignedTurnoverAccess: async () => undefined,
      findAuthorizedOpenWorkOrderForTurnover: async () => { candidateCalls += 1; return undefined; }
    } as never
  );

  await assert.rejects(
    service.executeTurnover(scope, actor, task.id, "exception", {
      exception_description: "设备异常", linked_work_order_id: "work-order-terminal"
    }),
    /linked_work_order_id must reference/
  );
  assert.equal(candidateCalls, 1);
});

test("turnover actions preserve an existing linked work order without revalidating its later lifecycle state", async () => {
  const task = { id: "turnover-1", unitId: "unit-1", occupancyId: null, status: "cleaning",
    assigneeId: null, assigneeName: null, photoFileIds: [], consumables: [], linkedWorkOrderId: "work-order-1",
    exceptionDescription: null, updateBy: null };
  const repository = { findOne: async () => task, save: async () => task };
  const manager = { getRepository: () => repository };
  let candidateCalls = 0;
  const service = new HomestayTurnoverService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    {
      assertAssignedTurnoverAccess: async () => undefined,
      findAuthorizedOpenWorkOrderForTurnover: async () => { candidateCalls += 1; return undefined; }
    } as never
  );

  await service.executeTurnover(scope, actor, task.id, "exception", {
    exception_description: "工单已完结，继续登记周转异常", linked_work_order_id: "work-order-1"
  });
  assert.equal(candidateCalls, 0);
  assert.equal(task.linkedWorkOrderId, "work-order-1");
});

test("restricted empty handler scope keeps only the unassigned turnover queue", async () => {
  const conditions: string[] = [];
  const builder = {
    where: () => builder,
    andWhere: (condition: string) => { conditions.push(condition); return builder; },
    orderBy: () => builder,
    skip: () => builder,
    take: () => builder,
    getManyAndCount: async () => [[], 0]
  };
  const service = new HomestayTurnoverService(
    { createQueryBuilder: () => builder } as never, {} as never, {} as never, {} as never,
    { allowedUnitIds: async () => null } as never, { query: async () => [] } as never,
    { allowedTurnoverAssigneeIds: async () => [] } as never
  );
  await service.listTurnovers(scope, actor, { status: "open", page: 1, page_size: 20 });
  assert.ok(conditions.includes("task.assignee_id IS NULL"));
  assert.equal(conditions.some((condition) => condition.includes("IN (:...allowedAssigneeIds)")), false);
});

test("assigned turnover mutation stops before any lifecycle mutation when handler scope rejects it", async () => {
  const task = { id: "turnover-1", unitId: "unit-1", occupancyId: null, status: "pending",
    assigneeId: "other-handler", assigneeName: "Other", photoFileIds: [], consumables: [],
    linkedWorkOrderId: null, exceptionDescription: null, updateBy: null };
  const repository = { findOne: async () => task, save: async () => task };
  const manager = { getRepository: () => repository };
  let saves = 0;
  repository.save = async () => { saves += 1; return task; };
  const service = new HomestayTurnoverService(
    {} as never, {} as never, {} as never, {} as never,
    { assertAccess: async () => undefined } as never,
    { transaction: async (run: (value: typeof manager) => unknown) => run(manager) } as never,
    { assertAssignedTurnoverAccess: async () => { throw new Error("handler scope rejected"); } } as never
  );

  await assert.rejects(service.executeTurnover(scope, actor, task.id, "start", {}), /handler scope rejected/);
  assert.equal(task.status, "pending");
  assert.equal(saves, 0);
});
