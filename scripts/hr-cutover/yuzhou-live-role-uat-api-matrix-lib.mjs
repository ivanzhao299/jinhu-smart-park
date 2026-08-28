import { createHash } from "node:crypto";
import { validateYuzhouLiveRoleUatTaskCard } from "./yuzhou-live-role-uat-task-card-lib.mjs";

export class YuzhouLiveRoleUatApiMatrixError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatApiMatrixError";
    this.code = code;
  }
}

const ACTORS = new Set(["hr_maker", "hr_reviewer", "manager", "employee"]);
const METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
const OUTCOMES = new Set(["success", "forbidden", "not_found_or_forbidden", "conflict"]);
const ROUTE_PATTERN = /^\/hr\/[a-z0-9-/]+(?:\{[a-zA-Z][a-zA-Z0-9]*\}[a-z0-9-/]*)*$/u;
const ASSERTION_PATTERN = /^[a-z][a-z0-9_]{2,63}$/u;
const fail = (code, detail) => {
  throw new YuzhouLiveRoleUatApiMatrixError(code, detail);
};
const stable = value => `${JSON.stringify(value, null, 2)}\n`;

export function apiMatrixHash(matrix) {
  return createHash("sha256").update(stable(matrix)).digest("hex");
}

export function validateYuzhouLiveRoleUatApiMatrix(matrix, taskCard) {
  validateYuzhouLiveRoleUatTaskCard(taskCard);
  if (matrix?.formatVersion !== 1 || matrix?.contractKind !== "yuzhou_hr_live_role_uat_api_matrix") {
    fail("YUZHOU_UAT_API_MATRIX_INVALID", "identity");
  }
  if (matrix.executionBoundary !== "isolated_lab_only" || matrix.productionImport !== "HOLD") {
    fail("YUZHOU_UAT_API_MATRIX_UNSAFE", "execution boundary");
  }
  if (!Array.isArray(matrix.checks)) fail("YUZHOU_UAT_API_MATRIX_INVALID", "checks");
  const expected = taskCard.items.flatMap(item => [
    ...item.positive.map(checkId => ({ legacyId: item.legacyId, kind: "positive", checkId })),
    ...item.negative.map(checkId => ({ legacyId: item.legacyId, kind: "negative", checkId }))
  ]);
  const actual = matrix.checks.map(({ legacyId, kind, checkId }) => ({ legacyId, kind, checkId }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("YUZHOU_UAT_API_MATRIX_CHECK_DRIFT", "task-card checks must match exactly and in order");
  }
  const keys = new Set();
  for (const check of matrix.checks) {
    const key = `${check.legacyId}:${check.kind}:${check.checkId}`;
    if (keys.has(key)) fail("YUZHOU_UAT_API_MATRIX_CHECK_DUPLICATE", key);
    keys.add(key);
    if (!ACTORS.has(check.actor)) fail("YUZHOU_UAT_API_MATRIX_ACTOR_INVALID", key);
    if (!Array.isArray(check.operations) || check.operations.length < 1 || check.operations.length > 3) {
      fail("YUZHOU_UAT_API_MATRIX_OPERATION_INVALID", key);
    }
    for (const operation of check.operations) {
      if (!METHODS.has(operation?.method)
        || !ROUTE_PATTERN.test(operation?.route ?? "")
        || operation.route.includes("..")
        || !OUTCOMES.has(operation?.outcome)) {
        fail("YUZHOU_UAT_API_MATRIX_OPERATION_INVALID", key);
      }
      if (check.kind === "positive" && operation.outcome !== "success") {
        fail("YUZHOU_UAT_API_MATRIX_OUTCOME_INVALID", key);
      }
    }
    if (!Array.isArray(check.assertions)
      || check.assertions.length < 1
      || new Set(check.assertions).size !== check.assertions.length
      || check.assertions.some(assertion => !ASSERTION_PATTERN.test(assertion))) {
      fail("YUZHOU_UAT_API_MATRIX_ASSERTION_INVALID", key);
    }
    if (check.kind === "negative" && !check.assertions.some(assertion => /^(?:no_|other_row_absent|salary_fields_absent)/u.test(assertion))) {
      fail("YUZHOU_UAT_API_MATRIX_NEGATIVE_PROOF_MISSING", key);
    }
  }
  return {
    status: "PASS",
    checkCount: matrix.checks.length,
    legacyIds: [...new Set(matrix.checks.map(check => check.legacyId))],
    sha256: apiMatrixHash(matrix),
    productionImport: "HOLD"
  };
}
