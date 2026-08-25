import assert from "node:assert/strict";
import test from "node:test";
import { SafetyInspectTasksService } from "./safety-inspect-tasks.service";

test("role-based inspection handlers use current-scope user-role links", async () => {
  const joins: Array<[unknown, string, string | undefined]> = [];
  const whereClauses: string[] = [];
  const builder = {
    innerJoin: (target: unknown, alias: string, condition?: string) => {
      joins.push([target, alias, condition]);
      return builder;
    },
    where: (condition: string) => {
      whereClauses.push(condition);
      return builder;
    },
    andWhere: (condition: string) => {
      whereClauses.push(condition);
      return builder;
    },
    orderBy: () => builder,
    getMany: async () => []
  };
  const usersRepository = {
    createQueryBuilder: () => builder
  };
  const service = new SafetyInspectTasksService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    usersRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  const resolvePlanHandlers = (service as unknown as {
    resolvePlanHandlers(
      scope: { tenantId: string; parkId: string },
      plan: { handlerUserIds: string[]; handlerRoleCodes: string[] }
    ): Promise<unknown[]>;
  }).resolvePlanHandlers.bind(service);

  await resolvePlanHandlers(
    { tenantId: "tenant-a", parkId: "park-b" },
    { handlerUserIds: [], handlerRoleCodes: ["TENANT_ADMIN"] }
  );

  assert.match(joins[0]?.[2] ?? "", /"userRole"\."tenant_id" = "user"\."tenant_id"/);
  assert.match(joins[0]?.[2] ?? "", /"userRole"\."park_id" = "user"\."park_id"/);
  assert.match(joins[1]?.[2] ?? "", /"role"\."role_scope" = 'tenant' OR "role"\."park_id" = "user"\."park_id"/);
  assert.doesNotMatch(joins.map(([, , condition]) => condition).join("\n"), /(?<!")user\.(?:id|tenant_id|park_id)/);
  assert.ok(whereClauses.includes("user.tenant_id = :tenantId"));
  assert.ok(whereClauses.includes("user.park_id = :parkId"));
  assert.ok(whereClauses.includes("user.is_enabled = true"));
  assert.ok(whereClauses.includes("role.is_enabled = true"));
});
