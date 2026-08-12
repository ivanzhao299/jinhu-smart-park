import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./roles/page.tsx", import.meta.url), "utf8");

test("role UI exposes server preview and safe merge/sync semantics", () => {
  assert.match(source, /安全合并（保留额外权限）/);
  assert.match(source, /同步为权限包集合（可能删除）/);
  assert.match(source, /\/property-bundles\/preview/);
  assert.match(source, /idempotencyKey: createIdempotencyKey\("role-property-bundle-preview"\)/);
  assert.match(source, /previewBundles\(null, createBundleCodes\)/);
  assert.match(source, /bundles\.length !== codes\.length/);
  assert.match(source, /preview\.requiresRemovalConfirmation/);
  assert.match(source, /confirmRemovals: preview\.requiresRemovalConfirmation/);
  assert.match(source, /最终权限 \{preview\.final\.length\} 项/);
});

test("protected templates and system roles cannot be updated from the bundle panel", () => {
  assert.match(source, /selectedRole\.isTemplate \|\| selectedRole\.isBuiltin \|\| selectedRole\.isSystem/);
  assert.match(source, /模板、系统或内置角色不可从页面更新/);
  assert.match(source, /current_park 角色/);
  assert.match(source, /function PermissionBinding\([\s\S]*protectedRole: boolean/);
  assert.match(source, /function BindingPanel[\s\S]*protectedRole: boolean/);
  assert.match(source, /受保护角色的绑定不可直接修改/);
  assert.match(source, /selectedRole\.roleScope !== "park"/);
  assert.match(source, /hasAllPermissions\(authUser, \[SYSTEM_PERMISSIONS\.ROLE_OPEN_CREATE, SYSTEM_PERMISSIONS\.ROLE_ASSIGN_PERMISSIONS, SYSTEM_PERMISSIONS\.ROLE_ASSIGN_DATA_SCOPE\]\)/);
  assert.match(source, /hasAllPermissions\(authUser, \[SYSTEM_PERMISSIONS\.ROLE_OPEN_UPDATE, SYSTEM_PERMISSIONS\.ROLE_ASSIGN_PERMISSIONS, SYSTEM_PERMISSIONS\.ROLE_ASSIGN_DATA_SCOPE\]\)/);
  assert.match(source, /权限包编码（多个用逗号分隔）/);
  assert.match(source, /previewBundles\(null, createBundleCodes\)/);
});
