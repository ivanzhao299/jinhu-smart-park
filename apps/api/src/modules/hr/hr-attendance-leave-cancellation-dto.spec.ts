import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { CreateHrLeaveCancellationDto, HrLeaveCancellationActionDto, HrLeaveCancellationSourceQueryDto, UpdateHrLeaveCancellationDto } from "./dto/hr-attendance-leave-cancellation.dto";

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const input = { sourceRequestId: "00000000-0000-4000-8000-000000000001", expectedSourceVersion: 1, startAt: "2026-07-01T09:00:00+08:00", endAt: "2026-07-01T11:00:00+08:00", reason: " 提前返岗 " };
const create = (value: unknown) => pipe.transform(value, { type: "body", metatype: CreateHrLeaveCancellationDto });

test("actual validation pipe requires explicit source/version, real minute instants and a trimmed nonblank reason", async () => {
  const value = await create(input) as CreateHrLeaveCancellationDto; assert.equal(value.reason, "提前返岗");
  for (const change of [{ expectedSourceVersion: 0 }, { expectedSourceVersion: 1.1 }, { expectedSourceVersion: "1" }, { sourceRequestId: "foreign" }, { startAt: "2026-02-30T09:00:00+08:00" }, { startAt: "2026-07-01" }, { startAt: "2026-07-01T09:00:01+08:00" }, { startAt: "2026-07-01T09:00:00" }, { reason: " " }, { reason: null }, { status: "approved" }]) await assert.rejects(create({ ...input, ...change }));
});
test("editing cannot retarget an approved source; commands and optional comment reject null or blank", async () => {
  const edit = { expectedVersion: 1, startAt: input.startAt, endAt: input.endAt, reason: "调整时段" };
  await pipe.transform(edit, { type: "body", metatype: UpdateHrLeaveCancellationDto });
  await assert.rejects(pipe.transform({ ...edit, sourceRequestId: input.sourceRequestId }, { type: "body", metatype: UpdateHrLeaveCancellationDto }));
  for (const action of ["submit", "withdraw", "approve", "return"]) await pipe.transform({ expectedVersion: 1, action, comment: "  复核  " }, { type: "body", metatype: HrLeaveCancellationActionDto });
  for (const change of [{ action: "delete" }, { expectedVersion: null }, { comment: null }, { comment: " " }]) await assert.rejects(pipe.transform({ expectedVersion: 1, action: "approve", ...change }, { type: "body", metatype: HrLeaveCancellationActionDto }));
});
test("source paging is bounded and explicit null is not an omitted filter", async () => {
  const query = await pipe.transform({ page: "2", page_size: "100" }, { type: "query", metatype: HrLeaveCancellationSourceQueryDto }) as HrLeaveCancellationSourceQueryDto;
  assert.equal(query.page, 2); assert.equal(query.page_size, 100);
  for (const value of [{ page: null }, { page_size: "101" }, { employee_id: null }, { keyword: null }, { keyword: "x".repeat(101) }]) await assert.rejects(pipe.transform(value, { type: "query", metatype: HrLeaveCancellationSourceQueryDto }));
});
