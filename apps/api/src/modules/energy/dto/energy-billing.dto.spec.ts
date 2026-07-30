import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { EnergyBillingItemQueryDto } from "./energy-billing.dto";

test("energy billing item pagination accepts only bounded integers", async () => {
  const valid = plainToInstance(EnergyBillingItemQueryDto, {
    page: 2,
    page_size: 100
  });
  assert.equal((await validate(valid)).length, 0);

  for (const input of [
    { page: 1.5, page_size: 50 },
    { page: 1, page_size: 1.5 },
    { page: 1, page_size: 101 }
  ]) {
    const errors = await validate(plainToInstance(EnergyBillingItemQueryDto, input));
    assert.ok(
      errors.some((error) => error.property === (input.page === 1.5 ? "page" : "page_size")),
      `expected pagination validation to reject ${JSON.stringify(input)}`
    );
  }
});
