import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateTenantDto } from "./create-tenant.dto";

async function validateParkName(parkName?: string) {
  const dto = plainToInstance(CreateTenantDto, { parkName });
  return (await validate(dto)).filter((error) => error.property === "parkName");
}

test("tenant creation requires a readable initial park name after trimming", async () => {
  assert.equal((await validateParkName()).length, 1);
  assert.equal((await validateParkName(" 11 ")).length, 1);
  assert.equal((await validateParkName("11 12")).length, 1);
  assert.equal((await validateParkName("１１")).length, 1);
  assert.equal((await validateParkName("١١")).length, 1);
  assert.equal((await validateParkName("11.0")).length, 1);
  assert.equal((await validateParkName("---")).length, 1);
  assert.equal((await validateParkName("11\u200B")).length, 1);
  assert.equal((await validateParkName("   ")).length, 1);
});

test("tenant creation accepts readable initial park names that include numbers", async () => {
  assert.deepEqual(await validateParkName(" 11号园区 "), []);
  assert.deepEqual(await validateParkName("Park 11"), []);
});
