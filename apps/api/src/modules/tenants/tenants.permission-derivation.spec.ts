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
