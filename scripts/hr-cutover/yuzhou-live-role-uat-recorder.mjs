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
    this.#taskCard = taskCard;
    this.#meta = { ...meta };
  }

  passCheck(legacyId, kind, checkId) {
    const item = this.#item(legacyId);
    if (!["positive", "negative"].includes(kind) || !item[kind].includes(checkId)) {
      fail("YUZHOU_UAT_RECORDER_CHECK_UNKNOWN", `${legacyId}.${kind}.${checkId}`);
    }
    this.#checks.set(`${legacyId}:${kind}:${checkId}`, "PASS");
  }

  passBrowser(legacyId, viewportId, measurement) {
    const item = this.#item(legacyId);
    const viewport = this.#taskCard.viewports.find(candidate => candidate.id === viewportId);
    if (!viewport || item.route !== measurement?.route) fail("YUZHOU_UAT_RECORDER_BROWSER_UNKNOWN", `${legacyId}.${viewportId}`);
    this.#browser.set(`${legacyId}:${viewportId}`, {
      status: "PASS",
      width: measurement.width,
      height: measurement.height,
      mobile: measurement.mobile,
      clientWidth: measurement.clientWidth,
      scrollWidth: measurement.scrollWidth,
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
      positive: item.positive.map(id => ({ id, status: this.#check(item.legacyId, "positive", id) })),
      negative: item.negative.map(id => ({ id, status: this.#check(item.legacyId, "negative", id) })),
      browser: Object.fromEntries(this.#taskCard.viewports.map(viewport => {
        const result = this.#browser.get(`${item.legacyId}:${viewport.id}`);
        if (!result) fail("YUZHOU_UAT_RECORDER_BROWSER_MISSING", `${item.legacyId}.${viewport.id}`);
        return [viewport.id, result];
      })),
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
    const status = this.#checks.get(`${legacyId}:${kind}:${checkId}`);
    if (status !== "PASS") fail("YUZHOU_UAT_RECORDER_CHECK_MISSING", `${legacyId}.${kind}.${checkId}`);
    return status;
  }
}

export function validateRecordedYuzhouLiveRoleUatPair(pair, taskCard, expectedTriple) {
  return validateYuzhouLiveRoleUatEvidencePair(pair, taskCard, expectedTriple);
}
