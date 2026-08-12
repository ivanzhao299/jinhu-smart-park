import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "users/page.tsx"), "utf8");

test("user management loads and saves roles through the dedicated contracts", () => {
  assert.match(source, /\/users\/\$\{userId\}\/roles/);
  assert.match(source, /\/users\/role-candidates\?/);
  assert.match(source, /createIdempotencyKey\("user-roles"\)/);
  assert.match(source, /body: \{ roleIds: selectedRoleIds \}/);
  assert.match(source, /hasPermission\(authUser, SYSTEM_PERMISSIONS\.USER_ASSIGN_ROLES\)/);
});

test("user role failures remain visible and recoverable in the open drawer", () => {
  assert.match(source, /用户已创建.*但角色配置失败，请在当前窗口重试/);
  assert.match(source, /setEditingUser\(\{ \.\.\.savedUser, roles: \[\] \}\)/);
  assert.match(source, /drawerError.*role="alert"/s);
});

test("user list has paired desktop and mobile role projections", () => {
  assert.match(source, /className="ds-mobile-record-list"/);
  assert.match(source, /className="ds-mobile-record"/);
  assert.match(source, /className="ds-table-shell"/);
  assert.match(source, /formatRoleNames\(item\.roles\)/);
  assert.match(source, /function formatRoleNames\(roles: unknown\)/);
  assert.match(source, /Array\.isArray\(roles\)/);
});

test("role assignment remains reachable without profile update permission", () => {
  assert.match(source, /const canUpdateUsers = hasPermission\(authUser, SYSTEM_PERMISSIONS\.USER_UPDATE\)/);
  assert.match(source, /async function openRoleEdit\(row: UserRow\)/);
  assert.match(source, /用户资料保持只读，仅替换当前账号的角色绑定/);
  assert.match(source, /canAssignRoles \? <button[^>]+title="配置角色"/);
  assert.match(source, /if \(roleOnlyEditing && editingUser\)/);
});

test("role selection enforces the API maximum before submission", () => {
  assert.match(source, /const MAX_ASSIGNED_ROLES = 50/);
  assert.match(source, /selectionLimitReached = selectedRoleIds\.length >= MAX_ASSIGNED_ROLES && !selected/);
  assert.match(source, /已选择 \{selectedRoleIds\.length\} \/ \{MAX_ASSIGNED_ROLES\} 个角色/);
});
