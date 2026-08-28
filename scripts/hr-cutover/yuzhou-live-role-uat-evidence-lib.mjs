import { YUZHOU_LIVE_ROLE_UAT_EXPECTED_IDS, taskCardHash, validateYuzhouLiveRoleUatTaskCard } from "./yuzhou-live-role-uat-task-card-lib.mjs";

export class YuzhouLiveRoleUatEvidenceError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatEvidenceError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new YuzhouLiveRoleUatEvidenceError(code, detail);
};
const sha40 = value => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const sha64 = value => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const exactArray = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

function validateTriple(triple) {
  if (!sha40(triple?.codeSha) || !sha64(triple?.sourceSnapshotHash) || !sha64(triple?.mappingContractHash)) {
    fail("YUZHOU_UAT_EVIDENCE_TRIPLE_INVALID", "C/S/M");
  }
  return triple;
}

function validateOne(evidence, taskCard, rehearsal) {
  if (evidence?.formatVersion !== 1 || evidence?.contractKind !== "yuzhou_hr_live_role_uat_evidence" || evidence?.status !== "PASS") {
    fail("YUZHOU_UAT_EVIDENCE_INVALID", rehearsal);
  }
  if (evidence.productionImport !== "HOLD" || evidence.humanAttestation !== "HOLD" || evidence.executionBoundary !== "isolated_lab_only") {
    fail("YUZHOU_UAT_EVIDENCE_BOUNDARY_UNSAFE", rehearsal);
  }
  if (evidence.rehearsal !== rehearsal || !/^yzfull-[a-zA-Z0-9._-]+-r[AB]$/u.test(evidence.runId ?? "")) {
    fail("YUZHOU_UAT_EVIDENCE_RUN_INVALID", rehearsal);
  }
  if (!sha64(evidence.targetIdentityHash) || !sha64(evidence.taskCardSha256) || evidence.taskCardSha256 !== taskCardHash(taskCard)) {
    fail("YUZHOU_UAT_EVIDENCE_BINDING_INVALID", rehearsal);
  }
  validateTriple(evidence.triple);
  if (evidence.p0P1Count !== 0 || evidence.sensitiveScan !== "PASS" || evidence.auditStatus !== "PASS") {
    fail("YUZHOU_UAT_EVIDENCE_HARD_GATE_FAILED", rehearsal);
  }
  const actorTypes = evidence.actors?.map(actor => actor.roleType);
  if (!exactArray(actorTypes, ["hr_manager", "hr_manager", "department_manager", "employee_self_service"])) {
    fail("YUZHOU_UAT_EVIDENCE_ACTORS_INVALID", rehearsal);
  }
  if (evidence.actors.some(actor => !sha64(actor.subjectHash))) fail("YUZHOU_UAT_EVIDENCE_ACTOR_HASH_INVALID", rehearsal);
  if (new Set(evidence.actors.map(actor => actor.subjectHash)).size !== evidence.actors.length) {
    fail("YUZHOU_UAT_EVIDENCE_ACTOR_REUSE", rehearsal);
  }
  const itemIds = evidence.items?.map(item => item.legacyId);
  if (!exactArray(itemIds, [...YUZHOU_LIVE_ROLE_UAT_EXPECTED_IDS])) {
    fail("YUZHOU_UAT_EVIDENCE_ITEM_DRIFT", rehearsal);
  }
  const taskById = new Map(taskCard.items.map(item => [item.legacyId, item]));
  for (const item of evidence.items) {
    const expected = taskById.get(item.legacyId);
    if (item.status !== "PASS" || item.auditStatus !== "PASS") fail("YUZHOU_UAT_EVIDENCE_ITEM_FAILED", String(item.legacyId));
    for (const [kind, expectedIds] of [["positive", expected.positive], ["negative", expected.negative]]) {
      const checks = item[kind];
      if (!Array.isArray(checks) || !exactArray(checks.map(check => check.id), expectedIds) || checks.some(check => check.status !== "PASS")) {
        fail("YUZHOU_UAT_EVIDENCE_CHECK_FAILED", `${item.legacyId}.${kind}`);
      }
    }
    const browser = item.browser;
    for (const viewport of taskCard.viewports) {
      const result = browser?.[viewport.id];
      if (result?.status !== "PASS"
        || result.width !== viewport.width
        || result.height !== viewport.height
        || result.mobile !== viewport.mobile
        || !Number.isInteger(result.clientWidth)
        || !Number.isInteger(result.scrollWidth)
        || result.clientWidth > viewport.width
        || result.scrollWidth > result.clientWidth
        || !exactArray(result.assertions, taskCard.browserAssertions)) {
        fail("YUZHOU_UAT_EVIDENCE_BROWSER_FAILED", `${item.legacyId}.${viewport.id}`);
      }
    }
  }
  return evidence;
}

export function validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, expectedTriple = null) {
  validateYuzhouLiveRoleUatTaskCard(taskCard);
  const rehearsalA = validateOne(pair?.A, taskCard, "A");
  const rehearsalB = validateOne(pair?.B, taskCard, "B");
  if (JSON.stringify(rehearsalA.triple) !== JSON.stringify(rehearsalB.triple)) {
    fail("YUZHOU_UAT_EVIDENCE_TRIPLE_MISMATCH", "A/B");
  }
  if (expectedTriple && JSON.stringify(rehearsalA.triple) !== JSON.stringify(validateTriple(expectedTriple))) {
    fail("YUZHOU_UAT_EVIDENCE_CANDIDATE_DRIFT", "expected C/S/M");
  }
  if (rehearsalA.runId === rehearsalB.runId || rehearsalA.targetIdentityHash === rehearsalB.targetIdentityHash) {
    fail("YUZHOU_UAT_EVIDENCE_RESOURCE_REUSE", "A/B must be independent");
  }
  return {
    status: "PASS",
    triple: { ...rehearsalA.triple },
    taskCardSha256: rehearsalA.taskCardSha256,
    eligibleLegacyIds: [...YUZHOU_LIVE_ROLE_UAT_EXPECTED_IDS],
    rehearsalRunIds: [rehearsalA.runId, rehearsalB.runId],
    productionImport: "HOLD"
  };
}
