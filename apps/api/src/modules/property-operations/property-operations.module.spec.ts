import assert from "node:assert/strict";
import test from "node:test";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { PropertyIdentityModule } from "../property-identity/property-identity.module";
import {
  PropertyOperationListController,
  PropertyOperationsController
} from "./property-operations.controller";
import { PropertyOperationsModule } from "./property-operations.module";

function moduleMetadata<T>(moduleType: object, key: string): T[] {
  return (Reflect.getMetadata(key, moduleType) as T[] | undefined) ?? [];
}

test("PropertyOperationsModule composes identity and operation surfaces exactly once", () => {
  const imports = moduleMetadata<unknown>(
    PropertyOperationsModule,
    MODULE_METADATA.IMPORTS
  );
  const controllers = moduleMetadata<unknown>(
    PropertyOperationsModule,
    MODULE_METADATA.CONTROLLERS
  );

  assert.equal(
    imports.filter((entry) => entry === PropertyIdentityModule).length,
    1
  );
  assert.equal(
    controllers.filter((entry) => entry === PropertyOperationsController).length,
    1
  );
  assert.equal(
    controllers.filter((entry) => entry === PropertyOperationListController).length,
    1
  );
});

test("PropertyIdentityModule does not import PropertyOperationsModule back", () => {
  const identityImports = moduleMetadata<unknown>(
    PropertyIdentityModule,
    MODULE_METADATA.IMPORTS
  );

  assert.equal(
    identityImports.filter((entry) => entry === PropertyOperationsModule).length,
    0
  );
});
