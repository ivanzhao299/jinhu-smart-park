import assert from "node:assert/strict";
import test from "node:test";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { OrgsController } from "./orgs.controller";

test("leader candidates require organization and user directory permissions", () => {
  const permissions = Reflect.getMetadata(PERMISSIONS_KEY, OrgsController.prototype.leaders) as string[];

  assert.deepEqual(permissions, [SYSTEM_PERMISSIONS.ORG_LIST, SYSTEM_PERMISSIONS.USER_LIST]);
});
