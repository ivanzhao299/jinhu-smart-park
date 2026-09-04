import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { getMetadataArgsStorage } from "typeorm";
import { CreateOrgDto } from "./dto/create-org.dto";
import { UpdateOrgDto } from "./dto/update-org.dto";
import { OrgEntity } from "./entities/org.entity";

const migration = readFileSync(
  resolve(__dirname, "../../../../../database/migrations/000298_hr_org_company_contact_model.sql"),
  "utf8"
);

test("organization contact DTOs trim values, validate email, and preserve explicit null clears", async () => {
  const create = plainToInstance(CreateOrgDto, {
    orgCode: "ROOT",
    orgName: "集团总部",
    orgType: "company",
    contactPhone: " 010-12345678 ",
    contactAddress: " 园区大道 1 号 ",
    contactEmail: " office@example.com ",
  });
  assert.deepEqual(await validate(create), []);
  assert.equal(create.contactPhone, "010-12345678");
  assert.equal(create.contactAddress, "园区大道 1 号");
  assert.equal(create.contactEmail, "office@example.com");

  const clear = plainToInstance(UpdateOrgDto, {
    contactPhone: null,
    contactAddress: null,
    contactEmail: null,
  });
  assert.deepEqual(await validate(clear), []);
  assert.equal(clear.contactPhone, null);
  assert.equal(clear.contactAddress, null);
  assert.equal(clear.contactEmail, null);

  const invalid = plainToInstance(UpdateOrgDto, {
    contactAddress: "x".repeat(501),
    contactEmail: "not-an-email",
  });
  const invalidProperties = new Set((await validate(invalid)).map((error) => error.property));
  assert.deepEqual(invalidProperties, new Set(["contactAddress", "contactEmail"]));
});

test("ordinary organization DTOs reject the protected legacy company manager reference", async () => {
  for (const Dto of [CreateOrgDto, UpdateOrgDto]) {
    const input = Dto === CreateOrgDto
      ? { orgCode: "ROOT", orgName: "集团总部", orgType: "company", legacyCompanyManagerReference: "untrusted" }
      : { legacyCompanyManagerReference: "untrusted" };
    const dto = plainToInstance(Dto, input);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(errors.some((error) => error.property === "legacyCompanyManagerReference"));
  }
});

test("entity and migration expose modern contact fields while keeping the legacy reference private", () => {
  const columns = getMetadataArgsStorage().columns.filter((column) => column.target === OrgEntity);
  const byProperty = new Map(columns.map((column) => [column.propertyName, column.options]));
  assert.deepEqual(
    ["contactPhone", "contactAddress", "contactEmail"].map((property) => [property, byProperty.get(property)?.nullable]),
    [["contactPhone", true], ["contactAddress", true], ["contactEmail", true]]
  );
  assert.equal(byProperty.get("contactAddress")?.length, 500);
  assert.equal(byProperty.get("contactEmail")?.length, 254);
  assert.equal(byProperty.get("legacyCompanyManagerReference")?.length, 50);
  assert.equal(byProperty.get("legacyCompanyManagerReference")?.select, false);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS contact_address varchar\(500\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS contact_email varchar\(254\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS legacy_company_manager_reference varchar\(50\)/);
  assert.match(migration, /does not assert a legal or registered address/);
  assert.match(migration, /must not populate leader_user_id without reviewed semantic and identity binding/);
  assert.doesNotMatch(migration, /UPDATE\s+sys_org/iu);
});
