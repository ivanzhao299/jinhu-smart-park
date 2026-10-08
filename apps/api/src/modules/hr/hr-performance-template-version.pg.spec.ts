import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPerformanceReviewService } from "./hr-performance-review.service";

test("real PostgreSQL appended drafts, stale concurrency, published children and frozen cycle configuration", { skip: process.env.HR_PERFORMANCE_TEMPLATE_VERSION_PG_REQUIRED !== "1" }, async () => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15485");
  const connection = { type: "postgres" as const, host: "127.0.0.1", port: 15485, username: "postgres" };
  const database = `hr_performance_version_lab_${randomUUID().replaceAll("-", "")}`;
  const admin = new DataSource({ ...connection, database: "postgres" }); let db: DataSource | undefined, created = false;
  try {
    await admin.initialize(); await admin.query(`CREATE DATABASE ${database}`); created = true;
    db = new DataSource({ ...connection, database }); await db.initialize();
    // Minimal prerequisite tables; the actual performance migration and its guards run unmodified.
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.query("CREATE TABLE hr_employee(tenant_id varchar(64),park_id varchar(64),id uuid,PRIMARY KEY(tenant_id,park_id,id));CREATE TABLE hr_performance_plan(id uuid,tenant_id varchar(64),park_id varchar(64));CREATE TABLE hr_performance_item(id uuid);CREATE TABLE sys_org(id uuid,tenant_id varchar(64),park_id varchar(64),status text,is_deleted boolean)");
    await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations/000258_hr_performance_template_planning.sql"), "utf8"));
    const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" };
    const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE, HR_PERMISSIONS.HR_PERFORMANCE_MANAGE] };
    const service = new HrPerformanceReviewService(db, {} as never);
    const config = { templateCode: "SYN-PERF", templateName: "Synthetic template", versionName: "V1", dimensions: [{ code: "work", name: "Work", weight: 1, scoringGuide: { text: "Preserve guide" } }], levels: [{ code: "all", name: "All", scoreMin: 0, scoreMax: 100 }] };
    const first = await service.createTemplate(scope, actor, config), templateId = String(first.id), firstId = String(first.versionId);
    await service.publishTemplate(scope, actor, firstId);
    const firstDetail = await service.templateDetail(scope, actor, templateId);
    const orgId = randomUUID(); await db.query("INSERT INTO sys_org VALUES($1,$2,$3,'enabled',false)", [orgId, scope.tenantId, scope.parkId]);
    const cycle = await service.createCycle(scope, actor, { cycleCode: "SYN-CYCLE", cycleName: "Synthetic cycle", startDate: "2090-01-01", endDate: "2090-12-31", templateVersionId: firstId, applicableOrgIds: [orgId] });
    await db.query("UPDATE hr_performance_review_cycle SET status='self_review' WHERE id=$1", [cycle.id]);
    const frozen = (await db.query("SELECT template_snapshot FROM hr_performance_review_cycle WHERE id=$1", [cycle.id]))[0].template_snapshot;
    const attempts = await Promise.allSettled(["V2-A", "V2-B"].map(versionName => service.createTemplateVersion(scope, actor, templateId, { ...config, versionName, expectedVersionId: firstId })));
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    const rejected = attempts.find(result => result.status === "rejected"); assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictException);
    const second = await service.templateDetail(scope, actor, templateId); assert.equal(second.versionNo, 2); assert.equal(second.status, "draft");
    assert.deepEqual(second.dimensions, firstDetail.dimensions);
    const oldVersion = (await db.query("SELECT status FROM hr_performance_template_version WHERE id=$1", [firstId]))[0]; assert.equal(oldVersion.status, "published");
    assert.deepEqual((await db.query("SELECT template_snapshot FROM hr_performance_review_cycle WHERE id=$1", [cycle.id]))[0].template_snapshot, frozen);
    await assert.rejects(db.query("UPDATE hr_performance_template_dimension SET dimension_name='changed' WHERE template_version_id=$1", [firstId]), /immutable/);
    await assert.rejects(db.query("UPDATE hr_performance_review_cycle SET template_snapshot='{}'::jsonb WHERE id=$1", [cycle.id]), /immutable/);
    const third = await service.createTemplateVersion(scope, actor, templateId, { ...config, versionName: "V3", expectedVersionId: String(second.versionId) });
    await assert.rejects(service.publishTemplate(scope, actor, String(second.versionId)), ConflictException);
    await service.publishTemplate(scope, actor, String(third.versionId));
    assert.equal((await service.templateDetail(scope, actor, templateId)).status, "published");
    const score = (await db.query("SELECT hr_performance_snapshot_score($1::jsonb,$2::jsonb)::text AS score", [frozen, { work: 87.25 }]))[0].score; assert.equal(score, "87.25");
    await assert.rejects(service.templateDetail(scope, { ...actor, parkId: "foreign" }, templateId), ForbiddenException);
  } finally {
    if (db?.isInitialized) await db.destroy();
    if (admin.isInitialized) { if (created) { await admin.query(`DROP DATABASE ${database}`); assert.equal((await admin.query("SELECT count(*)::int total FROM pg_database WHERE datname=$1", [database]))[0].total, 0); } await admin.destroy(); }
  }
});
