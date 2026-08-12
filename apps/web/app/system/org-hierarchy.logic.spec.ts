import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "orgs/page.tsx"), "utf8");
const usersSource = readFileSync(resolve(__dirname, "users/page.tsx"), "utf8");

test("organization page consumes the tree contract and maintains parent and leader fields", () => {
  assert.match(source, /\/orgs\/tree/);
  assert.match(source, /parentId: form\.parentId \|\| null/);
  assert.match(source, /leaderUserId: form\.leaderUserId \|\| null/);
  assert.match(source, /collectDescendantIds/);
});

test("organization page exposes desktop and mobile hierarchy records", () => {
  assert.match(source, /ds-table-shell/);
  assert.match(source, /ds-mobile-record-list/);
  assert.match(source, /删除组织/);
  assert.match(source, /role="alert"/);
  assert.match(source, /上级组织不可见/);
  assert.match(source, /负责人不可用/);
  assert.equal(source.includes('const treeResponse = await apiRequest<OrgRow[]>("/orgs/tree"'), true);
  assert.equal(source.includes('apiRequest<LeaderOption[]>("/orgs/leaders", { token }).catch(() => null)'), true);
  assert.match(source, /label="排序"/);
  assert.match(source, /label="数据租户"/);
  assert.match(source, /label="园区范围"/);
  assert.match(source, /label="创建时间"/);
  assert.match(source, /label="更新时间"/);
  assert.match(source, /label="备注"/);
});

test("user page creates organization assignments atomically and guards stale catalogs", () => {
  assert.match(usersSource, /assignments: orgAssignments\.map/);
  assert.match(usersSource, /assignmentsChanged \? \{ assignments: body\.assignments \} : \{\}/);
  assert.doesNotMatch(usersSource, /apiRequest<UserOrgAssignment\[\]>\(`\/users\/\$\{editingUser\.id\}\/orgs/);
  assert.match(usersSource, /const orgCatalogRequest = useRef\(0\)/);
  assert.match(usersSource, /if \(requestId !== orgCatalogRequest\.current\) return/);
  assert.match(usersSource, /\/users\/org-candidates\?\$\{params\.toString\(\)\}/);
  assert.match(usersSource, /await loadLoginSettings\(row\.tenantId, row\);\s*if \(requestId !== orgCatalogRequest\.current\) return;/);
  assert.match(usersSource, /catch \(error\) \{\s*if \(requestId === orgCatalogRequest\.current\) setOrgCatalogLoading\(false\);\s*throw error;/);
  assert.match(usersSource, /const \[orgCatalogLoading, setOrgCatalogLoading\] = useState\(false\)/);
  assert.match(usersSource, /disabled=\{roleCatalogLoading \|\| \(!roleOnlyEditing && \(loginSettingsLoading \|\| orgCatalogLoading \|\| !formParkId\)\)\}/);
  assert.match(usersSource, /function closeUserDrawer\(\)[\s\S]*clearOrgCatalog\(\)/);
  assert.match(usersSource, /mergeRetainedOrgOptions/);
  assert.match(usersSource, /knownIds\.add\(assignment\.orgId\)/);
  assert.match(usersSource, /knownIds\.add\(assignment\.postId\)/);
  assert.match(usersSource, /用户更新成功/);
  assert.match(usersSource, /但列表刷新失败/);
  assert.match(usersSource, /sameOrgAssignments\(body\.assignments, loadedOrgAssignments\)/);
  assert.match(usersSource, /添加组织关系/);
  assert.match(usersSource, /name="primaryOrg"/);
  assert.match(usersSource, /无主组织/);
  assert.match(usersSource, /isPrimary: false/);
  assert.match(usersSource, /role="alert"/);
  assert.match(usersSource, /catch\(\(error: Error\) => setDrawerError\(error\.message\)\)/);
});

test("organization editor preserves unavailable current leaders on unrelated updates", () => {
  assert.match(source, /当前负责人（已停用或不可选）/);
  assert.match(source, /form\.leaderUserId === \(editingOrg\.leaderUserId \?\? ""\) \? \{\} : \{ leaderUserId:/);
});

test("organization editor preserves an unavailable parent without resubmitting it", () => {
  assert.match(source, /当前上级（不可见或不可选）/);
  assert.match(source, /form\.parentId !== \(editingOrg\.parentId \?\? ""\) \? \{ parentId:/);
});
