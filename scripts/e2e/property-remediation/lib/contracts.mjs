import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { decodeJsonFile, validateSchema } from "./strict-decoder.mjs";

const contractsRoot = resolve(
  "scripts/e2e/property-remediation/contracts"
);

export function decodeContractFile(valuePath, schemaName) {
  const value = decodeJsonFile(resolve(valuePath));
  const schema = decodeJsonFile(resolve(contractsRoot, schemaName));
  return validateSchema(value, schema, valuePath);
}

export function validateTraceability() {
  const value = decodeContractFile(
    "scripts/e2e/property-remediation/traceability/a-base-requirements.json",
    "traceability.schema.json"
  );
  const requirementIds = new Set();
  const catalog = decodeContractFile(
    "scripts/e2e/property-remediation/traceability/a-base-evidence-catalog.json",
    "evidence-catalog.schema.json"
  );
  const catalogTests = new Set(catalog.test_ids);
  const catalogEvidence = new Set(catalog.evidence_ids);
  const testSources = [
    "scripts/e2e/property-remediation/tests/a-base-contract.spec.mjs",
    "scripts/e2e/property-remediation/tests/a-base-runtime.spec.mjs"
  ].map((path) => readFileSync(resolve(path), "utf8")).join("\n");
  for (const requirement of value.requirements) {
    if (requirementIds.has(requirement.requirement_id)) {
      throw new Error(
        `duplicate traceability requirement ${requirement.requirement_id}`
      );
    }
    requirementIds.add(requirement.requirement_id);
    if (requirement.waiver !== null) {
      throw new Error(
        `A-base core does not accept a waiver for ${requirement.requirement_id}`
      );
    }
    for (const testId of [
      ...requirement.positive_test_ids,
      ...requirement.negative_test_ids
    ]) {
      if (!catalogTests.has(testId) || !testSources.includes(testId)) {
        throw new Error(
          `${requirement.requirement_id}: unresolved test reference ${testId}`
        );
      }
    }
    for (const evidenceId of requirement.evidence_ids) {
      if (!catalogEvidence.has(evidenceId)) {
        throw new Error(
          `${requirement.requirement_id}: unresolved evidence reference ${evidenceId}`
        );
      }
    }
  }
  return { traceability: value, catalog };
}
