import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrFeedback360Service } from "./hr-feedback360.service";

const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" };
const actor = { ...scope, sub: "00000000-0000-4000-8000-000000000001", username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE] };
function fixture(failRead = false, failAudit = false) {
  const queries: Array<{ sql: string; args: unknown[] }> = [], audits: unknown[] = [], isolations: string[] = [];
  const models = [{ versionStatus: "draft", dimensions: [{ code: "ACTUAL", description: "Actual guide", weight: "1.0000", anchors: [{ level: "1.25", text: "Anchor" }] }] }];
  const questionnaires = [{ modelVersionId: "version", questions: [{ code: "QUESTION", dimensionCode: "ACTUAL", type: "text", required: false }] }];
  const query = async (sql: string, args: unknown[]) => {
    queries.push({ sql, args });
    if (failRead) throw new Error("synthetic database failure");
    return queries.length === 1 ? models : questionnaires;
  };
  const service = new HrFeedback360Service({ transaction: async (isolation: string, fn: (m: { query: typeof query }) => unknown) => { isolations.push(isolation); return fn({ query }); } } as never,
    { recordOperationRequired: async (input: unknown) => { if (failAudit) throw new Error("synthetic audit failure"); audits.push(input); } } as never, {} as never);
  return { service, models, questionnaires, queries, audits, isolations };
}

test("model-only and ordinary feedback read authority recover complete configuration in one snapshot", async () => {
  for (const permission of [HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE, HR_PERMISSIONS.HR_FEEDBACK_READ]) {
    const f = fixture();
    assert.deepEqual(await f.service.configuration(scope, { ...actor, permissions: [permission] }), { models: f.models, questionnaires: f.questionnaires });
    assert.deepEqual(f.isolations, ["REPEATABLE READ"]);
    assert.equal(f.queries.length, 2);
    assert.ok(f.queries.every(q => JSON.stringify(q.args) === JSON.stringify([scope.tenantId, scope.parkId])));
    assert.ok(f.queries.every(q => !/hr_employee|hr_feedback360_response|hr_feedback360_subject|hr_feedback360_dimension_result|\bINSERT\b|\bUPDATE\b|\bDELETE\b/.test(q.sql)));
    const audit = f.audits[0] as { afterJson: unknown };
    assert.deepEqual(audit.afterJson, { fieldGroups: ["feedback"], projection: "park", itemCount: 2 });
    assert.ok(!JSON.stringify(audit).includes("Actual guide"));
  }
});

test("wrong action permission, scope mismatch and foreign super principal fail before SQL or audit", async () => {
  for (const principal of [{ ...actor, permissions: [] }, { ...actor, permissions: [HR_PERMISSIONS.HR_FEEDBACK_CYCLE_MANAGE] }, { ...actor, permissions: [HR_PERMISSIONS.HR_FEEDBACK_SELF_READ] }, { ...actor, parkId: "foreign" }, { ...actor, tenantId: "foreign", isSuper: true }]) {
    const f = fixture();
    await assert.rejects(f.service.configuration(scope, principal), ForbiddenException);
    assert.equal(f.isolations.length, 0); assert.equal(f.queries.length, 0); assert.equal(f.audits.length, 0);
  }
});

test("failed configuration snapshot cannot return partial data or claim successful read", async () => {
  const f = fixture(true); await assert.rejects(f.service.configuration(scope, actor), /database failure/);
  assert.equal(f.audits.length, 0);
});

test("required read audit failure is propagated", async () => {
  const f = fixture(false, true); await assert.rejects(f.service.configuration(scope, actor), /audit failure/);
});
