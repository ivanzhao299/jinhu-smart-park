import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { EntityManager } from "typeorm";
import { CreateHrLeaveQuotaDto, PutHrLeaveQuotaDto, PutHrLeaveTypeDto } from "./dto/hr-attendance-leave-ledger.dto";
import { CreateHrAttendanceRequestDto } from "./dto/hr.dto";
import { resolveLeaveTypeSelection } from "./hr-attendance-leave-type-selection";

const scope = { tenantId: "10000001", parkId: "20000001" }, id = "00000000-0000-4000-8000-00000000ac01";
const options = { whitelist: true, forbidNonWhitelisted: true };
test("type and quota DTOs require explicit integer quantities, valid dates, version and business labels", () => {
 const type = { expectedVersion: 0, typeName: "年假", enabled: true, reason: "业务核对" };
 assert.equal(validateSync(plainToInstance(PutHrLeaveTypeDto, type), options).length, 0);
 for (const name of ["", "  ", "123", "!", "\u200b", "\u3164"]) assert.ok(validateSync(plainToInstance(PutHrLeaveTypeDto, { ...type, typeName: name }), options).length);
 const quota = { employeeId: id, leaveTypeId: id, periodStart: "2026-07-01", periodEnd: "2026-08-01", openingMinutes: 0, adjustmentMinutes: -60, reason: "明确期初" };
 assert.equal(validateSync(plainToInstance(CreateHrLeaveQuotaDto, quota), options).length, 0);
 for (const patch of [{ openingMinutes: null }, { openingMinutes: -1 }, { adjustmentMinutes: 0.5 }, { periodStart: "2026-02-30" }, { employeeId: "foreign" }, { reason: " " }, { accrueAutomatically: true }]) {
  assert.ok(validateSync(plainToInstance(CreateHrLeaveQuotaDto, { ...quota, ...patch }), options).length);
 }
 assert.ok(validateSync(plainToInstance(PutHrLeaveQuotaDto, { expectedVersion: 0, openingMinutes: 0, adjustmentMinutes: 0, reason: "调整" }), options).length);
});
test("request DTO accepts omitted or explicit empty classification but rejects malformed identity/version", () => {
 const request = { requestType: "leave", startAt: "2026-07-01T09:00:00+08:00", endAt: "2026-07-01T10:00:00+08:00", reason: "请假核对" };
 for (const patch of [{}, { leaveTypeId: null }, { leaveTypeId: id, expectedLeaveTypeVersion: 1 }]) assert.equal(validateSync(plainToInstance(CreateHrAttendanceRequestDto, { ...request, ...patch }), options).length, 0);
 for (const patch of [{ leaveTypeId: "invalid" }, { expectedLeaveTypeVersion: 0 }, { expectedLeaveTypeVersion: "1" }, { expectedLeaveTypeVersion: null }]) assert.ok(validateSync(plainToInstance(CreateHrAttendanceRequestDto, { ...request, ...patch }), options).length);
});
test("omitted selection preserves frozen choice and explicit clear requires a leave request", async () => {
 const db = { query: async () => { throw new Error("Unexpected query"); } } as unknown as EntityManager;
 const frozen = { leaveTypeId: id, leaveTypeVersion: 1, leaveTypeName: "原名称" };
 assert.deepEqual(await resolveLeaveTypeSelection(db, scope, { requestType: "leave" }, frozen), frozen);
 assert.deepEqual(await resolveLeaveTypeSelection(db, scope, { requestType: "leave", leaveTypeId: null }, frozen), { leaveTypeId: null, leaveTypeVersion: null, leaveTypeName: null });
 await assert.rejects(resolveLeaveTypeSelection(db, scope, { requestType: "overtime", leaveTypeId: id, expectedLeaveTypeVersion: 1 }), /仅请假/);
 await assert.rejects(resolveLeaveTypeSelection(db, scope, { requestType: "leave", expectedLeaveTypeVersion: 1 }), /同时/);
 await assert.rejects(resolveLeaveTypeSelection(db, scope, { requestType: "leave", leaveTypeId: null, expectedLeaveTypeVersion: 1 }), /清除/);
});
test("new selection requires enabled current scoped version and preserves source name", async () => {
 let row = { id, name: "年假", version: 2, enabled: true }, calls = 0;
 const db = { query: async (_sql: string, values: unknown[]) => { calls++; assert.deepEqual(values, [scope.tenantId, scope.parkId, id]); return [row]; } } as unknown as EntityManager;
 assert.deepEqual(await resolveLeaveTypeSelection(db, scope, { requestType: "leave", leaveTypeId: id, expectedLeaveTypeVersion: 2 }), { leaveTypeId: id, leaveTypeVersion: 2, leaveTypeName: "年假" });
 row = { ...row, enabled: false };
 await assert.rejects(resolveLeaveTypeSelection(db, scope, { requestType: "leave", leaveTypeId: id, expectedLeaveTypeVersion: 2 }), /停用/);
 row = { ...row, enabled: true };
 await assert.rejects(resolveLeaveTypeSelection(db, scope, { requestType: "leave", leaveTypeId: id, expectedLeaveTypeVersion: 1 }), /变更/);
 await assert.rejects(resolveLeaveTypeSelection(db, scope, { requestType: "leave", leaveTypeId: id }), /明确/);
 assert.equal(calls, 3);
});
