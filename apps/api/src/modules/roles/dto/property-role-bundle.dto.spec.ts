import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreatePropertyRoleFromBundlesDto } from "./property-role-bundle.dto";

function candidate(name: string): CreatePropertyRoleFromBundlesDto {
  return plainToInstance(CreatePropertyRoleFromBundlesDto, {
    code: "TEST_ROLE",
    name,
    bundles: [{ code: "property-bundle:test", version: 1, hash: "a".repeat(64) }],
    mode: "merge",
    previewSignature: "b".repeat(64)
  });
}

test("bundle-created role names require a visible Unicode letter", async () => {
  assert.equal((await validate(candidate("财务岗位"))).length, 0);
  assert.ok((await validate(candidate("\u200b"))).some((error) => error.property === "name"));
  assert.ok((await validate(candidate("---"))).some((error) => error.property === "name"));
});
