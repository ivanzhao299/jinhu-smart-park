import { createHash } from "node:crypto";
import { assessLegacyGroupWebImplementationCoverage } from "./legacy-group-web-implementation-coverage-lib.mjs";

const sha = value => createHash("sha256").update(Buffer.isBuffer(value) ? value : Buffer.from(`${JSON.stringify(value, null, 2)}\n`)).digest("hex");
const roles = Object.freeze({ web_admin: "hr_manager", manager: "department_manager", employee: "employee_self_service" });
const roleOrder = Object.freeze(["web_admin", "manager", "employee"]);

export function adaptGroupWebRoleUatToLegacyRuntimeEvidence({ mapping, runtimeCoverage, runtimeTechnical, result, resultRawSha256, review }) {
  if (result?.legacyRuntimeScoreEligibility !== "ELIGIBLE_AUTHORIZED_ATTESTATION" || !result.liveCaptureAttestationRawSha256) return { status: "HOLD", reason: "LIVE_EXTERNAL_ATTESTATION_MISSING", evidence: null };
  if (review?.status !== "MACHINE_VERIFIED" || review.legacyRuntimeScoreEligibility !== "ELIGIBLE_AUTHORIZED_ATTESTATION" || review.liveCaptureAuthorityRawSha256 !== result.liveCaptureAuthorityRawSha256 || review.liveCaptureAttestationRawSha256 !== result.liveCaptureAttestationRawSha256 || review.productionImport !== "HOLD" || review.resultRawSha256 !== resultRawSha256
    || result?.status !== "PASS" || result.productionImport !== "HOLD" || result.summary?.cells !== 36) return { status: "HOLD", reason: "INDEPENDENT_REVIEW_BINDING_INVALID", evidence: null };
  const coverage = new Map(runtimeCoverage.observations.map(row => [`${row.legacyId}:${row.roleClass}`, row]));
  const technical = new Map(runtimeTechnical.cells.map(cell => [`${cell.legacyId}:${cell.role}`, cell]));
  const roleClasses = { employee: "group_web_employee", manager: "group_web_manager", web_admin: "group_web_web_admin" };
  const items = mapping.items.filter(item => result.legacyIds.includes(item.legacyId)).map(item => ({
    legacyId: item.legacyId,
    status: "PASS",
    observations: roleOrder.map(role => {
      const page = coverage.get(`${item.legacyId}:${roleClasses[role]}`), runtime = technical.get(`${item.legacyId}:${role}`);
      if (!page || !runtime || runtime.runtimePageObservationSha256 !== page.observationSha256) throw new Error("GROUP_WEB_ROLE_UAT_ADAPTER_RUNTIME_BINDING_INVALID");
      return { role: roles[role], pageId: page.stableId, route: `/${item.legacyUrl.replace(/^\/+/, "")}`, observedAt: result.observedAt, artifactSha256: sha({ runtimePageObservationSha256: page.observationSha256, runtimeTechnical: runtime }) };
    })
  }));
  const evidence = { formatVersion: 1, contractKind: "yuzhou_hr_legacy_runtime_uat_evidence", status: "PASS", evidenceSource: "legacy_group_web_live_read_only_traversal", surface: "group_web", observedAt: result.observedAt, artifactSha256: "", items, productionImport: "HOLD" };
  evidence.artifactSha256 = createHash("sha256").update(JSON.stringify({ contractKind: evidence.contractKind, evidenceSource: evidence.evidenceSource, surface: evidence.surface, observedAt: evidence.observedAt, items: evidence.items })).digest("hex");
  return { status: "ELIGIBLE_LIVE_EXTERNAL", reason: null, evidence };
}

export function assessGroupWebRoleUatLegacyCoverage(mapping, root, inputs) {
  const adapted = adaptGroupWebRoleUatToLegacyRuntimeEvidence({ mapping, ...inputs });
  return { adapted, coverage: assessLegacyGroupWebImplementationCoverage(mapping, root, adapted.evidence ? { legacyRuntimeUatEvidence: adapted.evidence } : {}) };
}
