import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { PartiesController } from "./parties.controller";

test("legacy party verification requires the exact identity verifier permission", () => {
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, PartiesController.prototype.verify),
    [PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY]
  );
});

test("legacy party controllers forward the request header as canonical clientKey input", async () => {
  const calls: unknown[][] = [];
  const service = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      calls.push([property, ...args]);
      return Promise.resolve({ id: "party-1" });
    }
  });
  const controller = new PartiesController(service as never);
  const scope = { tenantId: "tenant-1", parkId: "park-1" };
  const actor = { sub: "user-1" };

  await controller.create(
    scope,
    actor as never,
    "legacy-create",
    { party_type: "person", display_name: "Party" }
  );
  await controller.update(
    scope,
    actor as never,
    "00000000-0000-4000-8000-000000000010",
    "legacy-update",
    { display_name: "Updated" }
  );
  await controller.verify(
    scope,
    actor as never,
    "00000000-0000-4000-8000-000000000010",
    "legacy-verify",
    { verification_status: "verified" }
  );

  assert.equal(calls.find(([method]) => method === "create")?.[4], "legacy-create");
  assert.equal(calls.find(([method]) => method === "update")?.[5], "legacy-update");
  assert.equal(calls.find(([method]) => method === "verify")?.[5], "legacy-verify");
});
