import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const issuePages = [
  "inspect-points/page.tsx",
  "inspect-templates/page.tsx",
  "inspect-plans/page.tsx",
  "inspect-tasks/InspectTasksPageClient.tsx",
  "emergency-contacts/page.tsx",
  "emergencies/page.tsx",
  "work-permits/page.tsx"
];

test("safety form dictionaries load directly by code without type pagination", () => {
  for (const pagePath of issuePages) {
    const page = readFileSync(resolve(__dirname, pagePath), "utf8");

    assert.match(page, /loadDictMapByCodes<DictItemRow>\(codes\)/, pagePath);
  }

  const safetySources = readdirSync(__dirname, { recursive: true })
    .filter((path): path is string => typeof path === "string" && path.endsWith(".tsx"));
  for (const sourcePath of safetySources) {
    const source = readFileSync(resolve(__dirname, sourcePath), "utf8");
    assert.doesNotMatch(source, /\/dict-types(?:\?|")/, sourcePath);
  }
});
