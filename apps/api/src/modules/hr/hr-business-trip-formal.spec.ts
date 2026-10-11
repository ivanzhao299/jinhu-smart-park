import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { HR_PERMISSIONS as H } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { IdempotencyInterceptor } from "../../shared/interceptors/idempotency.interceptor";
import { AUDIT_LOG_KEY } from "../audit/decorators/audit-log.decorator";
import { AmendHrBusinessTripDeclaredDaysDto } from "./dto/hr.dto";
import { HrController } from "./hr.controller";
import { HrService } from "./hr.service";

test("approved trip amendment uses exact operation permission, replay interceptor and body-free generic audit", () => {
  const handler = HrController.prototype.amendBusinessTripDeclaredDays;
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), [H.HR_ATTENDANCE_OPERATE]);
  assert.ok(Reflect.getMetadata("__interceptors__", handler).some((interceptor: unknown) => interceptor instanceof IdempotencyInterceptor));
  assert.equal(Reflect.getMetadata(AUDIT_LOG_KEY, handler).captureBody, false);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, HrController.prototype.businessTripDeclaredDaysHistory), [H.HR_ATTENDANCE_OPERATE]);
});

test("amendment distinguishes clearing from omission and rejects fractional, negative, overflow and missing reasons", async () => {
  const valid = { declaredDays: null, expectedVersion: 2, reason: " synthetic " };
  assert.equal((await validate(plainToInstance(AmendHrBusinessTripDeclaredDaysDto, valid))).length, 0);
  assert.equal((await validate(plainToInstance(AmendHrBusinessTripDeclaredDaysDto, { ...valid, declaredDays: 0 }))).length, 0);
  for (const invalid of [
    { ...valid, declaredDays: undefined }, { ...valid, declaredDays: -1 }, { ...valid, declaredDays: 0.5 },
    { ...valid, declaredDays: 2147483648 }, { ...valid, expectedVersion: 0 }, { ...valid, reason: "   " },
  ]) assert.ok((await validate(plainToInstance(AmendHrBusinessTripDeclaredDaysDto, invalid))).length > 0);
});

test("only approved-trip operation projections carry amendment versions; formal null and zero remain distinct", () => {
  const service = Reflect.construct(HrService, Array(32).fill(undefined)) as HrService;
  const project = (service as unknown as { projectAttendanceRequest: (row: Record<string, unknown>, access: string, actor?: string, canEdit?: boolean, canAmend?: boolean) => Record<string, unknown> }).projectAttendanceRequest.bind(service);
  const row = { id: "trip", version: 4, request_type: "business_trip", status: "approved", start_at: null, end_at: null, submitted_at: null, reviewed_at: null, declared_days: 0, legacy_declared_days: -2 };
  assert.equal(project(row, "park").amendVersion, undefined);
  assert.equal(project(row, "park", undefined, false, true).amendVersion, 4);
  assert.equal(project({ ...row, request_type: "leave" }, "park", undefined, false, true).amendVersion, undefined);
  assert.equal(project({ ...row, status: "draft" }, "park", undefined, false, true).amendVersion, undefined);
  assert.equal(project(row, "park").declaredDays, 0);
  assert.equal(project({ ...row, declared_days: null }, "park").declaredDays, null);
});
