import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { DataSource } from "typeorm";
import type { AuditService } from "../audit/audit.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";

function fixture() {
  const scope = { tenantId: randomUUID(), parkId: randomUUID() };
  const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: [], permissions: [] };
  let probes = 0;
  const db = { query: async () => { probes++; throw new Error("Unexpected database probe"); },
    transaction: async () => { probes++; throw new Error("Unexpected database transaction"); } } as unknown as DataSource;
  const service = new HrPayrollFormalRuleService(db, {} as AuditService);
  return { scope, actor, service, probes: () => probes };
}

test("rule authority rejects every public read/write before database or audit access", async () => {
  const { scope, actor, service, probes } = fixture();
  const id = randomUUID();
  await assert.rejects(() => service.listSets(scope, actor, { page: 1, pageSize: 20 }), ForbiddenException);
  await assert.rejects(() => service.listVersions(scope, actor, id, { page: 1, pageSize: 20 }), ForbiddenException);
  await assert.rejects(() => service.effective(scope, actor, id, { month: "2026-10" }), ForbiddenException);
  await assert.rejects(() => service.createSet(scope, actor, { ruleCode: "RULE", displayName: "规则" }), ForbiddenException);
  await assert.rejects(() => service.submitVersion(scope, actor, id, { expectedVersion: 1 }), ForbiddenException);
  await assert.rejects(() => service.reviewVersion(scope, actor, id, { expectedVersion: 1, decision: "reject", reason: "未通过" }), ForbiddenException);
  assert.equal(probes(), 0);
});

test("business names and queries reject punctuation, invisible-only text, excess fields and invalid pages", async () => {
  const { scope, actor, service, probes } = fixture();
  actor.permissions = [HR_PERMISSIONS.HR_PAYROLL_MANAGE, HR_PERMISSIONS.HR_PAYROLL_RULE_READ];
  for (const displayName of ["", "123", "---", "\u200B\u2060"]) {
    await assert.rejects(() => service.createSet(scope, actor, { ruleCode: "RULE", displayName }), BadRequestException);
  }
  await assert.rejects(() => service.listSets(scope, actor, { page: 0, pageSize: 20 }), BadRequestException);
  await assert.rejects(() => service.listSets(scope, actor, { page: 1, pageSize: 200 }), BadRequestException);
  await assert.rejects(() => service.listSets(scope, actor, { page: 1, pageSize: 20, injected: true } as never), BadRequestException);
  assert.equal(probes(), 0);
});

test("missing rule definitions, unknown nested roles and whitespace reasons fail before transactions", async () => {
  const { scope, actor, service, probes } = fixture();
  actor.permissions = [HR_PERMISSIONS.HR_PAYROLL_MANAGE];
  const id = randomUUID();
  await assert.rejects(() => service.createVersion(scope, actor, id, { expectedHeadRevision: 0, reason: "规则" } as never), BadRequestException);
  await assert.rejects(() => service.createVersion(scope, actor, id, {
    expectedHeadRevision: 0, reason: "规则", definition: { roundingPolicy: "line_items_half_up", items: [{ code: "工资", role: "unclassified", expression: null }] },
  } as never), BadRequestException);
  await assert.rejects(() => service.updateVersion(scope, actor, id, { expectedVersion: 1, definition: {}, reason: "  " } as never), BadRequestException);
  assert.equal(probes(), 0);
});

test("review requires an explicit valid effective month only for approval", async () => {
  const { scope, actor, service, probes } = fixture();
  actor.permissions = [HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW];
  const id = randomUUID();
  await assert.rejects(() => service.reviewVersion(scope, actor, id, { expectedVersion: 1, decision: "approve", reason: "复核" }), BadRequestException);
  await assert.rejects(() => service.reviewVersion(scope, actor, id, { expectedVersion: 1, decision: "approve", effectiveFrom: "2026-13", reason: "复核" }), BadRequestException);
  await assert.rejects(() => service.reviewVersion(scope, actor, id, { expectedVersion: 1, decision: "reject", effectiveFrom: "2026-10", reason: "复核" }), BadRequestException);
  assert.equal(probes(), 0);
});
