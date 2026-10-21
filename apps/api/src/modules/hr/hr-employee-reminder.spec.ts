import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import { HR_PERMISSIONS } from "@jinhu/shared";
import { HrEmployeeReminderService } from "./hr-employee-reminder.service";
import { HrEmployeeReminderController } from "./hr-employee-reminder.controller";
import { HrEmployeeReminderActionDto, HrEmployeeReminderGenerateDto, HrEmployeeReminderQueryDto } from "./dto/hr-employee-reminder.dto";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const scope = { tenantId: "synthetic-tenant", parkId: "synthetic-park" };
const actor: JwtPrincipal = { ...scope, sub: randomUUID(), username: "synthetic", roles: ["CUSTOM_DATE_RUNNER"], permissions: [HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN] };
const options: HrEmployeeReminderGenerateDto = { kind: "birthday", windowDays: 3, leapDayPolicy: "skip", recipients: ["employee"], businessDate: "2026-12-30" };

// Exercises the production candidate algorithm through its public preview boundary.
// Only SQL source retrieval is replaced; no copied date calculation is used.
function calendarService(dates: Array<string | null>) {
  const rows = dates.map(source_date => ({ employee_id: randomUUID(), employee_user_id: randomUUID(), manager_user_id: null, source_date, source_version: 1 }));
  const db = { transaction: async (fn: (m: unknown) => unknown) => fn({ query: async () => rows }), query: async () => [{ n: 0 }] };
  return new HrEmployeeReminderService(db as never, { recordOperationRequired: async () => undefined } as never, {} as never, {} as never);
}

test("employee reminder calendar includes today, next day and inclusive cross-year bound only", async () => {
  const service = calendarService(["1990-12-29", "1990-12-30", "1990-12-31", "1990-01-01", "1990-01-02", "1990-01-03", null]);
  assert.equal((await service.preview(scope, actor, options)).matched, 4);
  assert.equal((await service.preview(scope, actor, { ...options, windowDays: 0 })).matched, 1);
});

test("employee reminder birthdays and hire anniversaries explicitly implement every leap-day policy", async () => {
  for (const kind of ["birthday", "hire_anniversary"] as const) {
    for (const [policy, date, expected] of [
      ["skip", "2027-02-28", 0], ["feb_28", "2027-02-28", 1], ["mar_1", "2027-02-28", 0],
      ["mar_1", "2027-03-01", 1], ["feb_28", "2027-03-01", 0],
      ["skip", "2028-02-29", 1], ["feb_28", "2028-02-29", 1], ["mar_1", "2028-02-29", 1]
    ] as const) {
      assert.equal((await calendarService(["2020-02-29"]).preview(scope, actor, { ...options, kind, windowDays: 0, businessDate: date, leapDayPolicy: policy })).matched, expected, `${kind}/${policy}/${date}`);
    }
  }
});

test("hire anniversary requires a prior hire year and birthdays cannot originate in the future", async () => {
  const d = { ...options, kind: "hire_anniversary" as const, businessDate: "2027-01-01", windowDays: 0 };
  assert.equal((await calendarService(["2026-01-01", "2027-01-01", "2028-01-01"]).preview(scope, actor, d)).matched, 1);
  assert.equal((await calendarService(["2027-12-30"]).preview(scope, actor, options)).matched, 0);
  assert.equal((await calendarService(["2028-02-29"]).preview(scope, actor, { ...d, businessDate: "2029-02-28", leapDayPolicy: "feb_28" })).matched, 1);
});

test("a future leap-day hire cannot generate a next-year anniversary before employment starts", async () => {
  const result = await calendarService(["2028-02-29"]).preview(scope, actor, { ...options, kind: "hire_anniversary", businessDate: "2028-02-28", windowDays: 365, leapDayPolicy: "feb_28" });
  assert.equal(result.matched, 0);
});

test("generation DTO rejects impossible dates, coercion traps and incomplete selection", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const parse = (body: object) => pipe.transform(body, { type: "body", metatype: HrEmployeeReminderGenerateDto });
  assert.equal((await parse(options)).businessDate, options.businessDate);
  for (const patch of [
    { businessDate: "2026-02-30" }, { businessDate: "2026-02-29" }, { businessDate: "not-a-date" }, { businessDate: "2026-1-01" },
    { businessDate: "2026-10-20T00:00:00Z" }, { windowDays: -1 }, { windowDays: 366 }, { windowDays: 1.5 },
    { windowDays: null }, { windowDays: "" }, { windowDays: true }, { kind: "contract_expiry" },
    { leapDayPolicy: undefined }, { leapDayPolicy: "automatic" }, { recipients: [] }, { recipients: ["everyone"] },
    { recipients: ["employee", "employee"] }, { tenantId: "attacker" }
  ]) await assert.rejects(parse({ ...options, ...patch }), `accepted invalid ${JSON.stringify(patch)}`);
  for (const businessDate of ["2028-02-29", "2026-12-31"]) await parse({ ...options, businessDate });
});

test("query and action DTOs reject unbounded pages and invalid actions", async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const body of [{ page: 0 }, { page_size: 101 }, { page_size: 1.5 }, { status: "done" }, { window_days: -1 }]) {
    await assert.rejects(pipe.transform(body, { type: "query", metatype: HrEmployeeReminderQueryDto }));
  }
  for (const body of [{ action: "delete" }, { action: "resolve", comment: "x".repeat(1001) }, { action: "read", actorUserId: randomUUID() }]) {
    await assert.rejects(pipe.transform(body, { type: "body", metatype: HrEmployeeReminderActionDto }));
  }
});

test("controller declares HR-only message and domain gates and real replay interceptors", () => {
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, HrEmployeeReminderController), ["hr"]);
  const prototype = HrEmployeeReminderController.prototype;
  for (const name of ["preview", "generate"] as const) assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, prototype[name]), [HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_RUN]);
  for (const name of ["list", "detail", "messages", "readMessage"] as const) {
    const permissions = Reflect.getMetadata(ANY_PERMISSIONS_KEY, prototype[name]) as string[];
    assert.ok(permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_SELF_READ));
    assert.ok(permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_REMINDER_TEAM_READ));
    assert.ok(permissions.every(value => !value.includes("workorder")));
  }
  for (const name of ["generate", "action", "readMessage"] as const) {
    assert.ok((Reflect.getMetadata(INTERCEPTORS_METADATA, prototype[name]) as unknown[]).some(value => value instanceof IdempotencyInterceptor));
  }
});

test("unauthorized runner is rejected before any source retrieval", async () => {
  let touched = false;
  const service = new HrEmployeeReminderService({ transaction: () => { touched = true; } } as never, {} as never, {} as never, {} as never);
  await assert.rejects(service.preview(scope, { ...actor, permissions: [] }, options), /permission/i);
  await assert.rejects(service.generate(scope, { ...actor, permissions: [] }, options), /permission/i);
  assert.equal(touched, false);
});
