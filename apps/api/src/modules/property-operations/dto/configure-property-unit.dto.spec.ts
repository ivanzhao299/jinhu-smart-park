import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConfigurePropertyUnitDto } from "./configure-property-unit.dto";

test("property operation configuration requires a non-negative integer version", async () => {
  const valid = plainToInstance(ConfigurePropertyUnitDto, {
    version: 0,
    operating_status: "enabled"
  });
  assert.deepEqual(await validate(valid), []);

  for (const version of [undefined, -1, 1.5, "not-a-number"]) {
    const dto = plainToInstance(ConfigurePropertyUnitDto, {
      version,
      operating_status: "enabled"
    });
    assert.ok((await validate(dto)).some((error) => error.property === "version"));
  }
});

test("property operation configuration distinguishes omitted, mapped, and explicitly cleared asset units", async () => {
  for (const value of [undefined, null, "00000000-0000-4000-8000-000000000001"]) {
    const dto = plainToInstance(ConfigurePropertyUnitDto, {
      version: 1,
      ...(value === undefined ? {} : { asset_unit_id: value }),
      operating_status: "enabled"
    });
    assert.deepEqual(await validate(dto), []);
    assert.equal(dto.asset_unit_id, value);
  }
});
