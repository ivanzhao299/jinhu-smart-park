import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyEmploymentEventCrossLayer,
  inspectLegacyEmploymentEventCrossLayer,
  LegacyEmploymentEventCrossLayerError,
  verifyLegacyEmploymentEventCrossLayer,
} from "../hr-cutover/legacy-employment-event-cross-layer.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-employment-event-cross-layer-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const sources = (selected = contract()) =>
  Object.fromEntries(
    Object.entries(selected.sourceBindings).map(([key, binding]) => [
      key,
      readFileSync(resolve(root, binding.path), "utf8"),
    ]),
  );
const rejects = (code, action) =>
  assert.throws(
    action,
    (error) => error instanceof LegacyEmploymentEventCrossLayerError && error.code === code,
  );

test("M4 binds the hash-only source manifest and dbo.readjust mapping to hr_employment_event", () => {
  const selected = contract();
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract: selected, repositoryRoot: root });
  const byLayer = new Map(receipt.staticEvidence.layers.map((item) => [item.layer, item]));
  for (const name of ["source_manifest", "source_mapping", "controlled_transform", "target_loader"])
    assert.equal(byLayer.get(name)?.status, "verified_static", name);
  assert.deepEqual(receipt.identity, {
    milestone: "M4",
    sourceTable: "dbo.readjust",
    targetTable: "hr_employment_event",
    mappedRoute: "/hr/lifecycle",
    detailRoute: "/hr/employees",
  });
});

test("target migrations entity controller service and modern routes form a static read-write chain", () => {
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract: contract(), repositoryRoot: root });
  const byLayer = new Map(receipt.staticEvidence.layers.map((item) => [item.layer, item]));
  for (const name of [
    "target_schema",
    "target_entity",
    "api_controller",
    "api_service",
    "frontend_routes",
    "frontend_read_write_surface",
  ]) assert.equal(byLayer.get(name)?.status, "verified_static", name);
});

test("employee-event detail projection and required audit close both static gaps without credit", () => {
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract: contract(), repositoryRoot: root });
  const byLayer = new Map(receipt.staticEvidence.layers.map((item) => [item.layer, item]));
  assert.equal(byLayer.get("detail_response_projection")?.status, "verified_static");
  assert.equal(byLayer.get("detail_required_audit")?.status, "verified_static");
  assert.deepEqual(receipt.staticEvidence.gapCodes, []);
  assert.equal(receipt.staticEvidence.expectedGapCodesMatched, true);
  assert.equal(receipt.staticEvidence.compatibilityCredit, 0);
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.status, "STATIC_CHAIN_COMPLETE_RUNTIME_PENDING");
});

test("runtime source role desktop and 390 evidence remain pending and production import remains HOLD", () => {
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract: contract(), repositoryRoot: root });
  assert.deepEqual(receipt.runtimeEvidence, [
    { surface: "source_readonly_runtime", status: "pending", evidenceSha256: null, compatibilityCredit: 0 },
    { surface: "api_role_matrix", status: "pending", evidenceSha256: null, compatibilityCredit: 0 },
    { surface: "modern_web_desktop", status: "pending", evidenceSha256: null, compatibilityCredit: 0 },
    { surface: "modern_web_390", status: "pending", evidenceSha256: null, compatibilityCredit: 0 },
  ]);
  assert.deepEqual(receipt.freezeEvidence, {
    milestone: "M4",
    status: "pending",
    reasonCode: "M4_CURRENT_HASH_BOUND_RUNTIME_EVIDENCE_REQUIRED",
    compatibilityCredit: 0,
  });
  assert.equal(receipt.productionImport, "HOLD");
});

test("inspection detects a broken source mapping loader and frontend binding", () => {
  const selected = contract();
  const broken = sources(selected);
  broken.sourceReviewedMapping = broken.sourceReviewedMapping.replace('"readjust.no": "legacy_event_no"', '"readjust.no": "unknown"');
  broken.targetLoader = "#!/usr/bin/env sh\nexit 0\n";
  broken.employeeClient = "export function HrEmployeesClient(){return null}\n";
  const result = inspectLegacyEmploymentEventCrossLayer({ contract: selected, sources: broken });
  assert.ok(result.gapCodes.includes("EMPLOYMENT_EVENT_SOURCE_MAPPING_MISSING"));
  assert.ok(result.gapCodes.includes("EMPLOYMENT_EVENT_TARGET_LOADER_MISSING"));
  assert.ok(result.gapCodes.includes("EMPLOYMENT_EVENT_FRONTEND_SURFACE_MISSING"));
});

test("removing the projection and audit evidence reopens only the two closed product gaps", () => {
  const selected = contract();
  const broken = sources(selected);
  broken.apiController = broken.apiController.replace("@CurrentUser()u:JwtPrincipal,", "");
  broken.apiService = broken.apiService.replace("rows.map(projectHrEmploymentEvent)", "rows").replace("await recordHrSensitiveRead", "await Promise.resolve");
  broken.apiDto = "export interface HrEmploymentEventResponseDto { id:string; }\n";
  const result = inspectLegacyEmploymentEventCrossLayer({ contract: selected, sources: broken });
  assert.equal(result.layers.find((item) => item.layer === "detail_response_projection")?.status, "gap");
  assert.equal(result.layers.find((item) => item.layer === "detail_required_audit")?.status, "gap");
  assert.ok(result.gapCodes.includes("EMPLOYMENT_EVENT_DETAIL_RESPONSE_PROJECTION_MISSING"));
  assert.ok(result.gapCodes.includes("EMPLOYMENT_EVENT_DETAIL_REQUIRED_AUDIT_MISSING"));
});

test("hash drift and receipt credit promotion fail closed", () => {
  const drift = contract();
  drift.sourceBindings.apiService.sha256 = "0".repeat(64);
  rejects("LEGACY_EMPLOYMENT_EVENT_SOURCE_DRIFT", () =>
    buildLegacyEmploymentEventCrossLayer({ contract: drift, repositoryRoot: root }),
  );

  const selected = contract();
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract: selected, repositoryRoot: root });
  const promoted = structuredClone(receipt);
  promoted.runtimeEvidence[0] = {
    surface: "source_readonly_runtime",
    status: "verified",
    evidenceSha256: "a".repeat(64),
    compatibilityCredit: 1,
  };
  rejects("LEGACY_EMPLOYMENT_EVENT_RECEIPT_DRIFT", () =>
    verifyLegacyEmploymentEventCrossLayer({ contract: selected, repositoryRoot: root, receipt: promoted }),
  );
});

test("receipt contains only structural identifiers hashes statuses and implementation slices", () => {
  const receipt = buildLegacyEmploymentEventCrossLayer({ contract: contract(), repositoryRoot: root });
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(
    serialized,
    /"(?:sourceRow|sourcePayload|employeeName|personName|fullName|username|password|credential|pageBody|screenshotBinary|base64)"\s*:/iu,
  );
  assert.equal(receipt.sourceRowsIncluded, false);
  assert.equal(receipt.personDataIncluded, false);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.pageBodyIncluded, false);
  assert.equal(receipt.screenshotBinaryIncluded, false);
  assert.deepEqual(receipt.nextImplementationSlices.map((item) => item.stableId), ["M4_EMPLOYMENT_EVENT_RUNTIME_PARITY"]);
});
