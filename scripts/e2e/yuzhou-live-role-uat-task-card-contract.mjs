import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  YuzhouLiveRoleUatTaskCardError,
  validateYuzhouLiveRoleUatTaskCard
} from "../hr-cutover/yuzhou-live-role-uat-task-card-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const taskCard = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/yuzhou-live-role-uat-task-card-v1.json"), "utf8"));

test("the live-role task card freezes all twelve score-90 legacy functions", () => {
  const result = validateYuzhouLiveRoleUatTaskCard(taskCard);
  assert.deepEqual(result.legacyIds, [34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313]);
  assert.deepEqual(result.roleTypes, ["hr_manager", "department_manager", "employee_self_service"]);
  assert.match(result.sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.productionImport, "HOLD");
});

test("unsafe execution, viewport, actor, matrix and evidence drift fail closed", () => {
  const cases = [
    [draft => { draft.productionImport = "GO"; }, "YUZHOU_UAT_TASK_CARD_UNSAFE"],
    [draft => { draft.viewports[1].width = 500; }, "YUZHOU_UAT_TASK_CARD_VIEWPORT_DRIFT"],
    [draft => { draft.actorSeparation.hrMakerAndReviewerMustDiffer = false; }, "YUZHOU_UAT_TASK_CARD_MAKER_CHECKER_MISSING"],
    [draft => { draft.items.pop(); }, "YUZHOU_UAT_TASK_CARD_ITEM_DRIFT"],
    [draft => { draft.items[0].negative = []; }, "YUZHOU_UAT_TASK_CARD_MATRIX_INCOMPLETE"],
    [draft => { draft.items[0].route = "/admin"; }, "YUZHOU_UAT_TASK_CARD_ROUTE_UNSAFE"],
    [draft => { draft.evidenceRequirements.auditChecksPass = false; }, "YUZHOU_UAT_TASK_CARD_EVIDENCE_GATE_WEAKENED"]
  ];
  for (const [mutate, code] of cases) {
    const draft = JSON.parse(JSON.stringify(taskCard));
    mutate(draft);
    assert.throws(
      () => validateYuzhouLiveRoleUatTaskCard(draft),
      error => error instanceof YuzhouLiveRoleUatTaskCardError && error.code === code
    );
  }
});

test("the full-domain technical runner binds separated actors to API and real browser evidence without claiming human signoff", () => {
  const source = readFileSync(resolve(root, "scripts/hr-cutover/run-full-domain-technical-uat.mjs"), "utf8");
  assert.match(source, /_hr_maker/);
  assert.match(source, /_hr_reviewer/);
  assert.match(source, /hrMaker','HR Manager UAT|hrMaker','HR Maker UAT/);
  assert.match(source, /hrReviewer','HR Reviewer UAT/);
  assert.match(source, /runYuzhouWorkReportScenario/);
  assert.match(source, /runYuzhouLiveRoleUatBrowserMatrix/);
  assert.match(source, /buildWebForTarget\(config\)/);
  assert.match(source, /NEXT_PUBLIC_API_TARGET:apiTarget/);
  assert.match(source, /TECHNICAL_UAT_WEB_TARGET_MISMATCH/);
  assert.match(source, /routes\.rewrites\?\.afterFiles/);
  assert.match(source, /browserViewportCells:browserResult\.observedCells/);
  assert.match(source, /humanUat:"HOLD"/);
  assert.match(source, /observedChecks:matrixObservations\.length/);
  assert.doesNotMatch(source, /DELETE FROM sys_user/);
  assert.match(source, /full lifecycle removes the registered database\/container/);
  assert.doesNotMatch(source, /humanUat:"PASS"|productionImport:"GO"/);
});
