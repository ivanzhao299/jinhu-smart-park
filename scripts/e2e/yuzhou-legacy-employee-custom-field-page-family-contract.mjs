import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  LegacyEmployeeCustomFieldPageFamilyError,
  verifyLegacyEmployeeCustomFieldPageFamily
} from "../hr-cutover/legacy-employee-custom-field-page-family.mjs";

const root = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-employee-custom-field-page-family-v1.json"), "utf8"));

test("employee custom-field page family binds Group Web navigation and safe modern desktop/mobile governance", () => {
  const report = verifyLegacyEmployeeCustomFieldPageFamily(contract, { root });
  assert.equal(report.ok, true);
  assert.equal(report.status, "IN_PROGRESS");
  assert.deepEqual(report.sourceNavigation, { denominator: 2, verified: 2 });
  assert.deepEqual(report.sourceInteractionParity, { denominator: 6, verified: 0 });
  assert.deepEqual(report.modernInteractions, { denominator: 7, verified: 7 });
  assert.deepEqual(report.responsiveStructures, { denominator: 2, verified: 2 });
  assert.deepEqual(report.positiveNegativeTests, { denominator: 7, verified: 7 });
  assert.deepEqual(report.endToEndLegacyInteractionParity, { denominator: 6, verified: 0 });
  assert.deepEqual(report.gapReasonCodes, [
    "LEGACY_INTERACTION_LOCATORS_NOT_ENUMERATED",
    "LEGACY_LIVE_RUNTIME_NOT_TRAVERSED",
    "LEGACY_VISUAL_EQUIVALENCE_NOT_VERIFIED"
  ]);
  assert.equal(report.compatibilityScoreContribution, 0);
  assert.equal(report.productionImport, "HOLD");
});

test("aggregate ASP transition counts cannot be promoted into granular or visual parity", () => {
  const promoted = structuredClone(contract);
  promoted.legacySourcePage.granularInteractionVerified = 6;
  promoted.acceptance.sourceInteractionParity.verified = 6;
  promoted.acceptance.endToEndLegacyInteractionParity.verified = 6;
  promoted.modernSurface.visualEquivalenceClaimed = true;
  promoted.status = "COMPLETE";
  promoted.compatibilityScoreContribution = 100;
  assert.throws(
    () => verifyLegacyEmployeeCustomFieldPageFamily(promoted, { root }),
    (error) => error instanceof LegacyEmployeeCustomFieldPageFamilyError && error.code === "PAGE_FAMILY_STATUS_INVALID"
  );
});

test("source evidence drift fails closed before a page family can receive credit", () => {
  const drifted = structuredClone(contract);
  drifted.sourceContracts[0].sha256 = "0".repeat(64);
  assert.throws(
    () => verifyLegacyEmployeeCustomFieldPageFamily(drifted, { root }),
    (error) => error instanceof LegacyEmployeeCustomFieldPageFamilyError && error.code === "PAGE_FAMILY_SOURCE_DRIFT"
  );
});

test("page family contract preserves exact field and rule denominators without claiming runtime value rendering", () => {
  assert.deepEqual(contract.legacyFieldFamily, {
    definitionSource: "dbo.defs",
    valueSource: "dbo.person",
    customFieldDefinitions: 19,
    logicColumnsPerDefinition: 10,
    logicCellDenominator: 190,
    reviewedMappingCount: 19,
    runtimeValueRenderingVerified: 0
  });
});
