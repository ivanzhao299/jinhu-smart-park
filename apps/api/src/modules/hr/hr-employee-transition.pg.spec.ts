import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DataSource } from "typeorm";
import { HrService } from "./hr.service";
import { HrEmployeeEntity, HrEmploymentEventEntity } from "./entities/hr.entities";
import type { HrEmploymentTransitionDto } from "./dto/hr.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

test("formal employee transfer continuity in isolated PostgreSQL", { skip: process.env.HR_EMPLOYEE_TRANSITION_PG_REQUIRED !== "1", timeout: 60_000 }, async t => {
  assert.equal(process.env.POSTGRES_HOST, "127.0.0.1");
  assert.ok([55491, 55497].includes(Number(process.env.POSTGRES_PORT)));
  assert.equal(process.env.POSTGRES_DB, "postgres");
  const schema = `hr_transition_${randomUUID().replaceAll("-", "")}`;
  const db = new DataSource({ type: "postgres", host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT),
    database: "postgres", username: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
    schema, uuidExtension: "pgcrypto", installExtensions: false, entities: [HrEmployeeEntity, HrEmploymentEventEntity] });
  await db.initialize();
  const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" }, actor = { sub: randomUUID() } as JwtPrincipal;
  const organization = randomUUID(), originalManager = randomUUID(), newManager = randomUUID(), foreignManager = randomUUID();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`); await db.synchronize();
    const employees = db.getRepository(HrEmployeeEntity), events = db.getRepository(HrEmploymentEventEntity);
    const service = Object.create(HrService.prototype) as HrService;
    Object.assign(service, { dataSource: db, employees, orgs: { exists: async ({ where }: { where: Record<string, unknown> }) =>
      where.id === organization && where.tenantId === scope.tenantId && where.parkId === scope.parkId && where.status === "enabled" && where.isDeleted === false } });
    const employee = async (status = "active", extra: Partial<HrEmployeeEntity> = {}) => employees.save(employees.create({ id: randomUUID(), ...scope,
      employeeCode: `SYN-${randomUUID()}`, fullName: "Synthetic employee", employmentStatus: status, managerEmployeeId: originalManager,
      primaryOrgId: organization, hireDate: "2020-01-01", ...extra }));
    await employee("active", { id: originalManager, managerEmployeeId: null });
    await employee("active", { id: newManager, managerEmployeeId: null });
    await employee("active", { id: foreignManager, tenantId: "foreign-tenant", managerEmployeeId: null });
    const dto = (extra: Partial<HrEmploymentTransitionDto> = {}): HrEmploymentTransitionDto => ({ action: "transfer", primaryOrgId: organization,
      effectiveDate: "2026-10-04", reason: "Synthetic transfer decision", ...extra });
    await t.test("omitted manager preserves the existing relationship and both event snapshots", async () => {
      const row = await employee(); await service.transitionEmployment(scope, actor, row.id, dto());
      assert.equal((await employees.findOneByOrFail({ id: row.id })).managerEmployeeId, originalManager);
      const event = await events.findOneByOrFail({ employeeId: row.id });
      assert.equal(event.beforeSnapshot.managerEmployeeId, originalManager); assert.equal(event.afterSnapshot.managerEmployeeId, originalManager);
      assert.equal(event.eventType, "transfer"); assert.equal(event.reason, "Synthetic transfer decision");
    });
    await t.test("explicit manager change and explicit null retain their distinct meanings", async () => {
      const row = await employee(); await service.transitionEmployment(scope, actor, row.id, dto({ managerEmployeeId: newManager }));
      assert.equal((await employees.findOneByOrFail({ id: row.id })).managerEmployeeId, newManager);
      await service.transitionEmployment(scope, actor, row.id, dto({ managerEmployeeId: null } as unknown as Partial<HrEmploymentTransitionDto>));
      assert.equal((await employees.findOneByOrFail({ id: row.id })).managerEmployeeId, null);
      assert.equal(await events.countBy({ employeeId: row.id }), 2);
    });
    await t.test("self and foreign-scope new manager references remain rejected atomically", async () => {
      const row = await employee();
      for (const managerEmployeeId of [row.id, foreignManager]) await assert.rejects(service.transitionEmployment(scope, actor, row.id, dto({ managerEmployeeId })));
      assert.equal((await employees.findOneByOrFail({ id: row.id })).managerEmployeeId, originalManager);
      assert.equal(await events.countBy({ employeeId: row.id }), 0);
    });
    await t.test("confirmation, suspension and resume preserve employment relationships", async () => {
      for (const [status, action, target] of [["probation", "confirm_employment", "active"], ["active", "suspend", "suspended"], ["suspended", "resume", "active"]]) {
        const row = await employee(status); await service.transitionEmployment(scope, actor, row.id, dto({ action }));
        const after = await employees.findOneByOrFail({ id: row.id });
        assert.equal(after.employmentStatus, target); assert.equal(after.managerEmployeeId, originalManager); assert.equal(after.primaryOrgId, organization);
      }
    });
    await t.test("an event insertion failure rolls the transfer back", async () => {
      const row = await employee();
      await db.query(`ALTER TABLE "${schema}".hr_employment_event ADD CONSTRAINT synthetic_transition_failure CHECK(employee_id <> '${row.id}'::uuid)`);
      await assert.rejects(service.transitionEmployment(scope, actor, row.id, dto({ managerEmployeeId: newManager })));
      assert.equal((await employees.findOneByOrFail({ id: row.id })).managerEmployeeId, originalManager);
      assert.equal(await events.countBy({ employeeId: row.id }), 0);
    });
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await db.destroy();
  }
});
