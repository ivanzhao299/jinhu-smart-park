import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { TransferHousingPurchaseDto } from "./housing.dto";

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
