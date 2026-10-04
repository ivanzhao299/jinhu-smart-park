import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { UpdateHrFamilyRecordDto } from "./dto/hr-family-record.dto";

const parse = (input: Record<string, unknown>) => plainToInstance(UpdateHrFamilyRecordDto, input);
const invalid = (input: Record<string, unknown>) => validateSync(parse(input), { whitelist: true, forbidNonWhitelisted: true }).length > 0;

test("family patch distinguishes omission, explicit nullable clear and false", () => {
  const omitted = parse({ expectedVersion: 1, workUnit: " synthetic unit " });
  assert.equal(invalid({ expectedVersion: 1, workUnit: " synthetic unit " }), false);
  assert.equal(omitted.workUnit, "synthetic unit");
  assert.equal(omitted.identityNumber, undefined);
  const cleared = parse({ expectedVersion: 1, identityNumber: null, contact: null, birthDate: null, isEmergencyContact: false });
  assert.equal(validateSync(cleared).length, 0);
  assert.equal(cleared.identityNumber, null);
  assert.equal(cleared.isEmergencyContact, false);
  for (const field of ["fullName", "relationship", "isEmergencyContact"])
    assert.equal(invalid({ expectedVersion: 1, [field]: null }), true);
  for (const field of ["fullName", "relationship"])
    assert.equal(invalid({ expectedVersion: 1, [field]: "   " }), true);
});

test("family patch rejects unknown write scope, invalid versions and impossible dates", () => {
  for (const expectedVersion of [undefined, null, 0, -1, 1.5, "1", 2147483647])
    assert.equal(invalid({ expectedVersion }), true);
  for (const birthDate of ["2025-02-29", "2026-04-31", "not-a-date", "2024-02-29T00:00:00Z", "0000-01-01"])
    assert.equal(invalid({ expectedVersion: 1, birthDate }), true);
  assert.equal(invalid({ expectedVersion: 1, birthDate: "2024-02-29" }), false);
  assert.equal(invalid({ expectedVersion: 1, tenantId: "foreign" }), true);
  assert.equal(invalid({ expectedVersion: 1, isEmergencyContact: "false" }), true);
});
