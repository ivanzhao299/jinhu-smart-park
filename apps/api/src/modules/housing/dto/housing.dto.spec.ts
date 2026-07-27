import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { GenerateHousingBillsDto, TransferHousingPurchaseDto } from "./housing.dto";

test("bill generation requires one explicit charge plan", async () => {
  const dto = plainToInstance(GenerateHousingBillsDto, {
    period_start: "2026-07-01",
    period_end: "2026-08-01"
  });
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === "charge_plan_id"));
});

test("purchase transfer requires at least one item id", async () => {
  const dto = plainToInstance(TransferHousingPurchaseDto, {
    lease_id: "11111111-1111-4111-8111-111111111111",
    item_ids: [],
    due_date: "2026-07-25",
    reason: "tenant recharge"
  });
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === "item_ids"));
});
