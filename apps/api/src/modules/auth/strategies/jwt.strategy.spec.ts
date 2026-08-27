import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
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

test("JWT strategy rejects access tokens issued before a password session-version change",async()=>{
  const claims:JwtSessionClaims={sub:"00000000-0000-0000-0000-000000000001",username:"manager",tenantId:"10000001",parkId:"20000001",authVersion:1};
  const strategy=new JwtStrategy({getOrThrow:()=>"unit-test-secret"} as never,{assertTenantActive:async()=>undefined} as never,{resolveJwtPrincipal:async()=>({...claims,roles:[],permissions:["system:user:me"],authVersion:2})} as never);
  await assert.rejects(strategy.validate(claims),(error:unknown)=>error instanceof UnauthorizedException&&error.message==="Authentication session has been revoked");
});

test("JWT strategy preserves tenant failure precedence while checks run concurrently", async () => {
  const claims: JwtSessionClaims = {
    sub: "00000000-0000-0000-0000-000000000001",
    username: "manager",
    tenantId: "10000001",
    parkId: "20000001"
  };
  const tenantError = new UnauthorizedException("账号所属租户已停用，请联系管理员");
  let principalAttempted = false;
  const strategy = new JwtStrategy(
    { getOrThrow: () => "unit-test-secret" } as never,
    { assertTenantActive: async () => { throw tenantError; } } as never,
    {
      resolveJwtPrincipal: async () => {
        principalAttempted = true;
        throw new NotFoundException("User not found");
      }
    } as never
  );

  await assert.rejects(strategy.validate(claims), (error) => error === tenantError);
  assert.equal(principalAttempted, true);
});

test("JWT strategy maps a missing live user context to unauthorized", async () => {
  const claims: JwtSessionClaims = {
    sub: "00000000-0000-0000-0000-000000000001",
    username: "manager",
    tenantId: "10000001",
    parkId: "20000001"
  };
  const strategy = new JwtStrategy(
    { getOrThrow: () => "unit-test-secret" } as never,
    { assertTenantActive: async () => undefined } as never,
    { resolveJwtPrincipal: async () => { throw new NotFoundException("User not found"); } } as never
  );

  await assert.rejects(
    strategy.validate(claims),
    (error: unknown) =>
      error instanceof UnauthorizedException &&
      error.message === "Authentication context is no longer available"
  );
});
