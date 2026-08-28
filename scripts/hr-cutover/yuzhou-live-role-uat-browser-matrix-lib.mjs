import { createHash } from "node:crypto";

export class YuzhouLiveRoleUatBrowserMatrixError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatBrowserMatrixError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new YuzhouLiveRoleUatBrowserMatrixError(code, detail); };
const canonicalize = value => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
    : value;

export const browserMatrixHash = matrix => createHash("sha256").update(JSON.stringify(canonicalize(matrix))).digest("hex");

export function validateYuzhouLiveRoleUatBrowserMatrix(matrix, taskCard) {
  if (matrix?.formatVersion !== 1 || matrix?.contractKind !== "yuzhou_hr_live_role_uat_browser_matrix") fail("YUZHOU_UAT_BROWSER_MATRIX_INVALID", "identity");
  if (matrix.executionBoundary !== "isolated_lab_only" || matrix.productionImport !== "HOLD") fail("YUZHOU_UAT_BROWSER_MATRIX_UNSAFE", "boundary");
  if (!Array.isArray(matrix.checks)) fail("YUZHOU_UAT_BROWSER_MATRIX_INVALID", "checks");
  const expected = taskCard.items.flatMap(item => item.roleTypes.map(roleType => `${item.legacyId}:${roleType}`));
  const actual = matrix.checks.map(check => `${check.legacyId}:${check.roleType}`);
  if (JSON.stringify(actual) !== JSON.stringify(expected) || new Set(actual).size !== actual.length) fail("YUZHOU_UAT_BROWSER_MATRIX_COVERAGE_DRIFT", "exact item-role matrix required");
  const itemById = new Map(taskCard.items.map(item => [item.legacyId, item]));
  const actorForRole = { hr_manager: "hr_reviewer", department_manager: "manager", employee_self_service: "employee" };
  for (const check of matrix.checks) {
    const keys = Object.keys(check).sort();
    const wanted = ["actor", "forbiddenTexts", "legacyId", "masked", "roleType", "route", "visibleTexts"].sort();
    const wantedWithRedirect = [...wanted, "expectedPath"].sort();
    if (JSON.stringify(keys) !== JSON.stringify(wanted) && JSON.stringify(keys) !== JSON.stringify(wantedWithRedirect)) fail("YUZHOU_UAT_BROWSER_MATRIX_SHAPE_INVALID", String(check.legacyId));
    const item = itemById.get(check.legacyId);
    if (!item || item.route !== check.route || actorForRole[check.roleType] !== check.actor) fail("YUZHOU_UAT_BROWSER_MATRIX_BINDING_INVALID", `${check.legacyId}:${check.roleType}`);
    if (check.expectedPath !== undefined && (typeof check.expectedPath !== "string" || !check.expectedPath.startsWith("/") || check.expectedPath === check.route)) fail("YUZHOU_UAT_BROWSER_MATRIX_EXPECTED_PATH_INVALID", `${check.legacyId}:${check.roleType}`);
    if (!Array.isArray(check.visibleTexts) || check.visibleTexts.length === 0 || check.visibleTexts.some(text => typeof text !== "string" || text.length < 2)) fail("YUZHOU_UAT_BROWSER_MATRIX_VISIBLE_INVALID", `${check.legacyId}:${check.roleType}`);
    if (!Array.isArray(check.forbiddenTexts) || check.forbiddenTexts.some(text => typeof text !== "string" || text.length < 2)) fail("YUZHOU_UAT_BROWSER_MATRIX_FORBIDDEN_INVALID", `${check.legacyId}:${check.roleType}`);
    if (check.masked !== (check.roleType !== "hr_manager")) fail("YUZHOU_UAT_BROWSER_MATRIX_MASKING_INVALID", `${check.legacyId}:${check.roleType}`);
  }
  return { sha256: browserMatrixHash(matrix), checkCount: matrix.checks.length, viewportCellCount: matrix.checks.length * taskCard.viewports.length, productionImport: "HOLD" };
}
