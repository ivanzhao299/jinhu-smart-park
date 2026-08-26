import assert from "node:assert/strict";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrTrainingService } from "./hr-training.service";

const scope = { tenantId: "10000001", parkId: "20000001" };

function actor(permission: string): JwtPrincipal {
  return {
    sub: "30000001",
    username: "training-query-test",
    tenantId: scope.tenantId,
    parkId: scope.parkId,
    roles: [],
    permissions: [permission],
  };
}

test("training plan list binds only SQL parameters used by each access scope", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [];
    },
  } as unknown as DataSource;
  const service = new HrTrainingService(db, {
    recordOperationRequired: async () => undefined,
  } as never);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_READ), {
    page: 1,
    page_size: 20,
  });
  const parkCall = calls[0];
  assert.ok(parkCall);
  assert.equal(parkCall.params.length, 4);
  assert.doesNotMatch(parkCall.sql, /\$5/);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_READ), {
    page: 2,
    page_size: 20,
    status: "in_progress",
  });
  const parkStatusCall = calls[1];
  assert.ok(parkStatusCall);
  assert.deepEqual(parkStatusCall.params, ["10000001", "20000001", 20, 20, "in_progress"]);
  assert.match(parkStatusCall.sql, /p\.status=\$5/);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_SELF_READ), {
    page: 1,
    page_size: 20,
  });
  const selfCall = calls[2];
  assert.ok(selfCall);
  assert.equal(selfCall.params[4], "30000001");
  assert.match(selfCall.sql, /e\.user_id=\$5/);

  await service.listPlans(scope, actor(HR_PERMISSIONS.HR_TRAINING_TEAM_READ), {
    page: 1,
    page_size: 20,
    status: "published",
  });
  const teamStatusCall = calls[3];
  assert.ok(teamStatusCall);
  assert.deepEqual(teamStatusCall.params.slice(4), ["30000001", "published"]);
  assert.match(teamStatusCall.sql, /leader_user_id=\$5/);
  assert.match(teamStatusCall.sql, /p\.status=\$6/);
});
