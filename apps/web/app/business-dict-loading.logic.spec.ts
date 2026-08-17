import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const BUSINESS_APP_DIRS = ["assets", "energy", "iot", "leasing", "workorders", "admin/iot", "admin/video-security"];

function collectPages(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return collectPages(path);
    if (!path.endsWith(".tsx")) return [];
    if (path.endsWith(".logic.spec.tsx")) return [];
    return [path];
  });
}

test("business dictionary dropdowns load by dict_code instead of dict type ids", () => {
  const appRoot = resolve(__dirname);
  const pages = BUSINESS_APP_DIRS.flatMap((directory) => collectPages(join(appRoot, directory)));

  const offenders = pages.flatMap((page) => {
    const source = readFileSync(page, "utf8");
    if (!source.includes("/dict-types?page=1&page_size=100") && !source.includes("dict_type_id=")) {
      return [];
    }
    return [relative(appRoot, page)];
  });

  assert.deepEqual(offenders, []);
});
