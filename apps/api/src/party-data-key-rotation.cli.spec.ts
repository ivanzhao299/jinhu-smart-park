import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("party data rotation CLI uses a minimal module and a real scoped actor", () => {
  const source = readFileSync(resolve(__dirname, "party-data-key-rotation.cli.ts"), "utf8");
  assert.doesNotMatch(source, /AppModule|SECURITY_OPERATOR/u);
  assert.match(source, /class PartyDataKeyRotationCliModule/u);
  assert.match(source, /UsersService\)\.resolveJwtPrincipal/u);
  assert.match(source, /PARTY_IDENTITY_VERIFY/u);
  assert.match(source, /actor\.tenantId !== tenantId \|\| actor\.parkId !== parkId/u);
});
