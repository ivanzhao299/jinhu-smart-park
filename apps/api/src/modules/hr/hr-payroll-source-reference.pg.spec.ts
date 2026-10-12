import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DataSource, type EntityManager } from "typeorm";
import { ConflictException, Module, NotFoundException, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import type { Request } from "express";
import { HR_PERMISSIONS } from "@jinhu/shared";
import type { AuditService } from "../audit/audit.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PermissionGuard } from "../../shared/guards/permission.guard";
import { HrPayrollFormalRuleController } from "./hr-payroll-formal-rule.controller";
import { HrPayrollFormalRuleService } from "./hr-payroll-formal-rule.service";

test("source reference actual catalog SQL and HTTP preserve complete snapshots, authority, scope, conditions and audit", { skip: process.env.HR_PAYROLL_FORMAL_RULE_PG_REQUIRED !== "1" }, async () => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1"); assert.equal(process.env.POSTGRES_PORT, "15490");
  const database = `jinhu_hr_source_lab_${randomUUID().replaceAll("-", "")}`;
  const config = { type: "postgres" as const, host: "127.0.0.1", port: 15490, username: "postgres" };
  const admin = await new DataSource({ ...config, database: "postgres" }).initialize();
  let db: DataSource | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    db = await new DataSource({ ...config, database }).initialize();
    await db.query(`CREATE EXTENSION "uuid-ossp";
      CREATE TABLE hr_employee(id uuid,tenant_id varchar(64),park_id varchar(64));
      CREATE TABLE legacy_record_map(batch_id uuid,target_table text,target_id uuid,is_active boolean);
      CREATE TABLE test_audit(metadata jsonb);`);
    // Entire original catalog migration, not a guessed catalog schema.
    for (const file of ["000248_hr_payroll_legacy_history.sql", "000347_hr_payroll_formal_rules.sql"]) {
      await db.query(readFileSync(resolve(__dirname, "../../../../../database/migrations", file), "utf8"));
    }
    const scope = { tenantId: randomUUID(), parkId: randomUUID() };
    const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic-author", roles: [], permissions: [HR_PERMISSIONS.HR_PAYROLL_RULE_READ, HR_PERMISSIONS.HR_PAYROLL_MANAGE] };
    let failAudit = false;
    const audit = { recordOperationRequired: async (input: { afterJson: unknown }, manager: EntityManager) => {
      assert.ok(manager); if (failAudit) throw new Error("synthetic audit unavailable");
      await manager.query("INSERT INTO test_audit VALUES($1)", [input.afterJson]);
    } } as unknown as AuditService;
    const service = new HrPayrollFormalRuleService(db, audit);
    const makeBook = async (scheme: number, parkId = scope.parkId) => {
      const [{ id }] = await db!.query("INSERT INTO hr_payroll_book(tenant_id,park_id,legacy_scheme,book_name,source_hash) VALUES($1,$2,$3,'合成工资账套',repeat('a',64)) RETURNING id", [scope.tenantId, parkId, scheme]); return id as string;
    };
    const book = await makeBook(1), other = await makeBook(2), foreign = await makeBook(1, randomUUID());
    const rules = await service.createSet(scope, actor, { ruleCode: "SOURCE", displayName: "合成规则", sourceBookId: book });
    const emptyReference = await service.sourceReference(scope, actor, rules.id);
    assert.deepEqual(emptyReference.items, []); assert.deepEqual(emptyReference.formulas, []);
    const independent = await service.createSet(scope, actor, { ruleCode: "NONE", displayName: "独立规则" });
    await assert.rejects(() => service.sourceReference(scope, actor, independent.id), ConflictException);
    await assert.rejects(() => service.sourceReference({ ...scope, parkId: randomUUID() }, actor, rules.id), NotFoundException);
    const addItem = async (bookId: string, code: string, type = "decimal", enabled = true) => {
      const [{ id }] = await db!.query("INSERT INTO hr_payroll_item_definition(tenant_id,park_id,book_id,legacy_item_name,item_code) SELECT tenant_id,park_id,id,$2,$2 FROM hr_payroll_book WHERE id=$1 RETURNING id", [bookId, code]);
      const [{ id: version }] = await db!.query(`INSERT INTO hr_payroll_item_version(tenant_id,park_id,item_definition_id,version_no,display_name,value_type,legacy_item_type,legacy_add_or_sub,item_category,decimal_scale,enabled,source_hash)
        SELECT tenant_id,park_id,id,1,$2,$3::varchar,'原类型','原增减','unclassified',CASE WHEN $3::varchar='decimal' THEN 2 ELSE NULL END,$4,repeat('b',64) FROM hr_payroll_item_definition WHERE id=$1 RETURNING id`, [id, code, type, enabled]);
      return { id: id as string, version: version as string };
    };
    const salary = await addItem(book, "SALARY"), text = await addItem(book, "TEXT", "text"), disabled = await addItem(book, "DISABLED", "decimal", false);
    await addItem(other, "SAME_PARK_OTHER"); await addItem(foreign, "FOREIGN");
    const addVersion = async (version: number) => db!.query(`INSERT INTO hr_payroll_item_version(tenant_id,park_id,item_definition_id,version_no,display_name,value_type,legacy_item_type,legacy_add_or_sub,item_category,decimal_scale,source_hash)
      VALUES($1,$2,$3,$4,'工资备选版','decimal','原类型','原增减','unclassified',2,repeat('c',64)) RETURNING id`, [scope.tenantId, scope.parkId, salary.id, version]);
    await addVersion(2);
    for (const [index, expression, condition, item] of [[1, "[SALARY]*2", null, salary.version], [2, "[SALARY]+1", "旧条件 > 0", salary.version], [3, "select secret", null, salary.version], [4, "[SALARY]", null, null]] as const) {
      await db.query(`INSERT INTO hr_payroll_formula_version(tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,raw_expression,raw_condition,expression_hash)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,repeat('d',64))`, [scope.tenantId, scope.parkId, book, item, index, expression, condition]);
    }
    const reference = await service.sourceReference(scope, actor, rules.id);
    assert.equal(reference.items.length, 4); assert.equal(reference.formulas.length, 4);
    assert.equal(reference.items.filter(item => item.code === "SALARY").length, 2);
    assert.equal(reference.items.find(item => item.id === text.version)?.valueType, "text");
    assert.equal(reference.items.find(item => item.id === disabled.version)?.enabled, false);
    assert.equal(reference.formulas[0]?.reusableSyntax, true);
    assert.equal(reference.formulas[1]?.condition, "旧条件 > 0"); assert.equal(reference.formulas[1]?.syntaxReason, "legacy_condition");
    assert.equal(reference.formulas[2]?.syntaxReason, "unsupported_syntax"); assert.equal(reference.formulas[3]?.itemVersionId, null);
    assert.equal(JSON.stringify(reference).includes("employee"), false);
    assert.equal(JSON.stringify(await db.query("SELECT * FROM test_audit")).includes("SALARY"), false);
    // Insert after count read from a separate connection. The item read must use the old snapshot.
    let injected = false;
    const wrapped = { transaction: async (work: (manager: EntityManager) => Promise<unknown>) => db!.transaction(async manager => {
      const query = manager.query.bind(manager);
      manager.query = (async (sql: string, params?: unknown[]) => {
        const result = await query(sql, params);
        if (!injected && sql.includes("AS missing")) { injected = true; await addVersion(3); }
        return result;
      }) as EntityManager["query"];
      return work(manager);
    }) } as DataSource;
    assert.equal((await new HrPayrollFormalRuleService(wrapped, audit).sourceReference(scope, actor, rules.id)).items.length, 4);
    assert.equal((await service.sourceReference(scope, actor, rules.id)).items.length, 5);
    const [{ count: auditCount }] = await db.query("SELECT count(*)::int FROM test_audit");
    failAudit = true; await assert.rejects(() => service.sourceReference(scope, actor, rules.id), /audit unavailable/); failAudit = false;
    assert.equal((await db.query("SELECT count(*)::int FROM test_audit"))[0].count, auditCount);
    class Fixture {}
    Module({ controllers: [HrPayrollFormalRuleController], providers: [{ provide: HrPayrollFormalRuleService, useValue: service }] })(Fixture);
    const http = await NestFactory.create(Fixture, { logger: false });
    http.use((req: Request & { user?: JwtPrincipal }, _res: unknown, next: () => void) => {
      req.user = req.header("x-fixture-role") === "reader" ? { ...actor, permissions: [HR_PERMISSIONS.HR_PAYROLL_RULE_READ] } : actor; next();
    });
    http.useGlobalGuards(new PermissionGuard(new Reflector()));
    http.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    try {
      await http.listen(0, "127.0.0.1"); const base = `${await http.getUrl()}/hr/payroll/rules`;
      const response = await fetch(`${base}/${rules.id}/source-reference?sourceBookId=${other}`);
      assert.equal(response.status, 200); assert.equal((await response.json()).book.id, book);
      assert.equal((await fetch(`${base}/${randomUUID()}/source-reference`, { headers: { "x-fixture-role": "reader" } })).status, 403);
      assert.equal((await fetch(`${base}/bad-id/source-reference`)).status, 400);
    } finally { await http.close(); }
    // Complete-set limits and missing item versions never return a plausible partial draft.
    await db.query(`INSERT INTO hr_payroll_formula_version(tenant_id,park_id,book_id,legacy_formula_id,version_no,raw_expression,expression_hash)
      VALUES($1,$2,$3,5,1,repeat('x',2097153),repeat('e',64))`, [scope.tenantId, scope.parkId, book]);
    await assert.rejects(() => service.sourceReference(scope, actor, rules.id), /complete-set limit/);
    const otherRule = await service.createSet(scope, actor, { ruleCode: "OTHER", displayName: "完整性规则", sourceBookId: other });
    await db.query("INSERT INTO hr_payroll_item_definition(tenant_id,park_id,book_id,legacy_item_name,item_code) VALUES($1,$2,$3,'MISSING','MISSING')", [scope.tenantId, scope.parkId, other]);
    await assert.rejects(() => service.sourceReference(scope, actor, otherRule.id), /incomplete/);
    const limitBook = await makeBook(3), limitItem = await addItem(limitBook, "LIMIT");
    const limitRule = await service.createSet(scope, actor, { ruleCode: "LIMIT", displayName: "上限规则", sourceBookId: limitBook });
    await db.query(`INSERT INTO hr_payroll_item_version(tenant_id,park_id,item_definition_id,version_no,display_name,value_type,legacy_item_type,legacy_add_or_sub,item_category,decimal_scale,source_hash)
      SELECT $1,$2,$3,n,'合成项目','decimal','原类型','原增减','unclassified',2,repeat('f',64) FROM generate_series(2,2049) n`, [scope.tenantId, scope.parkId, limitItem.id]);
    await assert.rejects(() => service.sourceReference(scope, actor, limitRule.id), /complete-set limit/);
    const formulaBook = await makeBook(4);
    const formulaRule = await service.createSet(scope, actor, { ruleCode: "FORMULAS", displayName: "公式上限规则", sourceBookId: formulaBook });
    await db.query(`INSERT INTO hr_payroll_formula_version(tenant_id,park_id,book_id,legacy_formula_id,version_no,raw_expression,expression_hash)
      SELECT $1,$2,$3,n,1,'1',repeat('a',64) FROM generate_series(100,4196) n`, [scope.tenantId, scope.parkId, formulaBook]);
    await assert.rejects(() => service.sourceReference(scope, actor, formulaRule.id), /complete-set limit/);
  } finally {
    if (db?.isInitialized) await db.destroy();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);
    assert.equal((await admin.query("SELECT datname FROM pg_database WHERE datname=$1", [database])).length, 0);
    await admin.destroy();
  }
});
