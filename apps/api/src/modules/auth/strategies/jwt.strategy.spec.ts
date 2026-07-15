import assert from "node:assert/strict";
import test from "node:test";
import type { JwtPrincipal, JwtSessionClaims } from "../../../shared/types/jwt-principal";
import { JwtStrategy } from "./jwt.strategy";

test("JWT strategy restores current permissions from the server-side user context", async () => {
  const claims: JwtSessionClaims = {
    sub: "00000000-0000-0000-0000-000000000001",
    username: "manager",
    tenantId: "10000001",
    parkId: "20000001"
  };
  const principal: JwtPrincipal = {
    ...claims,
    realName: "管理人员",
    roles: ["PROPERTY_MANAGER"],
    permissions: ["ENGINEERING_PROJECT_VIEW", "system:user:me"],
    dataScope: "park",
    isSuper: false
  };
  const tenantChecks: string[] = [];
  const userChecks: Array<{ scope: { tenantId: string; parkId: string }; id: string }> = [];
  const strategy = new JwtStrategy(
    { getOrThrow: () => "unit-test-secret" } as never,
    {
      assertTenantActive: async (tenantId: string) => {
        tenantChecks.push(tenantId);
      }
    } as never,
    {
      resolveJwtPrincipal: async (scope: { tenantId: string; parkId: string }, id: string) => {
        userChecks.push({ scope, id });
        return principal;
      }
    } as never
  );

  const result = await strategy.validate(claims);

  assert.deepEqual(result, principal);
  assert.deepEqual(tenantChecks, [claims.tenantId]);
  assert.deepEqual(userChecks, [
    {
      scope: { tenantId: claims.tenantId, parkId: claims.parkId },
      id: claims.sub
    }
  ]);
});
