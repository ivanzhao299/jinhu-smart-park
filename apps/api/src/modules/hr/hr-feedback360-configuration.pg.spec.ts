import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { DataSource } from "typeorm";
import { HrFeedback360Service } from "./hr-feedback360.service";

test("actual 000260 configuration reads preserve all draft/published fields and isolate parks", { skip: process.env.HR_FEEDBACK_CONFIGURATION_PG_REQUIRED !== "1" }, async () => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15486");
  const connection = { type: "postgres" as const, host: "127.0.0.1", port: 15486, username: "postgres" };
  const database = `hr_feedback_config_lab_${randomUUID().replaceAll("-", "")}`;
  const admin = new DataSource({ ...connection, database: "postgres" }); let db: DataSource | undefined, created = false;
  try {
    await admin.initialize(); await admin.query(`CREATE DATABASE ${database}`); created = true;
    db = new DataSource({ ...connection, database }); await db.initialize();
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    // Only prerequisite identities are stubbed; the entire actual migration runs unmodified.
    await db.query("CREATE TABLE sys_user(tenant_id varchar(64),park_id varchar(64),id uuid,PRIMARY KEY(tenant_id,park_id,id));CREATE TABLE hr_employee(tenant_id varchar(64),park_id varchar(64),id uuid,PRIMARY KEY(tenant_id,park_id,id));CREATE TABLE hr_feedback_cycle(tenant_id varchar(64),park_id varchar(64),id uuid,PRIMARY KEY(tenant_id,park_id,id));CREATE TABLE hr_feedback_assignment(tenant_id varchar(64),park_id varchar(64),id uuid,PRIMARY KEY(tenant_id,park_id,id))");
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000260_hr_competency_feedback360.sql"), "utf8"));
    const scope = { tenantId: "synthetic", parkId: "synthetic-park" };
    const actor = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_FEEDBACK_MODEL_MANAGE] };
    const service = new HrFeedback360Service(db, { recordOperationRequired: async () => undefined } as never, {} as never);
    await db.query("INSERT INTO sys_user VALUES($1,$2,$3)", [scope.tenantId, scope.parkId, actor.sub]);
    const dimensions = [{ code: "DELIVERY", name: "实际交付", description: "保留行为描述", weight: .375, anchors: [{ level: 1.25, text: "第一锚点" }, { level: 7.5, text: "第二锚点" }] }, { code: "QUALITY", name: "实际质量", weight: .625, anchors: [{ level: 1.25, text: "基础质量" }, { level: 7.5, text: "目标质量" }] }];
    const first = await service.createModel(scope, actor, { modelCode: "SYN-MODEL", modelName: "配置模型", versionName: "初始版本", scaleMin: 1.25, scaleMax: 7.5, dimensions });
    let configuration = await service.configuration(scope, actor);
    assert.equal(configuration.models.length, 1); assert.equal(configuration.models[0]!.versionStatus, "draft");
    await service.publishModel(scope, actor, String(first.versionId));
    const questions = [{ code: "QUALITY_NOTE", dimensionCode: "QUALITY", text: "实际文字问题", type: "text" as const, required: false }, { code: "DELIVERY_SCORE", dimensionCode: "DELIVERY", text: "实际评分问题", type: "rating" as const, required: true }];
    const questionnaire = await service.createQuestionnaire(scope, actor, { questionnaireCode: "SYN-QUEST", questionnaireName: "配置问卷", versionName: "初始问卷", modelVersionId: String(first.versionId), questions });
    await service.createModel(scope, actor, { modelCode: "SYN-DRAFT", modelName: "待发布模型", versionName: "保留草稿", scaleMin: 1.25, scaleMax: 7.5, dimensions });
    configuration = await service.configuration(scope, actor);
    const model = configuration.models.find(x => x.versionId === first.versionId)!;
    assert.equal(model.versionStatus, "published"); assert.equal(model.scaleMin, "1.25"); assert.equal(model.scaleMax, "7.50");
    assert.deepEqual(model.dimensions, dimensions.map(d => ({ ...d, description: d.description ?? null, weight: d.weight.toFixed(4), anchors: d.anchors.map(a => ({ ...a, level: a.level.toFixed(2) })) })));
    assert.equal(configuration.models.length, 2);
    assert.equal(configuration.questionnaires[0]!.versionStatus, "draft"); assert.equal(configuration.questionnaires[0]!.modelVersionId, first.versionId);
    assert.deepEqual(configuration.questionnaires[0]!.questions, questions);
    await service.publishQuestionnaire(scope, actor, String(questionnaire.versionId));
    assert.equal((await service.configuration(scope, actor)).questionnaires[0]!.versionStatus, "published");
    const foreignScope = { ...scope, parkId: "foreign-park" }, foreign = { ...actor, ...foreignScope, sub: randomUUID() };
    await db.query("INSERT INTO sys_user VALUES($1,$2,$3)", [foreign.tenantId, foreign.parkId, foreign.sub]);
    await service.createModel(foreignScope, foreign, { modelCode: "SYN-MODEL", modelName: "其他园区模型", versionName: "其他版本", scaleMin: 1.25, scaleMax: 7.5, dimensions });
    assert.equal((await service.configuration(scope, actor)).models.length, 2);
    assert.equal((await service.configuration(foreignScope, foreign)).models.length, 1);
    await assert.rejects(service.configuration(scope, foreign));
    await assert.rejects(db.query("UPDATE hr_competency_dimension SET description='changed' WHERE model_version_id=$1", [first.versionId]), /immutable/);
    // Fixture-only appended version demonstrates that the projection does not
    // hide saved versions behind the immutable root's current pointer.
    const nextVersionId = randomUUID(), dimensionId = randomUUID();
    await db.query("INSERT INTO hr_competency_model_version(id,tenant_id,park_id,model_id,version_no,version_name,scale_min,scale_max,create_by) VALUES($1,$2,$3,$4,2,'第二草稿',1.25,7.5,$5)", [nextVersionId, scope.tenantId, scope.parkId, first.id, actor.sub]);
    await db.query("INSERT INTO hr_competency_dimension(id,tenant_id,park_id,model_version_id,dimension_code,dimension_name,description,weight,sort_order) VALUES($1,$2,$3,$4,'FOLLOW_UP','延续维度','新版说明',1,0)", [dimensionId, scope.tenantId, scope.parkId, nextVersionId]);
    await db.query("INSERT INTO hr_competency_behavior_anchor(tenant_id,park_id,dimension_id,level_value,anchor_text,sort_order) VALUES($1,$2,$3,1.25,'新版基础',0),($1,$2,$3,7.5,'新版目标',1)", [scope.tenantId, scope.parkId, dimensionId]);
    const versions = (await service.configuration(scope, actor)).models.filter(x => x.id === first.id);
    assert.deepEqual(versions.map(x => x.versionNo), [2, 1]);
    assert.deepEqual(versions.map(x => x.versionStatus), ["draft", "published"]);
    assert.equal(versions[0]!.currentVersionNo, 1);
    assert.equal((versions[0]!.dimensions as Array<{ description: string }>)[0]!.description, "新版说明");
    await assert.rejects(db.query("UPDATE hr_competency_model SET current_version_no=2 WHERE id=$1", [first.id]), /immutable/);
  } finally {
    if (db?.isInitialized) await db.destroy();
    if (admin.isInitialized) { if (created) { await admin.query(`DROP DATABASE ${database}`); assert.equal((await admin.query("SELECT count(*)::int total FROM pg_database WHERE datname=$1", [database]))[0].total, 0); } await admin.destroy(); }
  }
});
