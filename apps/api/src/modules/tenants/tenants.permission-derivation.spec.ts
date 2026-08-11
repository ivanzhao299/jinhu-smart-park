import assert from "node:assert/strict";
import test from "node:test";
import { TenantsService } from "./tenants.service";

test("runtime module grants derive the current homestay and housing permission families", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "homestay:booking:read" },
    { code: "housing:lease:read" },
    { code: "leasing:contract:read" }
  ] as never;
  assert.deepEqual(derive(["homestay"], permissions), ["homestay:booking:read"]);
  assert.deepEqual(derive(["housing_rental"], permissions), ["housing:lease:read"]);
});

test("the default system module grants tenant administration pages without platform tenant management", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "system" },
    { code: "system:org" },
    { code: "system:org:list" },
    { code: "system:user" },
    { code: "system:user:list" },
    { code: "system:tenant" },
    { code: "system:tenant:list" },
    { code: "system:module" },
    { code: "system:module:list" },
    { code: "park:read" }
  ] as never;

  assert.deepEqual(derive(["system"], permissions), [
    "system",
    "system:org",
    "system:org:list",
    "system:user",
    "system:user:list"
  ]);
});
