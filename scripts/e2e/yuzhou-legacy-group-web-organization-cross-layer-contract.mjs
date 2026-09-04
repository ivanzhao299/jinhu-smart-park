import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyGroupWebOrganizationCrossLayer,
  inspectLegacyGroupWebOrganizationCrossLayer,
  LegacyGroupWebOrganizationCrossLayerError,
  verifyLegacyGroupWebOrganizationCrossLayer,
} from "../hr-cutover/legacy-group-web-organization-cross-layer.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-organization-cross-layer-v1.json");
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
    (error) => error instanceof LegacyGroupWebOrganizationCrossLayerError && error.code === code,
  );

test("legacyId 2 binds the exact Group Web URL domain and modern HR route", () => {
  const selected = contract();
  const mapping = JSON.parse(readFileSync(resolve(root, selected.sourceBindings.legacyMapping.path), "utf8"));
  const entry = mapping.items.find((item) => item.legacyId === 2);
  assert.equal(entry.legacyUrl, "Organization/Orgchart/detail.asp?t=1");
  assert.equal(entry.domain, "organization");
  assert.equal(entry.ownership, "hr");
  assert.deepEqual(entry.targetRoutes, ["/hr/organization"]);
  assert.equal(entry.mappingStatus, "mapped");
});

test("static inspection verifies the complete route page API storage permission and responsive chain", () => {
  const selected = contract();
  const receipt = buildLegacyGroupWebOrganizationCrossLayer({ contract: selected, repositoryRoot: root });
  const byLayer = new Map(receipt.staticEvidence.layers.map((item) => [item.layer, item]));
  for (const name of [
    "legacy_entry",
    "modern_route",
    "page_tree_api_binding",
    "tree_controller",
    "tree_service",
    "storage_entity",
    "storage_migrations",
    "read_permissions",
    "responsive_shell",
    "organization_tree_390",
  ]) {
    assert.equal(byLayer.get(name)?.status, "verified_static", name);
  }
  assert.deepEqual(receipt.staticEvidence.gapCodes, []);
  assert.equal(receipt.status, "STATIC_CHAIN_COMPLETE_RUNTIME_PENDING");
});

test("legacy and modern browser runtime surfaces remain pending with zero credit", () => {
  const selected = contract();
  const receipt = buildLegacyGroupWebOrganizationCrossLayer({ contract: selected, repositoryRoot: root });
  assert.deepEqual(receipt.runtimeEvidence, [
    { surface: "legacy_group_web", status: "pending", evidenceSha256: null, compatibilityCredit: 0 },
    { surface: "modern_web_browser", status: "pending", evidenceSha256: null, compatibilityCredit: 0 },
  ]);
  assert.equal(receipt.staticEvidence.compatibilityCredit, 0);
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("missing layers and wrong tree read permission are detected as explicit gaps", () => {
  const selected = contract();
  const missingService = sources(selected);
  missingService.treeService = "export class OrgsService {}";
  const missing = inspectLegacyGroupWebOrganizationCrossLayer({ contract: selected, sources: missingService });
  assert.ok(missing.gapCodes.includes("ORG_TREE_SERVICE_MISSING"));

  const wrongPermission = sources(selected);
  wrongPermission.treeController = wrongPermission.treeController.replace(
    /@RequirePermissions\(SYSTEM_PERMISSIONS\.ORG_LIST\)/gu,
    "@RequirePermissions(SYSTEM_PERMISSIONS.ORG_DETAIL)",
  );
  const wrong = inspectLegacyGroupWebOrganizationCrossLayer({ contract: selected, sources: wrongPermission });
  assert.ok(wrong.gapCodes.includes("ORG_TREE_READ_PERMISSION_INVALID"));
  assert.ok(wrong.gapCodes.includes("ORG_TREE_CONTROLLER_MISSING"));
});

test("binding drift and attempts to promote static or runtime evidence fail closed", () => {
  const drift = contract();
  drift.sourceBindings.pageClient.sha256 = "0".repeat(64);
  rejects("GROUP_WEB_ORG_CROSS_LAYER_SOURCE_DRIFT", () =>
    buildLegacyGroupWebOrganizationCrossLayer({ contract: drift, repositoryRoot: root }),
  );

  const selected = contract();
  const receipt = buildLegacyGroupWebOrganizationCrossLayer({ contract: selected, repositoryRoot: root });
  const promotedStatic = structuredClone(receipt);
  promotedStatic.staticEvidence.compatibilityCredit = 1;
  rejects("GROUP_WEB_ORG_CROSS_LAYER_RECEIPT_DRIFT", () =>
    verifyLegacyGroupWebOrganizationCrossLayer({
      contract: selected,
      repositoryRoot: root,
      receipt: promotedStatic,
    }),
  );

  const promotedRuntime = structuredClone(receipt);
  promotedRuntime.runtimeEvidence[0] = {
    surface: "legacy_group_web",
    status: "verified",
    evidenceSha256: "a".repeat(64),
    compatibilityCredit: 1,
  };
  rejects("GROUP_WEB_ORG_CROSS_LAYER_RECEIPT_DRIFT", () =>
    verifyLegacyGroupWebOrganizationCrossLayer({
      contract: selected,
      repositoryRoot: root,
      receipt: promotedRuntime,
    }),
  );
});

test("receipt contains hashes and statuses without organization values people bodies or screenshots", () => {
  const receipt = buildLegacyGroupWebOrganizationCrossLayer({ contract: contract(), repositoryRoot: root });
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(
    serialized,
    /"(?:orgName|organizationName|employeeName|personId|username|password|credential|pageBody|screenshotBinary|base64)"\s*:/iu,
  );
  assert.equal(receipt.organizationNameValuesIncluded, false);
  assert.equal(receipt.personDataIncluded, false);
  assert.equal(receipt.credentialsIncluded, false);
  assert.equal(receipt.pageBodyIncluded, false);
  assert.equal(receipt.screenshotBinaryIncluded, false);
});
