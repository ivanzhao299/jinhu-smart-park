import { createHash } from "node:crypto";
import { YUZHOU_LIVE_ROLE_UAT_EXPECTED_IDS, taskCardHash, validateYuzhouLiveRoleUatTaskCard } from "./yuzhou-live-role-uat-task-card-lib.mjs";
import { apiMatrixHash, validateYuzhouLiveRoleUatApiMatrix } from "./yuzhou-live-role-uat-api-matrix-lib.mjs";
import { browserMatrixHash, validateYuzhouLiveRoleUatBrowserMatrix } from "./yuzhou-live-role-uat-browser-matrix-lib.mjs";

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
const sha256 = value => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const outcomeStatuses = Object.freeze({ success: [200, 201, 204], forbidden: [403], not_found_or_forbidden: [403, 404], conflict: [409] });
const expectedActors = [["hr_maker", "hr_manager"], ["hr_reviewer", "hr_manager"], ["manager", "department_manager"], ["employee", "employee_self_service"]];
const auditSemantics = new Map([
  ["POST /hr/onboarding-applications", ["hr_onboarding_application", "创建入职申请"]],
  ["POST /hr/onboarding-applications/{onboardingId}/actions", ["hr_onboarding_application", "提交或取消入职申请"]],
  ["POST /hr/onboarding-applications/{onboardingId}/review", ["hr_onboarding_application", "审核入职申请"]],
  ["POST /hr/onboarding-applications/{onboardingId}/confirm", ["hr_onboarding_application", "确认员工入职"]],
  ["GET /hr/employees/{profileEmployeeId}/profile", ["hr_employee", "读取员工敏感档案"]],
  ["POST /hr/probation-applications", ["hr_probation_application", "创建转正申请"]],
  ["POST /hr/probation-applications/{probationId}/actions", ["hr_probation_application", "提交或取消转正申请"]],
  ["POST /hr/probation-applications/{probationId}/review", ["hr_probation_application", "审核转正申请"]],
  ["POST /hr/probation-applications/{probationId}/confirm", ["hr_probation_application", "确认员工转正"]],
  ["POST /hr/contracts", ["hr_contract", "新建劳动合同草稿"]],
  ["POST /hr/contracts/{contractId}/actions", ["hr_contract", "办理劳动合同状态"]],
  ["POST /hr/job-change-applications", ["hr_job_change_application", "创建岗位变更申请"]],
  ["POST /hr/job-change-applications/{jobChangeId}/actions", ["hr_job_change_application", "提交或取消岗位变更申请"]],
  ["POST /hr/job-change-applications/{jobChangeId}/review", ["hr_job_change_application", "审核岗位变更申请"]],
  ["POST /hr/job-change-applications/{jobChangeId}/apply", ["hr_job_change_application", "生效岗位变更"]],
  ["POST /hr/departure-applications", ["hr_departure_application", "创建离职申请"]],
  ["POST /hr/departure-applications/{departureId}/actions", ["hr_departure_application", "提交或取消离职申请"]],
  ["POST /hr/departure-applications/{departureId}/review", ["hr_departure_application", "审核离职申请"]],
  ["POST /hr/departure-applications/{departureId}/interview", ["hr_departure_application", "记录离职面谈"]],
  ["POST /hr/departure-applications/{departureId}/survey", ["hr_departure_application", "记录离职调查"]],
  ["POST /hr/departure-applications/{departureId}/handover", ["hr_departure_application", "确认离职交接"]],
  ["POST /hr/departure-applications/{departureId}/wage-settlement", ["hr_departure_application", "确认离职工资结算"]],
  ["POST /hr/departure-applications/{departureId}/archive", ["hr_departure_application", "关闭离职人事档案"]],
  ["POST /hr/departure-applications/{departureId}/apply", ["hr_departure_application", "生效员工离职"]],
  ["POST /hr/work-reports/me", ["hr_work_report", "创建工作汇报草稿"]],
  ["PUT /hr/work-reports/{workReportId}", ["hr_work_report", "更新工作汇报草稿"]],
  ["POST /hr/work-reports/{workReportId}/submit", ["hr_work_report", "提交工作汇报"]],
  ["POST /hr/work-reports/{workReportId}/review", ["hr_work_report", "审核工作汇报"]]
]);

export function technicalUatAuditSemantic(method, routeTemplate) {
  const value = auditSemantics.get(`${method} ${routeTemplate}`);
  return value ? { bizType: value[0], action: value[1] } : null;
}

function validateObservation(observation, matrixCheck, key) {
  if (observation?.actor !== matrixCheck.actor
    || observation?.checkKeySha256 !== sha256(key)
    || !sha64(observation?.observationSha256)
    || !Array.isArray(observation.operations)
    || observation.operations.length !== matrixCheck.operations.length) {
    fail("YUZHOU_UAT_EVIDENCE_HTTP_OBSERVATION_INVALID", key);
  }
  for (const [index, operation] of observation.operations.entries()) {
    const expected = matrixCheck.operations[index];
    if (operation?.method !== expected.method
      || operation?.routeTemplate !== expected.route
      || operation?.outcome !== expected.outcome
      || !outcomeStatuses[expected.outcome].includes(operation?.statusCode)
      || !(operation?.auditBizIdSha256 === null || sha64(operation?.auditBizIdSha256))
      || !sha64(operation?.requestBodySha256)
      || !sha64(operation?.responseShapeSha256)) {
      fail("YUZHOU_UAT_EVIDENCE_HTTP_OPERATION_INVALID", `${key}.${index}`);
    }
  }
  if (JSON.stringify(Object.keys(observation.assertions ?? {})) !== JSON.stringify(matrixCheck.assertions)
    || Object.values(observation.assertions ?? {}).some(value => value !== true)
    || observation.observationSha256 !== sha256({ actor: observation.actor, operations: observation.operations, assertions: observation.assertions })) {
    fail("YUZHOU_UAT_EVIDENCE_HTTP_ASSERTION_INVALID", key);
  }
}

function validateTriple(triple) {
  if (!sha40(triple?.codeSha) || !sha64(triple?.sourceSnapshotHash) || !sha64(triple?.mappingContractHash)) {
    fail("YUZHOU_UAT_EVIDENCE_TRIPLE_INVALID", "C/S/M");
  }
  return triple;
}

function validateOne(evidence, taskCard, apiMatrix, browserMatrix, rehearsal) {
  if (evidence?.formatVersion !== 1 || evidence?.contractKind !== "yuzhou_hr_live_role_uat_evidence" || evidence?.status !== "PASS") {
    fail("YUZHOU_UAT_EVIDENCE_INVALID", rehearsal);
  }
  if (evidence.productionImport !== "HOLD" || evidence.humanAttestation !== "HOLD" || evidence.executionBoundary !== "isolated_lab_only") {
    fail("YUZHOU_UAT_EVIDENCE_BOUNDARY_UNSAFE", rehearsal);
  }
  if (evidence.rehearsal !== rehearsal || !/^yz(?:full|core)-[a-zA-Z0-9._-]+-r[AB]$/u.test(evidence.runId ?? "") || !evidence.runId.endsWith(`-r${rehearsal}`)) {
    fail("YUZHOU_UAT_EVIDENCE_RUN_INVALID", rehearsal);
  }
  if (!sha64(evidence.targetIdentityHash)
    || !sha64(evidence.taskCardSha256)
    || evidence.taskCardSha256 !== taskCardHash(taskCard)
    || !sha64(evidence.apiMatrixSha256)
    || evidence.apiMatrixSha256 !== apiMatrixHash(apiMatrix)
    || !sha64(evidence.browserMatrixSha256)
    || evidence.browserMatrixSha256 !== browserMatrixHash(browserMatrix)) {
    fail("YUZHOU_UAT_EVIDENCE_BINDING_INVALID", rehearsal);
  }
  validateTriple(evidence.triple);
  if (evidence.p0P1Count !== 0 || evidence.sensitiveScan !== "PASS" || evidence.auditStatus !== "PASS") {
    fail("YUZHOU_UAT_EVIDENCE_HARD_GATE_FAILED", rehearsal);
  }
  const actorTypes = evidence.actors?.map(actor => [actor.actor, actor.roleType]);
  if (!exactArray(actorTypes, expectedActors)) {
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
  const matrixByKey = new Map(apiMatrix.checks.map(check => [`${check.legacyId}:${check.kind}:${check.checkId}`, check]));
  const browserByKey = new Map(browserMatrix.checks.map(check => [`${check.legacyId}:${check.roleType}`, check]));
  for (const item of evidence.items) {
    const expected = taskById.get(item.legacyId);
    if (item.status !== "PASS" || item.auditStatus !== "PASS") fail("YUZHOU_UAT_EVIDENCE_ITEM_FAILED", String(item.legacyId));
    const auditChecks=apiMatrix.checks.filter(check=>check.legacyId===item.legacyId&&check.assertions.some(assertion=>["audit_written","required_audit_written"].includes(assertion)));
    const auditOperations=new Map(auditChecks.flatMap(check=>check.operations.map((operation,index)=>{const observed=item[check.kind]?.find(row=>row.id===check.checkId)?.observation?.operations?.[index],semantic=technicalUatAuditSemantic(operation.method,operation.route);return[sha256({actor:check.actor,method:operation.method,routeTemplate:operation.route}),{actor:check.actor,auditBizIdSha256:observed?.auditBizIdSha256,semantic}];})));
    const audit=item.auditEvidence;
    if (!audit || !sha64(item.auditEvidenceSha256)
      || audit.status!=="PASS"||!Number.isInteger(audit.beforeCount)||!Number.isInteger(audit.afterCount)||!Number.isInteger(audit.delta)||audit.delta<=0||audit.afterCount-audit.beforeCount!==audit.delta
      || !Array.isArray(audit.rows)||audit.rows.length!==audit.delta||!sha64(audit.rowsSha256)||audit.rowsSha256!==sha256(audit.rows)
      || item.auditEvidenceSha256!==sha256(audit)) {
      fail("YUZHOU_UAT_EVIDENCE_AUDIT_PROOF_INVALID", String(item.legacyId));
    }
    for (const row of audit.rows) {
      const expectedOperation=auditOperations.get(row.operationKeySha256);
      if (!expectedActors.some(([actor])=>actor===row.actor)||!evidence.actors.some(actor=>actor.actor===row.actor&&actor.subjectHash===row.actorSubjectHash)) fail("YUZHOU_UAT_EVIDENCE_AUDIT_PROOF_INVALID", `${item.legacyId}.actor`);
      if (!expectedOperation||expectedOperation.actor!==row.actor||!expectedOperation.semantic) fail("YUZHOU_UAT_EVIDENCE_AUDIT_PROOF_INVALID", `${item.legacyId}.operation`);
      if (row.bizIdSha256!==expectedOperation.auditBizIdSha256) fail("YUZHOU_UAT_EVIDENCE_AUDIT_PROOF_INVALID", `${item.legacyId}.biz_id`);
      if (row.bizTypeSha256!==sha256(expectedOperation.semantic.bizType)) fail("YUZHOU_UAT_EVIDENCE_AUDIT_PROOF_INVALID", `${item.legacyId}.biz_type`);
      if (row.actionSha256!==sha256(expectedOperation.semantic.action)) fail("YUZHOU_UAT_EVIDENCE_AUDIT_PROOF_INVALID", `${item.legacyId}.action`);
    }
    for (const [kind, expectedIds] of [["positive", expected.positive], ["negative", expected.negative]]) {
      const checks = item[kind];
      if (!Array.isArray(checks) || !exactArray(checks.map(check => check.id), expectedIds) || checks.some(check => check.status !== "PASS")) {
        fail("YUZHOU_UAT_EVIDENCE_CHECK_FAILED", `${item.legacyId}.${kind}`);
      }
      for (const check of checks) {
        const key = `${item.legacyId}:${kind}:${check.id}`;
        validateObservation(check.observation, matrixByKey.get(key), key);
      }
    }
    for (const roleType of expected.roleTypes) {
      const browserCheck = browserByKey.get(`${item.legacyId}:${roleType}`);
      for (const viewport of taskCard.viewports) {
        const result = item.browser?.[roleType]?.[viewport.id];
        if (result?.status !== "PASS"
          || result.runId !== evidence.runId
          || result.rehearsal !== evidence.rehearsal
          || JSON.stringify(result.triple) !== JSON.stringify(evidence.triple)
          || result.legacyId !== item.legacyId
          || result.roleType !== roleType
          || result.actor !== browserCheck?.actor
          || !evidence.actors.some(actor => actor.actor === result.actor && actor.roleType === roleType && actor.subjectHash === result.actorSubjectHash)
          || result.route !== browserCheck.route
          || result.renderedPath !== (browserCheck.expectedPath ?? browserCheck.route)
          || result.viewportId !== viewport.id
          || result.width !== viewport.width
          || result.height !== viewport.height
          || result.mobile !== viewport.mobile
          || !Number.isInteger(result.clientWidth)
          || !Number.isInteger(result.scrollWidth)
          || result.clientWidth > viewport.width
          || result.scrollWidth > result.clientWidth
          || !sha64(result.screenshotSha256)
          || !sha64(result.domAssertionSha256)
          || result.networkFailureCount !== 0
          || !Number.isInteger(result.pendingRequestCount)
          || result.pendingRequestCount < 0
          || result.cellEvidenceSha256 !== sha256({ runId: result.runId, rehearsal: result.rehearsal, triple: result.triple, legacyId: result.legacyId, roleType: result.roleType, actor: result.actor, actorSubjectHash: result.actorSubjectHash, route: result.route, renderedPath: result.renderedPath, viewportId: result.viewportId, width: result.width, height: result.height, mobile: result.mobile, screenshotSha256: result.screenshotSha256, domAssertionSha256: result.domAssertionSha256, networkFailureCount: result.networkFailureCount, pendingRequestCount: result.pendingRequestCount })
          || !exactArray(result.assertions, taskCard.browserAssertions)) {
          fail("YUZHOU_UAT_EVIDENCE_BROWSER_FAILED", `${item.legacyId}.${roleType}.${viewport.id}`);
        }
      }
    }
  }
  return evidence;
}

export function validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, expectedTriple = null, apiMatrix = null, browserMatrix = null) {
  validateYuzhouLiveRoleUatTaskCard(taskCard);
  if (!apiMatrix) fail("YUZHOU_UAT_EVIDENCE_API_MATRIX_MISSING", "canonical matrix required");
  validateYuzhouLiveRoleUatApiMatrix(apiMatrix, taskCard);
  if (!browserMatrix) fail("YUZHOU_UAT_EVIDENCE_BROWSER_MATRIX_MISSING", "canonical matrix required");
  validateYuzhouLiveRoleUatBrowserMatrix(browserMatrix, taskCard);
  const rehearsalA = validateOne(pair?.A, taskCard, apiMatrix, browserMatrix, "A");
  const rehearsalB = validateOne(pair?.B, taskCard, apiMatrix, browserMatrix, "B");
  if (JSON.stringify(rehearsalA.triple) !== JSON.stringify(rehearsalB.triple)) {
    fail("YUZHOU_UAT_EVIDENCE_TRIPLE_MISMATCH", "A/B");
  }
  if (rehearsalA.apiMatrixSha256 !== rehearsalB.apiMatrixSha256) {
    fail("YUZHOU_UAT_EVIDENCE_API_MATRIX_MISMATCH", "A/B");
  }
  if (rehearsalA.browserMatrixSha256 !== rehearsalB.browserMatrixSha256) fail("YUZHOU_UAT_EVIDENCE_BROWSER_MATRIX_MISMATCH", "A/B");
  if (expectedTriple && JSON.stringify(rehearsalA.triple) !== JSON.stringify(validateTriple(expectedTriple))) {
    fail("YUZHOU_UAT_EVIDENCE_CANDIDATE_DRIFT", "expected C/S/M");
  }
  if (rehearsalA.runId === rehearsalB.runId || rehearsalA.targetIdentityHash === rehearsalB.targetIdentityHash) {
    fail("YUZHOU_UAT_EVIDENCE_RESOURCE_REUSE", "A/B must be independent");
  }
  const actorHashesA = new Set(rehearsalA.actors.map(actor => actor.subjectHash));
  if (rehearsalB.actors.some(actor => actorHashesA.has(actor.subjectHash))) fail("YUZHOU_UAT_EVIDENCE_ACTOR_REUSE", "A/B actors must be independent");
  return {
    status: "PASS",
    triple: { ...rehearsalA.triple },
    taskCardSha256: rehearsalA.taskCardSha256,
    apiMatrixSha256: rehearsalA.apiMatrixSha256,
    browserMatrixSha256: rehearsalA.browserMatrixSha256,
    eligibleLegacyIds: [...YUZHOU_LIVE_ROLE_UAT_EXPECTED_IDS],
    rehearsalRunIds: [rehearsalA.runId, rehearsalB.runId],
    productionImport: "HOLD"
  };
}
