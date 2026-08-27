import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(dashboard)/[...segments]/page.tsx", "utf8");

test("dashboard catch-all uses the authenticated merged-menu resolution", () => {
  assert.match(source, /useAuthUser\(\)/);
  assert.match(source, /resolveCatchAllRoute\(pathname, resolveUserMenuTree\(user\)\)/);
});

test("dashboard catch-all fails closed through the Next not-found boundary", () => {
  assert.match(source, /if \(resolution\.kind === "not-found"\) notFound\(\)/);
});
