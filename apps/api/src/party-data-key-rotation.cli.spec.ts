import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PartyDataRotationActorResolver } from "./party-data-key-rotation.cli";

test("party data rotation CLI uses a minimal module and a real scoped actor", () => {
  const source = readFileSync(resolve(__dirname, "party-data-key-rotation.cli.ts"), "utf8");
  assert.doesNotMatch(source, /AppModule|SECURITY_OPERATOR/u);
  assert.doesNotMatch(source, /UsersModule|UsersService|PropertyApproval/u);
  assert.match(source, /class PartyDataKeyRotationCliModule/u);
  assert.match(source, /class PartyDataRotationActorResolver/u);
  assert.match(source, /PartyDataRotationActorResolver\)\.resolve/u);
  assert.match(source, /PARTY_IDENTITY_VERIFY/u);
  assert.match(source, /actor\.tenantId !== tenantId \|\| actor\.parkId !== parkId/u);
});

test("party data rotation actor resolver returns only scoped database identity and permissions", async () => {
  let receivedParams: unknown[] | undefined;
  const resolver = new PartyDataRotationActorResolver({
    query: async (_sql: string, params: unknown[]) => {
      receivedParams = params;
      return [{
        user_id: "00000000-0000-4000-8000-000000000010",
        username: "security-operator",
        real_name: "Security Operator",
        tenant_id: "tenant-1",
        auth_version: 7,
        is_tenant_super: false,
        role_code: "IDENTITY_REVIEWER",
        role_is_super: false,
        permission_code: "party:identity_verify"
      }];
    }
  } as never);
  const actor = await resolver.resolve(
    "tenant-1", "park-1", "00000000-0000-4000-8000-000000000010"
  );
  assert.deepEqual(receivedParams, [
    "00000000-0000-4000-8000-000000000010", "tenant-1", "park-1"
  ]);
  assert.deepEqual(actor.roles, ["IDENTITY_REVIEWER"]);
  assert.deepEqual(actor.permissions, ["party:identity_verify"]);
  assert.equal(actor.authVersion, 7);
});

test("party data rotation actor resolver fails closed when scope has no enabled actor", async () => {
  const resolver = new PartyDataRotationActorResolver({ query: async () => [] } as never);
  await assert.rejects(
    resolver.resolve("tenant-1", "park-1", "00000000-0000-4000-8000-000000000010"),
    /not enabled in the requested tenant and park/u
  );
});
