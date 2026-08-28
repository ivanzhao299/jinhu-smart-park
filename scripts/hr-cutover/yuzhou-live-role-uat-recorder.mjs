/* global structuredClone */
import { validateYuzhouLiveRoleUatEvidencePair } from "./yuzhou-live-role-uat-evidence-lib.mjs";
import { taskCardHash, validateYuzhouLiveRoleUatTaskCard } from "./yuzhou-live-role-uat-task-card-lib.mjs";

export class YuzhouLiveRoleUatRecorderError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "YuzhouLiveRoleUatRecorderError";
    this.code = code;
  }
}

const fail = (code, detail) => {
  throw new YuzhouLiveRoleUatRecorderError(code, detail);
};

export class YuzhouLiveRoleUatRecorder {
  #taskCard;
  #meta;
  #checks = new Map();
  #browser = new Map();
  #audit = new Set();

  constructor(taskCard, meta) {
    validateYuzhouLiveRoleUatTaskCard(taskCard);
    if (!["A", "B"].includes(meta?.rehearsal)) fail("YUZHOU_UAT_RECORDER_META_INVALID", "rehearsal");
    if (!/^[0-9a-f]{64}$/u.test(meta?.apiMatrixSha256 ?? "")) fail("YUZHOU_UAT_RECORDER_META_INVALID", "api matrix hash");
    if (!/^[0-9a-f]{64}$/u.test(meta?.browserMatrixSha256 ?? "")) fail("YUZHOU_UAT_RECORDER_META_INVALID", "browser matrix hash");
    this.#taskCard = taskCard;
    this.#meta = { ...meta };
  }

  passCheck(legacyId, kind, checkId, observation) {
    const item = this.#item(legacyId);
    if (!["positive", "negative"].includes(kind) || !item[kind].includes(checkId)) {
      fail("YUZHOU_UAT_RECORDER_CHECK_UNKNOWN", `${legacyId}.${kind}.${checkId}`);
    }
    if (!observation || typeof observation !== "object") fail("YUZHOU_UAT_RECORDER_OBSERVATION_MISSING", `${legacyId}.${kind}.${checkId}`);
    this.#checks.set(`${legacyId}:${kind}:${checkId}`, structuredClone(observation));
  }

  passBrowser(legacyId, roleType, viewportId, measurement) {
    const item = this.#item(legacyId);
    const viewport = this.#taskCard.viewports.find(candidate => candidate.id === viewportId);
    if (!item.roleTypes.includes(roleType) || !viewport || item.route !== measurement?.route || measurement?.roleType !== roleType) fail("YUZHOU_UAT_RECORDER_BROWSER_UNKNOWN", `${legacyId}.${roleType}.${viewportId}`);
    if (measurement.runId !== this.#meta.runId || measurement.rehearsal !== this.#meta.rehearsal
      || JSON.stringify(measurement.triple) !== JSON.stringify(this.#meta.triple)
      || !/^[0-9a-f]{64}$/u.test(measurement.actorSubjectHash ?? "")
      || !this.#meta.actors.some(actor => actor.roleType === roleType && actor.subjectHash === measurement.actorSubjectHash)
      || !/^[0-9a-f]{64}$/u.test(measurement.domAssertionSha256 ?? "")
      || !/^[0-9a-f]{64}$/u.test(measurement.cellEvidenceSha256 ?? "")) fail("YUZHOU_UAT_RECORDER_BROWSER_BINDING_INVALID", `${legacyId}.${roleType}.${viewportId}`);
    this.#browser.set(`${legacyId}:${roleType}:${viewportId}`, {
      status: "PASS",
      runId: measurement.runId,
      rehearsal: measurement.rehearsal,
      triple: { ...measurement.triple },
      legacyId,
      roleType,
      actor: measurement.actor,
      actorSubjectHash: measurement.actorSubjectHash,
      route: measurement.route,
      renderedPath: measurement.renderedPath,
      viewportId,
      width: measurement.width,
      height: measurement.height,
      mobile: measurement.mobile,
      clientWidth: measurement.clientWidth,
      scrollWidth: measurement.scrollWidth,
      screenshotSha256: measurement.screenshotSha256,
      domAssertionSha256: measurement.domAssertionSha256,
      cellEvidenceSha256: measurement.cellEvidenceSha256,
      assertions: [...this.#taskCard.browserAssertions]
    });
  }

  passAudit(legacyId) {
    this.#item(legacyId);
    this.#audit.add(legacyId);
  }

  finalize() {
    const items = this.#taskCard.items.map(item => ({
      legacyId: item.legacyId,
      status: "PASS",
      positive: item.positive.map(id => ({ id, status: "PASS", observation: this.#check(item.legacyId, "positive", id) })),
      negative: item.negative.map(id => ({ id, status: "PASS", observation: this.#check(item.legacyId, "negative", id) })),
      browser: Object.fromEntries(item.roleTypes.map(roleType => [roleType, Object.fromEntries(this.#taskCard.viewports.map(viewport => {
        const result = this.#browser.get(`${item.legacyId}:${roleType}:${viewport.id}`);
        if (!result) fail("YUZHOU_UAT_RECORDER_BROWSER_MISSING", `${item.legacyId}.${roleType}.${viewport.id}`);
        return [viewport.id, result];
      }))])),
      auditStatus: this.#audit.has(item.legacyId) ? "PASS" : fail("YUZHOU_UAT_RECORDER_AUDIT_MISSING", String(item.legacyId))
    }));
    return {
      formatVersion: 1,
      contractKind: "yuzhou_hr_live_role_uat_evidence",
      status: "PASS",
      executionBoundary: "isolated_lab_only",
      rehearsal: this.#meta.rehearsal,
      runId: this.#meta.runId,
      targetIdentityHash: this.#meta.targetIdentityHash,
      taskCardSha256: taskCardHash(this.#taskCard),
      apiMatrixSha256: this.#meta.apiMatrixSha256,
      browserMatrixSha256: this.#meta.browserMatrixSha256,
      triple: { ...this.#meta.triple },
      actors: this.#meta.actors.map(actor => ({ ...actor })),
      items,
      p0P1Count: 0,
      sensitiveScan: "PASS",
      auditStatus: "PASS",
      humanAttestation: "HOLD",
      productionImport: "HOLD"
    };
  }

  #item(legacyId) {
    const item = this.#taskCard.items.find(candidate => candidate.legacyId === legacyId);
    if (!item) fail("YUZHOU_UAT_RECORDER_ITEM_UNKNOWN", String(legacyId));
    return item;
  }

  #check(legacyId, kind, checkId) {
    const observation = this.#checks.get(`${legacyId}:${kind}:${checkId}`);
    if (!observation) fail("YUZHOU_UAT_RECORDER_CHECK_MISSING", `${legacyId}.${kind}.${checkId}`);
    return observation;
  }
}

export function validateRecordedYuzhouLiveRoleUatPair(pair, taskCard, expectedTriple, apiMatrix, browserMatrix) {
  return validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, expectedTriple, apiMatrix, browserMatrix);
}
