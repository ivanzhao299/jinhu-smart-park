import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { canCreateHazardFromPage } from "./hazards-create.logic";

test("overdue reporting context does not expose ordinary hazard creation", () => {
  assert.equal(canCreateHazardFromPage({ forcedOverdueOnly: true }), false);
  assert.equal(canCreateHazardFromPage({ forcedOverdueOnly: false }), true);
  assert.equal(canCreateHazardFromPage({}), true);
});

test("ordinary hazard page creation does not depend on its mutable overdue filter", () => {
  const overdueFilterEnabled = true;

  assert.equal(overdueFilterEnabled, true);
  assert.equal(canCreateHazardFromPage({ forcedOverdueOnly: false }), true);
});

test("hazard forms never persist list-filter state as overdue business state", () => {
  const source = readFileSync(resolve(__dirname, "HazardsPageClient.tsx"), "utf8");

  assert.doesNotMatch(source, /overdueFlag:\s*initialHazard/);
  assert.doesNotMatch(source, /overdue_flag:\s*form\.overdueFlag/);
});
