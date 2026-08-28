import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(__dirname, "users/page.tsx"), "utf8");

test("user management loads and saves roles through the dedicated contracts", () => {
  assert.match(source, /\/users\/\$\{userId\}\/roles/);
  assert.match(source, /\/users\/\$\{editingUser\.id\}\/park-roles/);
  assert.match(source, /\/users\/role-candidates\?/);
  assert.match(source, /createIdempotencyKey\("user-roles"\)/);
  assert.match(source, /body: \{ parkId: formParkId, roleIds: selectedRoleIds \}/);
  assert.match(source, /hasPermission\(authUser, SYSTEM_PERMISSIONS\.USER_ASSIGN_ROLES\)/);
  assert.match(source, /paged: "true"/);
  assert.match(source, /ROLE_CANDIDATE_PAGE_SIZE = 50/);
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

test("target-park role assignment remains reachable without profile update permission", () => {
  assert.match(source, /const canUpdateUsers = hasPermission\(authUser, SYSTEM_PERMISSIONS\.USER_UPDATE\)/);
  assert.match(source, /async function openRoleEdit\(row: UserRow, requestedParkId\?: string\)/);
  assert.match(source, /manageableParks\.find\(\(park\) => park\.park_id === currentParkId\)/);
  assert.match(source, /canManageRolesAcrossParks \|\| park\.park_id === authUser\?\.park_id/);
  assert.match(source, /选择目标园区并直接替换该园区的可管理角色/);
  assert.match(source, /canAssignRoles \? <button[^>]+title="配置角色"/);
  assert.match(source, /if \(roleOnlyEditing && editingUser\)/);
});

test("each accessible park exposes its role integrity without hiding access-only state", () => {
  assert.match(source, /function ParkRoleSummaries/);
  assert.match(source, /park\.role_summary/);
  assert.match(source, /可切换但无业务角色/);
  assert.match(source, /summary && !hasRole \? " status-danger" : ""/);
  assert.match(source, /角色状态不可见/);
  assert.match(source, /formatParkRoleSummary\(summary, "可切换但无业务角色"\)/);
  assert.match(source, /aria-label="角色配置目标园区"/);
});

test("role selection enforces the API maximum before submission", () => {
  assert.match(source, /const MAX_ASSIGNED_ROLES = 50/);
  assert.match(source, /selectionLimitReached = selectedRoleIds\.length >= MAX_ASSIGNED_ROLES && !selected/);
  assert.match(source, /已选择 \{selectedRoleIds\.length\} \/ \{MAX_ASSIGNED_ROLES\} 个角色/);
});

test("disabled ordinary roles are removed while protected roles are retained", () => {
  assert.match(source, /const protectedRole = role\.isProtected/);
  assert.match(source, /role\.assignabilityLabel \|\| "当前不可分配"/);
  assert.match(source, /selectedRoleIds\.includes\(role\.id\) \|\| protectedRole/);
  assert.match(source, /候选只展示当前目标租户\/园区内可分配的启用普通角色/);
});

test("empty user and role-candidate states guide template instantiation", () => {
  assert.match(source, /先创建用户，再为用户配置已实例化的普通角色/);
  assert.match(source, /模板角色、系统角色和内置角色不能直接分配给用户/);
  assert.match(source, /请先在角色管理将模板实例化为普通角色/);
  assert.match(source, /href="\/system\/roles"/);
  assert.match(source, /const canReadRoles = hasPermission\(authUser, SYSTEM_PERMISSIONS\.ROLE_READ\)/);
  assert.match(source, /先在角色管理将模板实例化为普通角色，再回到此处选择并保存/);
});

test("role candidates support search and incremental loading without dropping selected labels", () => {
  assert.match(source, /搜索角色名称 \/ 编码/);
  assert.match(source, /async function refreshRoleCandidates/);
  assert.match(source, /initializeSelection: false/);
  assert.match(source, /roleCandidatePage \+ 1/);
  assert.match(source, /roleCandidateAppliedKeyword/);
  assert.match(source, /roleCatalogLoading \|\| roleCandidateKeyword\.trim\(\) !== roleCandidateAppliedKeyword/);
  assert.match(source, /加载更多角色/);
  assert.match(source, /mergeRoleCandidates\(options\.append \? current : retainedSelected, response\.data\.items\)/);
  assert.match(source, /mergeRoleCandidates\(options\.append \? current : retainedSelected, response\.data\.candidates, retained\)/);
  assert.match(source, /可新分配候选共 \{roleCandidateTotal\} 个/);
});

test("role-only saving stays disabled unless the catalog loaded successfully", () => {
  assert.match(source, /const \[roleCatalogReady, setRoleCatalogReady\] = useState\(false\)/);
  assert.match(source, /setRoleCatalogReady\(true\)/);
  assert.match(source, /if \(roleCatalogLoading \|\| !roleCatalogReady\)/);
  assert.match(source, /const requiresRoleCatalog = canAssignRoles && \(!editingUser \|\| roleOnlyEditing\)/);
  assert.match(source, /requiresRoleCatalog && \(roleCatalogLoading \|\| !roleCatalogReady\)/);
  assert.match(source, /disabled=\{\(canAssignRoles && \(!editingUser \|\| roleOnlyEditing\) && !roleCatalogReady\)/);
});
