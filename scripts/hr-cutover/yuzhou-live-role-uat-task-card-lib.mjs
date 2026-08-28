import { createHash } from "node:crypto";

export class YuzhouLiveRoleUatTaskCardError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatTaskCardError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new YuzhouLiveRoleUatTaskCardError(code, detail);
};

const EXPECTED_IDS = Object.freeze([34, 35, 36, 37, 39, 42, 43, 44, 45, 46, 47, 313]);
const EXPECTED_ROLES = Object.freeze(["hr_manager", "department_manager", "employee_self_service"]);
const EXPECTED_VIEWPORTS = Object.freeze([
  { id: "desktop", width: 1440, height: 1000, mobile: false },
  { id: "phone_390", width: 390, height: 844, mobile: true }
]);

const exactKeys = (value, expected, code) => {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, `${actual.join(",")} != ${wanted.join(",")}`);
};

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
};

export const taskCardHash = taskCard => createHash("sha256")
  .update(JSON.stringify(canonicalize(taskCard)))
  .digest("hex");

export function validateYuzhouLiveRoleUatTaskCard(taskCard) {
  if (taskCard?.formatVersion !== 1 || taskCard?.contractKind !== "yuzhou_hr_live_role_uat_task_card") {
    fail("YUZHOU_UAT_TASK_CARD_INVALID", "identity");
  }
  if (taskCard.executionBoundary !== "isolated_lab_only" || taskCard.productionImport !== "HOLD") {
    fail("YUZHOU_UAT_TASK_CARD_UNSAFE", "execution boundary");
  }
  if (JSON.stringify(taskCard.roleTypes) !== JSON.stringify(EXPECTED_ROLES)) {
    fail("YUZHOU_UAT_TASK_CARD_ROLE_DRIFT", "role types");
  }
  if (taskCard.actorSeparation?.hrMakerAndReviewerMustDiffer !== true || taskCard.actorSeparation?.businessRoleTypesRemainThree !== true) {
    fail("YUZHOU_UAT_TASK_CARD_MAKER_CHECKER_MISSING", "actor separation");
  }
  if (JSON.stringify(taskCard.viewports) !== JSON.stringify(EXPECTED_VIEWPORTS)) {
    fail("YUZHOU_UAT_TASK_CARD_VIEWPORT_DRIFT", "desktop and exact 390px are required");
  }
  if (!Array.isArray(taskCard.items) || JSON.stringify(taskCard.items.map(item => item.legacyId)) !== JSON.stringify(EXPECTED_IDS)) {
    fail("YUZHOU_UAT_TASK_CARD_ITEM_DRIFT", "exact score-90 legacy boundary required");
  }
  for (const item of taskCard.items) {
    exactKeys(item, ["legacyId", "name", "route", "positive", "negative", "roleTypes"], "YUZHOU_UAT_TASK_CARD_ITEM_SHAPE_INVALID");
    if (!/^\/hr(?:\/|$)/u.test(item.route)) fail("YUZHOU_UAT_TASK_CARD_ROUTE_UNSAFE", String(item.route));
    if (!Array.isArray(item.positive) || item.positive.length === 0 || !Array.isArray(item.negative) || item.negative.length === 0) {
      fail("YUZHOU_UAT_TASK_CARD_MATRIX_INCOMPLETE", String(item.legacyId));
    }
    if (!Array.isArray(item.roleTypes) || item.roleTypes.some(role => !EXPECTED_ROLES.includes(role))) {
      fail("YUZHOU_UAT_TASK_CARD_ROLE_UNKNOWN", String(item.legacyId));
    }
  }
  const requiredAssertions = [
    "authenticated_route_reached",
    "no_runtime_error_surface",
    "no_horizontal_overflow",
    "role_allowed_actions_visible",
    "role_forbidden_actions_absent",
    "sensitive_values_not_rendered_for_masked_roles",
    "session_cleanup_removes_sensitive_dom_and_storage"
  ];
  if (JSON.stringify(taskCard.browserAssertions) !== JSON.stringify(requiredAssertions)) {
    fail("YUZHOU_UAT_TASK_CARD_BROWSER_ASSERTION_DRIFT", "browser assertions");
  }
  exactKeys(taskCard.evidenceRequirements, [
    "tripleBound", "taskCardHashBound", "allItemsPass", "allPositiveChecksPass",
    "allNegativeChecksPass", "bothViewportsPass", "auditChecksPass", "p0P1Count",
    "humanAttestationSeparate", "credentialsExcluded", "personalDataExcluded"
  ], "YUZHOU_UAT_TASK_CARD_EVIDENCE_SHAPE_INVALID");
  if (Object.entries(taskCard.evidenceRequirements).some(([key, value]) => key === "p0P1Count" ? value !== 0 : value !== true)) {
    fail("YUZHOU_UAT_TASK_CARD_EVIDENCE_GATE_WEAKENED", "all hard gates are required");
  }
  return {
    formatVersion: taskCard.formatVersion,
    taskCardVersion: taskCard.taskCardVersion,
    sha256: taskCardHash(taskCard),
    legacyIds: [...EXPECTED_IDS],
    roleTypes: [...EXPECTED_ROLES],
    viewports: EXPECTED_VIEWPORTS.map(viewport => ({ ...viewport })),
    productionImport: "HOLD"
  };
}

export const YUZHOU_LIVE_ROLE_UAT_EXPECTED_IDS = EXPECTED_IDS;
