const SOURCE_FIELDS = Object.freeze(["stature", "weight"]);
const SHA256 = /^[0-9a-f]{64}$/u;

export class LegacyEmployeeProfilePhysicalMeasurementsGapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyEmployeeProfilePhysicalMeasurementsGapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyEmployeeProfilePhysicalMeasurementsGapError(code, detail); };
const normalized = value => value === null || value === undefined ? null : String(value).trim() || null;

export function validateLegacyEmployeeProfilePhysicalMeasurementsGapContract(contract) {
  if (contract?.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_employee_profile_physical_measurements_gap"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.reviewedMappingContract !== "scripts/hr-cutover/contracts/legacy-employee-profile-materialization-reviewed-v1.json"
    || !SHA256.test(contract.reviewedMappingContractSha256 ?? "")
    || contract.fieldFamily !== "physical_measurements"
    || JSON.stringify(contract.sourceFields) !== JSON.stringify(SOURCE_FIELDS.map(field => `person.${field}`))
    || JSON.stringify(contract.intendedTargetFields) !== JSON.stringify(["hr_employee_profile.height_cm", "hr_employee_profile.weight_kg"])
    || contract.reviewStatus !== "gap"
    || contract.reasonCode !== "SOURCE_UNIT_SEMANTICS_UNCONFIRMED"
    || contract.stagedGapReasonCode !== "UNKNOWN_FIELD_SEMANTICS"
    || JSON.stringify(contract.missingEvidence) !== JSON.stringify(["reviewed_source_unit_contract", "reviewed_conversion_and_rounding_contract"])
    || contract.pipelineDisposition?.extract !== "read_only_person_core_residue"
    || contract.pipelineDisposition?.transform !== "redacted_gap_without_raw_value"
    || contract.pipelineDisposition?.privateStage !== "field_family_forbidden"
    || contract.pipelineDisposition?.writer !== "not_allowlisted"
    || contract.pipelineDisposition?.rollback !== "hr_employee_profile_active_record_map_only"
    || contract.compatibilityCredit !== 0
    || JSON.stringify(contract.filesExcluded) !== JSON.stringify(["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("LEGACY_EMPLOYEE_PROFILE_PHYSICAL_MEASUREMENTS_GAP_CONTRACT_INVALID", "physical measurement gap contract differs");
  }
  return contract;
}

/**
 * Keeps source values in the private read-only row while emitting only field
 * locators and a stable gap code. Values and guessed units never cross into
 * the transformed/private production stage.
 */
export function physicalMeasurementMaterializationGaps(row) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    fail("LEGACY_EMPLOYEE_PROFILE_PHYSICAL_MEASUREMENTS_SOURCE_INVALID", "source row must be an object");
  }
  return SOURCE_FIELDS
    .filter(field => normalized(row[field]) !== null)
    .map(field => Object.freeze({ fieldLocator: `person.${field}`, reasonCode: "UNKNOWN_FIELD_SEMANTICS" }));
}
