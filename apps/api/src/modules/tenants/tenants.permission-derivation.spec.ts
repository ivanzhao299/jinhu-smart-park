import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

test("housing rental module preserves compatibility entry permissions", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const filter = (service as unknown as {
    permissionCodesForModules(permissionCodes: string[], moduleCodes: string[]): string[];
  }).permissionCodesForModules.bind(service);

  assert.deepEqual(
    filter(["housing_rental:operations", "housing_rental:*", "homestay:operations"], ["housing_rental"]),
    ["housing_rental:operations", "housing_rental:*"]
  );
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

test("the safety module grants every safety permission family used by its menus and APIs", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const derive = (service as unknown as {
    derivePermissionCodes(moduleCodes: string[], permissions: Array<{ code: string }>): string[];
  }).derivePermissionCodes.bind(service);
  const permissions = [
    { code: "safety" },
    { code: "safety_statistics:read" },
    { code: "safety_inspect_task:my" },
    { code: "safety_hazard:read" },
    { code: "safety_emergency:read" },
    { code: "safety_work_permit:read" },
    { code: "video_alert:create_hazard" },
    { code: "workorder:read" }
  ] as never;

  assert.deepEqual(derive(["safety"], permissions), [
    "safety",
    "safety_statistics:read",
    "safety_inspect_task:my",
    "safety_hazard:read",
    "safety_emergency:read",
    "safety_work_permit:read"
  ]);
});

test("plan module markers cannot grant permissions for a module that is not enabled", () => {
  const service = new TenantsService({} as never, {} as never, {} as never, {} as never);
  const filter = (service as unknown as {
    permissionCodesForModules(permissionCodes: string[], moduleCodes: string[]): string[];
  }).permissionCodesForModules.bind(service);

  assert.deepEqual(
    filter(["module:system", "module:safety", "asset:read", "system:user:*", "module:system"], ["system"]),
    ["module:system", "system:user:*"]
  );
  assert.deepEqual(
    filter(["safety_hazard:read", "asset:read"], ["system", "safety"]),
    ["safety_hazard:read"]
  );
  assert.deepEqual(
    filter(["iot_alert:*", "iot_device:read", "energy_meter:*"], ["system", "iot"]),
    ["iot_alert:*", "iot_device:read"]
  );
});

test("tenant-wide authorization changes converge every tenant park without clearing an omitted default park", () => {
  const source = readFileSync(resolve(__dirname, "tenants.service.ts"), "utf8");

  assert.match(source, /dto\.defaultParkId === undefined\s+\? configuredDefaultParkId/);
  assert.match(source, /getRepository\(ParkEntity\)\.find/);
  assert.match(source, /for \(const park of tenantParks\)/);
  assert.match(source, /parkId: park\.parkId/);
});
