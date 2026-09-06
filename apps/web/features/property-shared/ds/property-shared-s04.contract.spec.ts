import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd());

test("stateful page states compose the shared UI empty state", () => {
  const source = readFileSync(resolve(root, "features/property-shared/states/PageState.tsx"), "utf8");
  assert.match(source, /import \{ EmptyState \} from "@jinhu\/ui"/);
  assert.match(source, /<EmptyState action=\{action\} compact description=\{message\} title=\{title\}/);
});

test("identity draft binds dirty and busy state to the shared leave guard", () => {
  const source = readFileSync(resolve(root, "components/property/PropertyControlPlaneClient.tsx"), "utf8");
  assert.match(source, /useDirtyLeaveGuard\(\{ dirty: draftDirty, busy: draftBusy \}\)/);
});

test("global breadcrumb consumes the route-template matcher", () => {
  const source = readFileSync(resolve(root, "components/layout/AppBreadcrumb.tsx"), "utf8");
  assert.match(source, /findBreadcrumbByPath\(pathname, menus\)/);
});

