import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  physicalMeasurementMaterializationGaps,
  validateLegacyEmployeeProfilePhysicalMeasurementsGapContract,
} from "../hr-cutover/legacy-employee-profile-physical-measurements-gap.mjs";
import {
  assertT5NonfilePhysicalMeasurementGapBoundary,
  ProductionImportT5NonfileStageAdapterError,
} from "../hr-cutover/production-import-t5-nonfile-stage-adapter.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("scripts/hr-cutover/contracts/legacy-employee-profile-physical-measurements-gap-v1.json"));

test("physical measurements remain a zero-credit gap until source units and conversion are reviewed", () => {
  const reviewed = validateLegacyEmployeeProfilePhysicalMeasurementsGapContract(contract);
  assert.equal(reviewed.reviewedMappingContractSha256, createHash("sha256").update(read(reviewed.reviewedMappingContract)).digest("hex"));
  assert.equal(reviewed.compatibilityCredit, 0);
  assert.equal(reviewed.stagedGapReasonCode, "UNKNOWN_FIELD_SEMANTICS");
  assert.deepEqual(reviewed.sourceFields, ["person.stature", "person.weight"]);
  assert.deepEqual(reviewed.intendedTargetFields, ["hr_employee_profile.height_cm", "hr_employee_profile.weight_kg"]);
  assert.deepEqual(physicalMeasurementMaterializationGaps({ stature: null, weight: "  " }), []);

  const gaps = physicalMeasurementMaterializationGaps({ stature: "synthetic-stature", weight: "synthetic-weight" });
  assert.deepEqual(gaps, [
    { fieldLocator: "person.stature", reasonCode: "UNKNOWN_FIELD_SEMANTICS" },
    { fieldLocator: "person.weight", reasonCode: "UNKNOWN_FIELD_SEMANTICS" },
  ]);
  assert.doesNotMatch(JSON.stringify(gaps), /synthetic/u);
});

test("private stage rejects attempted physical-measurement injection", () => {
  assert.deepEqual(assertT5NonfilePhysicalMeasurementGapBoundary({ healthStatus: null }), { healthStatus: null });
  for (const injected of [{ heightCm: "170" }, { weightKg: "60" }]) {
    assert.throws(
      () => assertT5NonfilePhysicalMeasurementGapBoundary(injected),
      error => error instanceof ProductionImportT5NonfileStageAdapterError
        && error.code === "PRODUCTION_IMPORT_T5_NONFILE_STAGE_INVALID",
    );
  }
});

test("read-only extraction retains the source columns while writer and rollback stay fail-closed", () => {
  const extractor = read("scripts/extract-yuzhou-t5-legacy-history.sh");
  const transform = read("scripts/transform-yuzhou-t5-legacy-history.mjs");
  const writer = read("scripts/hr-cutover/production-import-t5-nonfile-writer.mjs");
  const rollback = read("scripts/hr-cutover/production-import-t5-nonfile-rollback.mjs");

  assert.match(extractor, /query person_core\.raw\.json[\s\S]*sys\.columns/u);
  assert.match(extractor, /c\.name NOT IN\('password','photo'\)/u);
  assert.match(transform, /physicalMeasurementMaterializationGaps\(row\)/u);
  assert.doesNotMatch(writer, /"height_cm"|"weight_kg"/u);
  assert.match(rollback, /map\.batch_id=\$1::uuid/u);
  assert.match(rollback, /map\.target_id=target\.id/u);
  assert.match(rollback, /hr_employee_profile/u);
});
