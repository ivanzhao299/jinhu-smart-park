import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException, ValidationPipe } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrFeedback360Service } from "./hr-feedback360.service";
import { CreateHrCompetencyModelVersionDto, CreateHrFeedbackQuestionnaireVersionDto } from "./dto/hr-feedback360.dto";

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

const versionId = "00000000-0000-4000-8000-000000000002";
const modelBody = { modelCode: "SYN-MODEL", modelName: "Synthetic model", versionName: "Next version", scaleMin: 1, scaleMax: 5, dimensions: [{ code: "ACTUAL", name: "Actual dimension", weight: 1, anchors: [{ level: 1, text: "Basic behavior" }, { level: 5, text: "Target behavior" }] }], expectedVersionId: versionId };
const questionnaireBody = { questionnaireCode: "SYN-QUEST", questionnaireName: "Synthetic questionnaire", versionName: "Next version", modelVersionId: versionId, questions: [{ code: "ACTUAL_Q", dimensionCode: "ACTUAL", text: "Actual question", type: "rating" as const, required: true }], expectedVersionId: versionId };

test("new version writes require exact configuration authority and matching scope before a transaction", async () => {
  for (const principal of [{ ...actor, permissions: [HR_PERMISSIONS.HR_FEEDBACK_READ] }, { ...actor, parkId: "foreign" }]) {
    const f = fixture();
    await assert.rejects(f.service.createModelVersion(scope, principal, versionId, modelBody), ForbiddenException);
    await assert.rejects(f.service.createQuestionnaireVersion(scope, principal, versionId, questionnaireBody), ForbiddenException);
    assert.equal(f.isolations.length, 0);
  }
});

test("stale pointers and changed identities cannot insert a new configuration", async () => {
  for (const changedIdentity of [false, true]) {
    const calls: string[] = [];
    const query = async (sql: string) => {
      calls.push(sql);
      return sql.includes("FOR UPDATE") ? [{ model_code: "SYN-MODEL", model_name: changedIdentity ? "Changed" : modelBody.modelName, status: "published", current_version_no: 1 }] : [{ id: "stale-version" }];
    };
    const service = new HrFeedback360Service({ transaction: async (fn: (m: { query: typeof query }) => unknown) => fn({ query }) } as never, {} as never, {} as never);
    await assert.rejects(service.createModelVersion(scope, actor, versionId, modelBody), ConflictException);
    assert.ok(calls.every(sql => !/INSERT|UPDATE hr_competency/.test(sql)));
    assert.equal(calls.length, changedIdentity ? 1 : 2);
  }
});

test("actual ValidationPipe preserves inherited full configuration and optimistic UUID constraints", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const model = (body: unknown) => pipe.transform(body, { type: "body", metatype: CreateHrCompetencyModelVersionDto });
  const questionnaire = (body: unknown) => pipe.transform(body, { type: "body", metatype: CreateHrFeedbackQuestionnaireVersionDto });
  assert.equal((await model(modelBody)).expectedVersionId, versionId);
  assert.equal((await questionnaire(questionnaireBody)).expectedVersionId, versionId);
  for (const body of [{ ...modelBody, expectedVersionId: "wrong" }, { ...modelBody, dimensions: [] }, { ...modelBody, dimensions: [{ ...modelBody.dimensions[0], weight: .12345 }] }, { ...modelBody, extra: true }]) await assert.rejects(model(body));
  for (const body of [{ ...questionnaireBody, expectedVersionId: "wrong" }, { ...questionnaireBody, questions: [] }, { ...questionnaireBody, questions: [{ ...questionnaireBody.questions[0], type: "wrong" }] }, { ...questionnaireBody, questions: [{ ...questionnaireBody.questions[0], required: "true" }] }]) await assert.rejects(questionnaire(body));
});
