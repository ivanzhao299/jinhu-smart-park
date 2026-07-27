import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdatePartyDto, VerifyPartyDto } from "./party.dto";

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

test("party verification uses a dedicated transition DTO", async () => {
  const update = plainToInstance(UpdatePartyDto, { verification_status: "verified" });
  const updateErrors = await validate(update, { whitelist: true, forbidNonWhitelisted: true });
  assert.ok(updateErrors.some((error) => error.property === "verification_status"));

  const verification = plainToInstance(VerifyPartyDto, { verification_status: "verified" });
  assert.deepEqual(await validate(verification), []);
});
