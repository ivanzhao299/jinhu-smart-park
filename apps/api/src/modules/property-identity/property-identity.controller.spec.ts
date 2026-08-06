import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { PROPERTY_BUSINESS_PERMISSIONS } from "@jinhu/shared";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { PropertyIdentityController } from "./property-identity.controller";

const expected = {
  list: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ],
  detail: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_READ],
  create: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE],
  update: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE],
  submit: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE],
  claim: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY],
  reassign: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY],
  decide: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY],
  withdraw: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE],
  audit: [PROPERTY_BUSINESS_PERMISSIONS.IDENTITY_SUBMISSIONS_PAGE, PROPERTY_BUSINESS_PERMISSIONS.PARTY_SENSITIVE_READ, "audit:read"]
} as const;

test("all ten identity handlers have exact page and action permission metadata", () => {
  assert.deepEqual(Reflect.getMetadata(MODULES_KEY, PropertyIdentityController), ["asset"]);
  for (const [method, permissions] of Object.entries(expected)) {
    const handler = PropertyIdentityController.prototype[
      method as keyof PropertyIdentityController
    ];
    assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), permissions);
  }
});

test("identity controller forwards header authority unchanged", async () => {
  const calls: unknown[][] = [];
  const service = new Proxy({}, {
    get: (_target, property) => (...args: unknown[]) => {
      calls.push([property, ...args]);
      return Promise.resolve({ id: "submission-1" });
    }
  });
  const controller = new PropertyIdentityController(service as never);
  await controller.create(
    { tenantId: "tenant-1", parkId: "park-1" },
    { sub: "user-1" } as never,
    "client-key",
    { clientKey: "client-key" } as never
  );
  assert.equal(calls[0]?.[0], "create");
  assert.equal(calls[0]?.[3], "client-key");
  assert.deepEqual(calls[0]?.[4], { clientKey: "client-key" });
});
