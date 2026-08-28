/* global structuredClone */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { validateYuzhouLiveRoleUatTaskCard } from "../hr-cutover/yuzhou-live-role-uat-task-card-lib.mjs";
import { YuzhouLiveRoleUatBrowserMatrixError, validateYuzhouLiveRoleUatBrowserMatrix } from "../hr-cutover/yuzhou-live-role-uat-browser-matrix-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const load = name => JSON.parse(readFileSync(resolve(root, `scripts/hr-cutover/contracts/${name}`), "utf8"));
const taskCard = load("yuzhou-live-role-uat-task-card-v1.json");
const matrix = load("yuzhou-live-role-uat-browser-matrix-v1.json");

test("browser matrix binds every required legacy item-role pair to both exact viewports", () => {
  validateYuzhouLiveRoleUatTaskCard(taskCard);
  const result = validateYuzhouLiveRoleUatBrowserMatrix(matrix, taskCard);
  assert.equal(result.checkCount, 28);
  assert.equal(result.viewportCellCount, 56);
  assert.equal(result.productionImport, "HOLD");
});

test("browser coverage, role, route, masking and assertion drift fail closed", () => {
  const cases = [
    draft => { draft.checks.pop(); },
    draft => { draft.checks[0].actor = "manager"; },
    draft => { draft.checks[0].route = "/dashboard"; },
    draft => { draft.checks[0].masked = true; },
    draft => { draft.checks[0].visibleTexts = []; },
    draft => { draft.checks[0].expectedPath = draft.checks[0].route; },
    draft => { draft.productionImport = "GO"; }
  ];
  for (const mutate of cases) {
    const draft = structuredClone(matrix);
    mutate(draft);
    assert.throws(() => validateYuzhouLiveRoleUatBrowserMatrix(draft, taskCard), error => error instanceof YuzhouLiveRoleUatBrowserMatrixError);
  }
});
