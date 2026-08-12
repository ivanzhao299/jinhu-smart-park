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
});
