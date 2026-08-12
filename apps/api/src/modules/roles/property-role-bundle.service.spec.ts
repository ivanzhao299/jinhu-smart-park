import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { computePropertyRoleBundleDiff } from "./property-role-bundle.service";
import { RolesController } from "./roles.controller";
import { PERMISSIONS_KEY } from "../../shared/decorators/permissions.decorator";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";

const permission = (code: string) => ({ id: `id-${code}`, code, name: code });

test("bundle merge adds missing permissions and preserves every extra permission", () => {
  const result = computePropertyRoleBundleDiff(
    [permission("bundle:a"), permission("bundle:b")],
    [permission("bundle:a"), permission("custom:x")],
    "merge"
  );
  assert.deepEqual(result.add.map((item) => item.code), ["bundle:b"]);
  assert.deepEqual(result.keepExtra.map((item) => item.code), ["custom:x"]);
  assert.deepEqual(result.removeExtra, []);
  assert.deepEqual(result.final.map((item) => item.code), ["bundle:a", "bundle:b", "custom:x"]);
});

test("bundle sync exposes removals and produces the exact bundle set", () => {
  const result = computePropertyRoleBundleDiff(
    [permission("bundle:a")],
    [permission("bundle:a"), permission("custom:x")],
    "sync"
  );
  assert.deepEqual(result.keepExtra, []);
  assert.deepEqual(result.removeExtra.map((item) => item.code), ["custom:x"]);
  assert.deepEqual(result.final.map((item) => item.code), ["bundle:a"]);
});

test("bundle writes require permission and data-scope assignment authority", () => {
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, RolesController.prototype.createFromPropertyBundles), [
    SYSTEM_PERMISSIONS.ROLE_OPEN_CREATE,
    SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS,
    SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE
  ]);
  assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, RolesController.prototype.applyPropertyBundles), [
    SYSTEM_PERMISSIONS.ROLE_OPEN_UPDATE,
    SYSTEM_PERMISSIONS.ROLE_ASSIGN_PERMISSIONS,
    SYSTEM_PERMISSIONS.ROLE_ASSIGN_DATA_SCOPE
  ]);
});

test("bundle apply preserves administrator-authored role remarks", () => {
  const source = readFileSync(resolve(__dirname, "property-role-bundle.service.ts"), "utf8");
  assert.doesNotMatch(source, /role\.remark = "PR262 property permission bundles applied"/);
});

test("bundle preview and apply use the same enabled permission eligibility", () => {
  const source = readFileSync(resolve(__dirname, "property-role-bundle.service.ts"), "utf8");
  assert.match(source, /JOIN sys_permission permission ON permission\.id=link\.permission_id[\s\S]*permission\.status='enabled'[\s\S]*permission\.is_enabled=true/);
});
