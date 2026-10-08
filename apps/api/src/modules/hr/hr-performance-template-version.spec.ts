import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ConflictException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CreateHrPerformanceTemplateVersionDto } from "./dto/hr-performance-review.dto";
import { HrPerformanceReviewService } from "./hr-performance-review.service";

const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE] };
const templateId = randomUUID(), expectedVersionId = randomUUID(), nextVersionId = randomUUID();
const body = (): CreateHrPerformanceTemplateVersionDto => ({ templateCode: "SYN-PERF", templateName: "Synthetic template", versionName: "V2", expectedVersionId, dimensions: [{ code: "work", name: "Work", weight: 1 }], levels: [{ code: "all", name: "All", scoreMin: 0, scoreMax: 100 }] });

function fixture(changed = false) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const query = async (sql: string, args: unknown[]) => {
    calls.push({ sql, args });
    if (sql.includes("FOR UPDATE OF t")) return [{ template_code: "SYN-PERF", template_name: "Synthetic template", status: "published", current_version_no: 1, latest_version_id: changed ? randomUUID() : expectedVersionId }];
    if (sql.startsWith("SELECT id FROM hr_performance_template_version")) return [{ id: changed ? randomUUID() : expectedVersionId }];
    if (sql.includes("max(version_no)")) return [{ maximum: 1 }];
    if (sql.includes("INSERT INTO hr_performance_template_version")) return [{ id: nextVersionId }];
    return [];
  };
  const manager = { query };
  const service = new HrPerformanceReviewService({ query, manager, transaction: async (action: (m: typeof manager) => unknown) => action(manager) } as never, {} as never);
  return { service, calls };
}

test("operation-only template manager appends a scoped draft and preserves prior rows", async () => {
  const { service, calls } = fixture();
  const result = await service.createTemplateVersion(scope, actor, templateId, body());
  assert.equal(result.currentVersionNo, 2);
  assert.equal(result.versionStatus, "draft");
  assert.equal(result.versionId, nextVersionId);
  assert.ok(calls[0]!.sql.includes("FOR UPDATE OF t"));
  assert.deepEqual(calls[0]!.args, [scope.tenantId, scope.parkId, templateId]);
  assert.equal(calls.filter(call => call.sql.includes("INSERT INTO hr_performance_template_dimension")).length, 1);
  assert.equal(calls.filter(call => call.sql.includes("INSERT INTO hr_performance_template_level")).length, 1);
  assert.ok(calls.every(call => !/DELETE|UPDATE hr_performance_template_version|UPDATE hr_performance_review|UPDATE hr_employee|UPDATE hr_payroll/.test(call.sql)));
});

test("missing exact authority or principal scope mismatch fails before SQL", async () => {
  for (const principal of [{ ...actor, permissions: [HR_PERMISSIONS.HR_PERFORMANCE_MANAGE] }, { ...actor, parkId: "foreign" }]) {
    const { service, calls } = fixture();
    await assert.rejects(service.createTemplateVersion(scope, principal, templateId, body()), ForbiddenException);
    assert.equal(calls.length, 0);
  }
});

test("stale version and changed template identity cannot insert children", async () => {
  const stale = fixture(true);
  await assert.rejects(stale.service.createTemplateVersion(scope, actor, templateId, body()), ConflictException);
  assert.equal(stale.calls.length, 2);
  const changedIdentity = fixture();
  await assert.rejects(changedIdentity.service.createTemplateVersion(scope, actor, templateId, { ...body(), templateName: "Changed identity" }), ConflictException);
  assert.equal(changedIdentity.calls.length, 1);
});

test("configuration validation rejects invalid weights and discontinuous levels before transaction", async () => {
  for (const input of [{ ...body(), dimensions: [{ code: "work", name: "Work", weight: 0.5 }] }, { ...body(), levels: [{ code: "all", name: "All", scoreMin: 1, scoreMax: 100 }] }]) {
    const { service, calls } = fixture();
    await assert.rejects(service.createTemplateVersion(scope, actor, templateId, input));
    assert.equal(calls.length, 0);
  }
});

test("actual ValidationPipe keeps inherited nested constraints and expected UUID", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const transform = (value: unknown) => pipe.transform(value, { type: "body", metatype: CreateHrPerformanceTemplateVersionDto });
  assert.equal((await transform(body())).expectedVersionId, expectedVersionId);
  for (const input of [{ ...body(), expectedVersionId: "wrong" }, { ...body(), dimensions: [] }, { ...body(), levels: [{ code: "all", name: "All", scoreMin: -1, scoreMax: 100 }] }, { ...body(), extra: true }, { ...body(), dimensions: [{code:"work",name:"Work",weight:0.12345}] }, { ...body(), levels: [{code:"all",name:"All",scoreMin:0,scoreMax:99.999}] }]) await assert.rejects(transform(input));
});

test("old draft publication is rejected before any update", async () => {
  const queries: string[] = [];
  const query = async (sql: string) => {
    queries.push(sql);
    return sql.includes("SELECT v.*") ? [{ id: expectedVersionId, template_id: templateId, status: "draft", version_no: 1, currentVersionNo: 2 }] : [{ code: "synthetic" }];
  };
  const manager = { query };
  const service = new HrPerformanceReviewService({ transaction: async (action: (m: typeof manager) => unknown) => action(manager) } as never, {} as never);
  await assert.rejects(service.publishTemplate(scope, actor, expectedVersionId), ConflictException);
  assert.ok(queries.every(sql => !sql.startsWith("UPDATE")));
});
