import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdatePartyDto } from "./party.dto";

test("party updates preserve explicit clearing signals", async () => {
  const dto = plainToInstance(UpdatePartyDto, {
    mobile: "",
    email: null,
    identity_number: "   "
  });
  assert.equal(dto.mobile, null);
  assert.equal(dto.email, null);
  assert.equal(dto.identity_number, null);
  assert.deepEqual(await validate(dto), []);
});
