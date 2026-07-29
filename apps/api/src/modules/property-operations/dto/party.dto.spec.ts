import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AddPartyRoleDto, CreatePartyDto, UpdatePartyDto, VerifyPartyDto } from "./party.dto";

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

test("party document type is validated whenever it is supplied", async () => {
  const dto = plainToInstance(CreatePartyDto, {
    party_type: "person",
    display_name: "Guest",
    identity_document_type: "garbage"
  });
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === "identity_document_type"));
});

test("party verification uses a dedicated transition DTO", async () => {
  const update = plainToInstance(UpdatePartyDto, { verification_status: "verified" });
  const updateErrors = await validate(update, { whitelist: true, forbidNonWhitelisted: true });
  assert.ok(updateErrors.some((error) => error.property === "verification_status"));

  const verification = plainToInstance(VerifyPartyDto, { verification_status: "verified" });
  assert.deepEqual(await validate(verification), []);
});

test("identity-only party updates defer format validation to the persisted document type", async () => {
  const dto = plainToInstance(UpdatePartyDto, {
    identity_number: "11010519491231002x"
  });
  assert.deepEqual(await validate(dto), []);
});

test("party roles reject a blank normalized role type", async () => {
  const dto = plainToInstance(AddPartyRoleDto, {
    party_id: "00000000-0000-4000-8000-000000000001",
    role_type: "   "
  });
  const errors = await validate(dto);
  assert.ok(errors.some((error) => error.property === "role_type"));
});
