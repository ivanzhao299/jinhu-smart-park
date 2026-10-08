import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrRewardEmployeeOptionsDto } from "./dto/hr-reward-employee-options.dto";
import { HrRewardsController } from "./hr-rewards.controller";
import { HrRewardsService } from "./hr-rewards.service";

const scope = { tenantId: "tenant-a", parkId: "park-a" };
const actor: JwtPrincipal = { ...scope, sub: "synthetic", username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_REWARD_MANAGE] };
function fixture() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const audits: unknown[] = [];
  const service = new HrRewardsService({ query: async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT count")) return [{ total: 602 }];
    if (sql.includes("FROM hr_employee")) return [{ id: "employee-601", employeeCode: "SYN-601", fullName: "合成人员601", private: "excluded" }];
    return [{ id: "category-1", status: "enabled", name: "合成类别" }];
  } } as never, { recordOperationRequired: async (input: unknown) => { audits.push(input); } } as never);
  return { service, calls, audits };
}

test("manage-only candidates reach employee601 with stable minimal audited projection", async () => {
  const { service, calls, audits } = fixture();
  assert.deepEqual(await service.employeeOptions(scope, actor, { page: 31, page_size: 20 }), {
    items: [{ id: "employee-601", employeeCode: "SYN-601", fullName: "合成人员601" }], total: 602, page: 31, page_size: 20,
  });
  assert.match(calls[0]!.sql, /ORDER BY employee_code,id LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(calls[0]!.params, ["tenant-a", "park-a", 20, 600]);
  assert.match(calls[0]!.sql, /IN\('preboarding','probation','active','suspended'\)/);
  assert.equal((audits[0] as { path: string }).path, "/hr/rewards/employee-options");
  assert.deepEqual((audits[0] as { afterJson: unknown }).afterJson, { fieldGroups: ["identity"], projection: "metadata", itemCount: 1 });
  for (const method of ["employeeOptions", "caseOptions"] as const)
    assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, HrRewardsController.prototype[method]), [HR_PERMISSIONS.HR_REWARD_MANAGE]);
});

test("read-only authority and mismatched tenant or park fail before queries", async () => {
  for (const denied of [{ ...actor, permissions: [] }, { ...actor, permissions: [HR_PERMISSIONS.HR_REWARD_READ] }, { ...actor, permissions: [HR_PERMISSIONS.HR_EMPLOYEE_READ] }, { ...actor, tenantId: "foreign" }, { ...actor, parkId: "foreign" }]) {
    const { service, calls } = fixture();
    await assert.rejects(service.employeeOptions(scope, denied, { page: 1, page_size: 20 }), ForbiddenException);
    await assert.rejects(service.caseOptions(scope, denied), ForbiddenException);
    assert.equal(calls.length, 0);
  }
});

test("literal search is bound and absent from audit metadata", async () => {
  const { service, calls, audits } = fixture();
  await service.employeeOptions(scope, actor, { page: 1, page_size: 20, keyword: " A_%\\ " });
  assert.equal(calls[0]!.params[2], "%A\\_\\%\\\\%");
  assert.ok(!calls[0]!.sql.includes("A_"));
  assert.ok(!JSON.stringify(audits).includes("A_"));
});

test("even empty candidate response requires successful audit", async () => {
  const service = new HrRewardsService({ query: async (sql: string) => sql.startsWith("SELECT count") ? [{ total: 0 }] : [] } as never, { recordOperationRequired: async () => { throw new Error("audit unavailable"); } } as never);
  await assert.rejects(service.employeeOptions(scope, actor, { page: 1, page_size: 20 }), /audit unavailable/);
});

test("case categories load for manage-only without querying employees or changing legacy read", async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.caseOptions(scope, actor), { categories: [{ id: "category-1", status: "enabled", name: "合成类别" }] });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /c.status='enabled'/);
  assert.deepEqual(calls[0]!.params, ["tenant-a", "park-a"]);
  assert.ok(!calls[0]!.sql.includes("hr_employee"));
  assert.deepEqual(await service.categories(scope, actor), []);
});

test("real query pipe preserves inherited defaults and rejects arrays, unknown fields and bounds", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metadata = { type: "query" as const, metatype: HrRewardEmployeeOptionsDto };
  const defaults = await pipe.transform({}, metadata) as HrRewardEmployeeOptionsDto;
  assert.deepEqual([defaults.page, defaults.page_size], [1, 20]);
  for (const query of [{ page: ["1", "2"] }, { page: "2147483648" }, { page: true }, { page: null }, { page: "1e2" }, { page: " " }, { page_size: "101" }, { keyword: ["a"] }, { keyword: "x".repeat(101) }, { extra: "unknown" }])
    await assert.rejects(pipe.transform(query, metadata), BadRequestException);
  const valid = await pipe.transform({ page: "31", page_size: "100", keyword: " SYN-601 " }, metadata) as HrRewardEmployeeOptionsDto;
  assert.deepEqual([valid.page, valid.page_size, valid.keyword], [31, 100, "SYN-601"]);
});
