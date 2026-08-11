import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./orgs/page.tsx", import.meta.url), "utf8");
const usersSource = readFileSync(new URL("./users/page.tsx", import.meta.url), "utf8");

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
});

test("user page creates organization assignments atomically and guards stale catalogs", () => {
  assert.match(usersSource, /assignments: orgAssignments\.map/);
  assert.match(usersSource, /if \(editingUser\)[\s\S]*\/users\/\$\{editingUser\.id\}\/orgs/);
  assert.match(usersSource, /const orgCatalogRequest = useRef\(0\)/);
  assert.match(usersSource, /if \(requestId !== orgCatalogRequest\.current\) return/);
  assert.match(usersSource, /添加组织关系/);
  assert.match(usersSource, /name="primaryOrg"/);
  assert.match(usersSource, /role="alert"/);
});
