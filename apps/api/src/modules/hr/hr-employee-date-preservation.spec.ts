import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { HrService } from "./hr.service";
import { HrEmployeeEntity, HrEmploymentEventEntity } from "./entities/hr.entities";
import type { UpdateHrEmployeeDto } from "./dto/hr.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" };
const actor = { sub: "00000000-0000-4000-8000-000000000001" } as JwtPrincipal;
const dto = (dates: Partial<UpdateHrEmployeeDto> = {}): UpdateHrEmployeeDto => ({
  expectedVersion: 1, employeeCode: "SYN-DATE", fullName: "Synthetic revised name", employmentStatus: "active", ...dates,
});

function fixture(failAudit = false) {
  let stored: HrEmployeeEntity = Object.assign(new HrEmployeeEntity(), {
    id: "00000000-0000-4000-8000-000000000011", ...scope, isDeleted: false, version: 1,
    employeeCode: "SYN-DATE", fullName: "Synthetic original name", employmentStatus: "active",
    hireDate: "2019-06-01", probationEndDate: "2019-09-01", departureDate: null,
  });
  const events: HrEmploymentEventEntity[] = [];
  const service = Object.create(HrService.prototype) as HrService;
  Object.assign(service, { dataSource: {
    transaction: async (run: (manager: object) => Promise<unknown>) => {
      let pending = Object.assign(new HrEmployeeEntity(), stored);
      const pendingEvents: HrEmploymentEventEntity[] = [];
      const employeeRepo = {
        findOne: async (options: {where: typeof scope & {id: string; isDeleted: boolean}; lock: {mode: string}}) => {
          assert.equal(options.lock.mode, "pessimistic_write");
          return options.where.id === stored.id && options.where.tenantId === stored.tenantId
            && options.where.parkId === stored.parkId && options.where.isDeleted === false ? pending : null;
        },
        save: async (row: HrEmployeeEntity) => { pending = row; return row; },
      };
      const eventRepo = {
        create: (row: HrEmploymentEventEntity) => row,
        save: async (row: HrEmploymentEventEntity) => {
          if (failAudit) throw new Error("synthetic event failure");
          pendingEvents.push(row); return row;
        },
      };
      const result = await run({ getRepository: (entity: unknown) => {
        if (entity === HrEmployeeEntity) return employeeRepo;
        assert.equal(entity, HrEmploymentEventEntity); return eventRepo;
      } });
      stored = pending; events.push(...pendingEvents); return result;
    },
  } });
  return { service, row: () => stored, events, update: (body = dto()) => service.updateEmployee(scope, actor, stored.id, body) };
}

test("updating unrelated employee facts preserves omitted imported service dates", async () => {
  const f = fixture(); await f.update();
  assert.equal(f.row().fullName, "Synthetic revised name");
  assert.equal(f.row().hireDate, "2019-06-01");
  assert.equal(f.row().probationEndDate, "2019-09-01");
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0]!.beforeSnapshot.hireDate, "2019-06-01");
  assert.equal(f.events[0]!.afterSnapshot.hireDate, "2019-06-01");
});

test("an explicit date update changes only the submitted date", async () => {
  const f = fixture(); await f.update(dto({ hireDate: "2020-02-03" }));
  assert.equal(f.row().hireDate, "2020-02-03");
  assert.equal(f.row().probationEndDate, "2019-09-01");
  assert.equal(f.events[0]!.afterSnapshot.hireDate, "2020-02-03");
});

test("an explicit confirmation-related date update preserves the omitted hire date", async () => {
  const f = fixture(); await f.update(dto({ probationEndDate: "2019-10-01" }));
  assert.equal(f.row().hireDate, "2019-06-01");
  assert.equal(f.row().probationEndDate, "2019-10-01");
  assert.equal(f.row().departureDate, null);
});

test("explicit null retains the existing nullable date clearing behavior", async () => {
  const f = fixture();
  // IsOptional permits null in the existing HTTP DTO; its TypeScript type is narrower.
  const body = { ...dto(), hireDate: null, probationEndDate: null } as unknown as UpdateHrEmployeeDto;
  await f.update(body);
  assert.equal(f.row().hireDate, null); assert.equal(f.row().probationEndDate, null);
  assert.equal(f.events[0]!.beforeSnapshot.hireDate, "2019-06-01");
  assert.equal(f.events[0]!.afterSnapshot.hireDate, null);
});

test("date preservation does not bypass employee identity or lifecycle guards", async () => {
  for (const change of [{ employeeCode: "OTHER" }, { employmentStatus: "departed" }, { departureDate: "2025-01-31" }]) {
    const f = fixture(); await assert.rejects(f.update(dto(change)));
    assert.equal(f.row().hireDate, "2019-06-01"); assert.equal(f.row().probationEndDate, "2019-09-01");
    assert.equal(f.events.length, 0);
  }
});

test("event failure prevents the profile and date update from committing", async () => {
  const f = fixture(true); await assert.rejects(f.update(dto({ hireDate: "2020-02-03" })), /synthetic event failure/);
  assert.equal(f.row().fullName, "Synthetic original name"); assert.equal(f.row().hireDate, "2019-06-01");
  assert.equal(f.row().probationEndDate, "2019-09-01"); assert.equal(f.events.length, 0);
});
